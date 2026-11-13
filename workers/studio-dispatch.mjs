import { applyCopy, copyDigest, path, sha } from './studio-copy.mjs';
import { budget, propose, reservation } from './studio-provider.mjs';
import { appToken, publish, sourceAt } from './studio-publisher.mjs';

const contextFiles = ['AGENTS.md', 'design/BRAND.md', 'sites/personal/AGENTS.md'];
const scope = "t.kind = 'edit' AND t.project = 'personal' AND (t.page IS NULL OR t.page IN ('/', 'https://zanegiordano.com', 'https://zanegiordano.com/'))";
const plus = (date, minutes) => new Date(date.getTime() + minutes * 60_000).toISOString();
const iso = date => date.toISOString();

export function configured(env) {
  return env.STUDIO_EXECUTION_ENABLED === 'true' && env.DB && budget(env) &&
    sha(env.STUDIO_BASE_SHA) && /^https:\/\/[a-z0-9-]+\.run\.app$/.test(env.STUDIO_CHECK_ORIGIN ?? '') &&
    env.STUDIO_CHECK_SECRET?.length >= 32 && env.STUDIO_OPENAI_KEY &&
    /^\d+$/.test(env.STUDIO_GITHUB_APP_ID ?? '') && /^\d+$/.test(env.STUDIO_GITHUB_INSTALLATION_ID ?? '') &&
    env.STUDIO_GITHUB_PRIVATE_KEY?.includes('PRIVATE KEY-----');
}

export async function acquire(db, env, now) {
  if (!budget(env) || !sha(env.STUDIO_BASE_SHA)) return null;
  const at = iso(now);
  const month = at.slice(0, 7);
  const lock = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO execution_dispatch (task_id, base_sha, month, reserved_micros, phase, deadline)
      SELECT e.task_id, ?, ?, ?, 'prepare', ? FROM task_executions e JOIN tasks t ON t.id = e.task_id
      WHERE e.state = 'queued' AND t.status = 'submitted' AND e.available_at <= ? AND ${scope}
        AND NOT EXISTS (SELECT 1 FROM execution_dispatch WHERE phase <> 'done')
        AND ? + COALESCE((SELECT SUM(reserved_micros) FROM execution_dispatch WHERE month = ?), 0) <= ?
      ORDER BY e.priority DESC, e.available_at, e.task_id LIMIT 1`)
      .bind(env.STUDIO_BASE_SHA, month, reservation, plus(now, 90), at, reservation, month, budget(env)),
    db.prepare(`UPDATE execution_dispatch SET lock_id = ?, lock_until = ?, attempts = attempts + 1
      WHERE phase <> 'done' AND (lock_until IS NULL OR lock_until <= ?)`).bind(lock, plus(now, 10), at),
    db.prepare(`UPDATE task_executions SET state = 'running', started_at = ?, updated_at = ?, claim_id = ?, lease_until = ?
      WHERE state = 'queued' AND task_id = (SELECT task_id FROM execution_dispatch WHERE lock_id = ?)`)
      .bind(at, at, lock, plus(now, 90), lock),
  ]);
  return db.prepare(`SELECT d.*, t.description, e.started_at FROM execution_dispatch d
    JOIN tasks t ON t.id = d.task_id JOIN task_executions e ON e.task_id = d.task_id
    WHERE d.lock_id = ?`).bind(lock).first();
}

async function update(db, run, from, set, args = []) {
  const result = await db.prepare(`UPDATE execution_dispatch SET ${set}
    WHERE task_id = ? AND lock_id = ? AND phase = ? RETURNING task_id`)
    .bind(...args, run.task_id, run.lock_id, from).all();
  return result.results.length === 1;
}

async function finish(db, run, now, failure, number = null) {
  const at = iso(now);
  await db.batch([
    db.prepare(`UPDATE task_executions SET state = ?, failure_code = ?, pr_number = ?,
      check_status = ?, updated_at = ?, finished_at = ?
      WHERE task_id = ? AND EXISTS (SELECT 1 FROM execution_dispatch
        WHERE task_id = ? AND lock_id = ? AND phase <> 'done')`)
      .bind(failure ? 'failed' : 'pr_ready', failure, number,
        failure === 'checks_failed' ? 'failed' : failure ? null : 'passed',
        at, at, run.task_id, run.task_id, run.lock_id),
    db.prepare("UPDATE execution_dispatch SET phase = 'done', lock_id = NULL, lock_until = NULL WHERE task_id = ? AND lock_id = ?")
      .bind(run.task_id, run.lock_id),
  ]);
}

async function validate(env, run, fetcher) {
  const response = await fetcher(env.STUDIO_CHECK_ORIGIN + '/check', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300_000),
    headers: { Authorization: 'Bearer ' + env.STUDIO_CHECK_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base: run.base_sha, replacement: run.replacement }),
  });
  if (!response.ok) throw new Error('Validator unavailable');
  const result = await response.json();
  if (result.base !== run.base_sha || typeof result.passed !== 'boolean') throw new Error('Invalid check result');
  if (result.passed) {
    const source = await sourceAt(run.base_sha, path, fetcher);
    if (result.digest !== await copyDigest(applyCopy(source, run.replacement))) throw new Error('Wrong checked artifact');
  }
  return result.passed;
}

export async function tick(env, { fetcher = fetch, now = () => new Date() } = {}) {
  if (!configured(env)) return;
  const db = env.DB.withSession('first-primary');
  const run = await acquire(db, env, now());
  if (!run) return;
  let phase = run.phase;
  try {
    if (phase === 'model_sent') return await finish(db, run, now(), 'execution_failed');
    if (run.deadline <= iso(now()) && phase !== 'publish') return await finish(db, run, now(), 'lease_expired');
    // After the publication window, only look for an existing draft.
    if (phase === 'publish') {
      const source = await sourceAt(run.base_sha, path, fetcher);
      const token = await appToken(env, fetcher);
      const number = await publish(run, source, token, fetcher, { recoverOnly: run.deadline <= iso(now()) });
      return await finish(db, run, now(), number ? null : 'lease_expired', number);
    }
    if (phase === 'prepare') {
      const context = Object.fromEntries(await Promise.all([...contextFiles, path].map(async file =>
        [file, await sourceAt(run.base_sha, file, fetcher)])));
      const time = now();
      if (iso(time).slice(0, 7) !== run.month ||
          plus(time, 2).slice(0, 7) !== run.month) return await finish(db, run, time, 'execution_failed');
      // Persist before sending; an ambiguous or interrupted model call is never repeated.
      if (!await update(db, run, phase, "phase = 'model_sent'")) return;
      phase = 'model_sent';
      const artifact = await propose(env.STUDIO_OPENAI_KEY, context, run, fetcher);
      applyCopy(context[path], artifact.replacement);
      await db.batch([
        db.prepare(`UPDATE task_executions SET state = 'validating', updated_at = ?
          WHERE task_id = ? AND EXISTS (SELECT 1 FROM execution_dispatch
            WHERE task_id = ? AND lock_id = ? AND phase = 'model_sent')`)
          .bind(iso(now()), run.task_id, run.task_id, run.lock_id),
        db.prepare(`UPDATE execution_dispatch SET phase = 'check', replacement = ?, input_tokens = ?, output_tokens = ?,
          lock_id = NULL, lock_until = NULL WHERE task_id = ? AND lock_id = ? AND phase = 'model_sent'`)
          .bind(artifact.replacement, artifact.input, artifact.output, run.task_id, run.lock_id),
      ]);
      return;
    }
    const passed = await validate(env, run, fetcher);
    if (!passed) {
      await update(db, run, phase, "check_summary = 'Repository checks failed'");
      return await finish(db, run, now(), 'checks_failed');
    }
    await update(db, run, phase, "phase = 'publish', check_summary = 'Repository checks passed', lock_id = NULL, lock_until = NULL");
  } catch {
    if (phase === 'model_sent' || (run.attempts >= 5 && phase !== 'publish')) {
      await finish(db, run, now(), 'execution_failed');
    } else {
      // Retry safe operations with bounded delay. Keep ambiguous publishing
      // active so a later poll can reconcile it without opening another PR.
      await update(db, run, phase, 'lock_until = ?', [plus(now(), Math.min(run.attempts, 10))]);
    }
  }
}
