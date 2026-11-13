// Internal D1 operations only. No public claim endpoint or scheduled consumer.
export async function claimExecution(db, now = new Date()) {
  const at = now.toISOString();
  const lease = new Date(now.getTime() + 15 * 60_000).toISOString();
  const claim = crypto.randomUUID();
  const [result, task] = await db.batch([
    db.prepare(`UPDATE task_executions
      SET state = 'running', claim_id = ?, lease_until = ?, started_at = ?, updated_at = ?
      WHERE task_id = (SELECT task_id FROM task_executions
        WHERE state = 'queued' AND available_at <= ?
        ORDER BY priority DESC, available_at, task_id LIMIT 1) AND state = 'queued'
      RETURNING task_id`).bind(claim, lease, at, at, at),
    db.prepare(`SELECT t.id, t.project, t.page, t.description, t.asap FROM task_executions e
      JOIN tasks t ON t.id = e.task_id WHERE e.claim_id = ?`).bind(claim),
  ]);
  return result.results.length ? { ...task.results[0], claim, lease } : null;
}

export async function transitionExecution(db, id, claim, state, output = {}, now = new Date()) {
  const prior = { validating: ['running'], pr_ready: ['validating'], failed: ['running', 'validating'] };
  if (!Object.hasOwn(prior, state)) throw new TypeError('Invalid execution transition');
  if (state === 'pr_ready' && (!Number.isSafeInteger(output.prNumber) || output.prNumber < 1)) {
    throw new TypeError('Invalid pull request number');
  }
  if (state === 'failed' && !['execution_failed', 'checks_failed'].includes(output.failureCode)) {
    throw new TypeError('Invalid failure code');
  }
  const at = now.toISOString();
  const terminal = state !== 'validating';
  const result = await db.prepare(`UPDATE task_executions SET state = ?, updated_at = ?,
    finished_at = ?, pr_number = ?, check_status = ?, failure_code = ?
    WHERE task_id = ? AND claim_id = ? AND lease_until > ? AND state IN (?, ?) RETURNING task_id`)
    .bind(state, at, terminal ? at : null, state === 'pr_ready' ? output.prNumber : null,
      state === 'pr_ready' ? 'passed' : output.failureCode === 'checks_failed' && state === 'failed' ? 'failed' : null,
      state === 'failed' ? output.failureCode : null,
      id, claim, at, prior[state][0], prior[state].at(-1)).all();
  return result.results.length === 1;
}

// Safe before an external executor exists. Reconciliation must replace this
// terminal timeout policy before dispatch can start an external side effect.
export async function expireExecutions(db, now = new Date()) {
  const at = now.toISOString();
  return db.prepare(`UPDATE task_executions SET state = 'failed', failure_code = 'lease_expired',
    finished_at = ?, updated_at = ? WHERE state IN ('running', 'validating') AND lease_until <= ?`)
    .bind(at, at, at).run();
}
