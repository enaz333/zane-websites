CREATE TABLE execution_dispatch (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES task_executions(task_id),
  base_sha TEXT NOT NULL,
  month TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL CHECK (reserved_micros BETWEEN 1 AND 2000000),
  phase TEXT NOT NULL CHECK (phase IN ('prepare', 'model_sent', 'check', 'publish', 'done')),
  replacement TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  check_summary TEXT,
  lock_id TEXT,
  lock_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  deadline TEXT NOT NULL
);
CREATE INDEX dispatch_budget ON execution_dispatch (month);
CREATE UNIQUE INDEX dispatch_one_active ON execution_dispatch ((1)) WHERE phase <> 'done';
