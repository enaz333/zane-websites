import { applyCopy, copyDigest, path, sha } from './studio-copy.mjs';
import { budget, propose } from './studio-provider.mjs';
import { appToken, publish, sourceAt } from './studio-publisher.mjs';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const smokeReplacement = 'Studio validator smoke test';
const contextFiles = ['AGENTS.md', 'design/BRAND.md', 'sites/personal/AGENTS.md'];
const scope = "t.kind = 'edit' AND t.project = 'personal' AND (t.page IS NULL OR t.page IN ('/', 'https://zanegiordano.com', 'https://zanegiordano.com/'))";
const plus = (date, minutes) => new Date(date.getTime() + minutes * 60_000).toISOString();
const iso = date => date.toISOString();

const validatorOrigin = 'https://studio-validator-staging-7a3kki4cka-uc.a.run.app';

function configurationFailure(env) {
  if (env.STUDIO_EXECUTION_ENABLED === 'false') return 'execution_disabled';
  if (env.STUDIO_EXECUTION_ENABLED !== 'true') return 'invalid_execution_flag';
  if (!uuid(env.STUDIO_STAGING_ID)) return 'invalid_staging_id';
  if (!uuid(env.STUDIO_TEST_TASK_ID)) return 'invalid_task_id';
  if (typeof env.DB?.withSession !== 'function') return 'missing_staging_database';
  if (!budget(env)) return 'invalid_budget';
  if (!sha(env.STUDIO_BASE_SHA)) return 'invalid_base_sha';
  if (env.STUDIO_CHECK_ORIGIN !== validatorOrigin) return 'invalid_validator_origin';
  if (typeof env.STUDIO_CHECK_SECRET !== 'string' || env.STUDIO_CHECK_SECRET.length < 32) {
    return 'invalid_checker_secret';
  }
  if (typeof env.STUDIO_OPENAI_KEY !== 'string' || !env.STUDIO_OPENAI_KEY.trim()) return 'missing_model_key';
  if (!/^\d+$/.test(env.STUDIO_GITHUB_APP_ID ?? '')) return 'invalid_app_id';
  if (!/^\d+$/.test(env.STUDIO_GITHUB_INSTALLATION_ID ?? '')) return 'invalid_installation_id';
  if (typeof env.STUDIO_GITHUB_PRIVATE_KEY !== 'string' || !env.STUDIO_GITHUB_PRIVATE_KEY.includes('PRIVATE KEY-----')) {
    return 'invalid_app_key';
  }
  return null;
}

export function configured(env) {
  return configurationFailure(env) === null;
}

export async function acquire(db, env, now) {
  const limits = budget(env);
  if (!limits || !sha(env.STUDIO_BASE_SHA) || !uuid(env.STUDIO_STAGING_ID) || !uuid(env.STUDIO_TEST_TASK_ID)) return null;
  const at = iso(now);
  const month = at.slice(0, 7);
  const { reservation } = limits;
  const lock = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO execution_dispatch (task_id, base_sha, month, reserved_micros, phase, deadline)
      SELECT e.task_id, ?, ?, ?, 'prepare', ? FROM task_executions e JOIN tasks t ON t.id = e.task_id
      WHERE e.state = 'queued' AND t.status = 'submitted' AND e.available_at <= ? AND ${scope}
        AND e.task_id = ? AND EXISTS (SELECT 1 FROM studio_dispatch_environment WHERE id = 1 AND staging_id = ?)
        AND NOT EXISTS (SELECT 1 FROM execution_dispatch WHERE task_id = e.task_id)
        AND NOT EXISTS (SELECT 1 FROM execution_dispatch WHERE phase <> 'done')
        AND ? + COALESCE((SELECT SUM(reserved_micros) FROM execution_dispatch WHERE month = ?), 0) <= ?
      ORDER BY e.priority DESC, e.available_at, e.task_id LIMIT 1`)
      .bind(env.STUDIO_BASE_SHA, month, reservation, plus(now, 90), at, env.STUDIO_TEST_TASK_ID, env.STUDIO_STAGING_ID, reservation, month, limits.month),
    db.prepare(`UPDATE execution_dispatch SET lock_id = ?, lock_until = ?, attempts = attempts + 1
      WHERE phase <> 'done' AND task_id = ?
        AND EXISTS (SELECT 1 FROM studio_dispatch_environment WHERE id = 1 AND staging_id = ?)
        AND (lock_until IS NULL OR lock_until <= ?)`).bind(lock, plus(now, 16), env.STUDIO_TEST_TASK_ID, env.STUDIO_STAGING_ID, at),
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

// Only fixed stage codes and numeric HTTP statuses reach Workers Logs.
class PrepareFailure extends Error {
  constructor(code, status = null) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function prepareFetch(fetcher, stage) {
  return async (url, options) => {
    let response;
    try {
      response = await fetcher(url, options);
    } catch (error) {
      const timedOut = options.signal.aborted || error?.name === 'TimeoutError';
      throw new PrepareFailure(stage + (timedOut ? '_timeout' : '_request_error'));
    }
    if (response.status !== 200) {
      const status = response.status;
      throw new PrepareFailure(stage + '_http_error',
        Number.isInteger(status) && status >= 100 && status <= 599 ? status : null);
    }
    return response;
  };
}

async function prepareSource(base, file, fetcher) {
  try {
    return await sourceAt(base, file, prepareFetch(fetcher, 'github_source'));
  } catch (error) {
    if (error instanceof PrepareFailure) throw error;
    throw new PrepareFailure(error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'github_source_timeout' : 'github_source_invalid_response');
  }
}

async function validate(env, run, fetcher, preflightSource) {
  const response = await fetcher(env.STUDIO_CHECK_ORIGIN + '/check', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300_000),
    headers: { Authorization: 'Bearer ' + env.STUDIO_CHECK_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base: run.base_sha, replacement: run.replacement }),
  });
  if (!response.ok) throw new Error('Validator unavailable');
  const result = await response.json();
  if (result.base !== run.base_sha || typeof result.passed !== 'boolean') throw new Error('Invalid check result');
  if (result.passed) {
    const source = preflightSource ?? await sourceAt(run.base_sha, path, fetcher);
    if (result.digest !== await copyDigest(applyCopy(source, run.replacement))) throw new Error('Wrong checked artifact');
  }
  return result.passed;
}

export async function tick(env, { fetcher = fetch, now = () => new Date() } = {}) {
  const failure = configurationFailure(env);
  if (failure) {
    if (failure !== 'execution_disabled') console.warn('studio_dispatch_config', failure);
    return;
  }
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
        [file, await prepareSource(run.base_sha, file, fetcher)])));
      let passed;
      try {
        passed = await validate(env, { ...run, replacement: smokeReplacement },
          prepareFetch(fetcher, 'validator'), context[path]);
      } catch (error) {
        if (error instanceof PrepareFailure) throw error;
        throw new PrepareFailure(error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? 'validator_timeout' : 'validator_invalid_response');
      }
      if (!passed) {
        console.warn('studio_dispatch_prepare', 'validator_checks_failed');
        return await finish(db, run, now(), 'checks_failed');
      }
      const time = now();
      if (run.deadline <= iso(time)) return await finish(db, run, time, 'lease_expired');
      if (iso(time).slice(0, 7) !== run.month ||
          plus(time, 2).slice(0, 7) !== run.month) return await finish(db, run, time, 'execution_failed');
      // Persist before sending; an ambiguous or interrupted model call is never repeated.
      if (!await update(db, run, phase, "phase = 'model_sent'")) return;
      phase = 'model_sent';
      const artifact = await propose(env, context, run, fetcher);
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
  } catch (error) {
    if (phase === 'prepare') {
      if (error instanceof PrepareFailure) console.warn('studio_dispatch_prepare', error.code, error.status);
      else console.warn('studio_dispatch_prepare', 'unexpected_prepare_failure');
    }
    if (phase === 'model_sent' || (run.attempts >= 5 && phase !== 'publish')) {
      await finish(db, run, now(), 'execution_failed');
    } else {
      // Retry safe operations with bounded delay. Keep ambiguous publishing
      // active so a later poll can reconcile it without opening another PR.
      await update(db, run, phase, 'lock_until = ?', [plus(now(), Math.min(run.attempts, 10))]);
    }
  }
}
