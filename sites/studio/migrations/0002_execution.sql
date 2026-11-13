-- Separate from intake so the previous Worker can still read and cancel tasks.
CREATE TABLE task_executions (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES tasks(id),
  priority INTEGER NOT NULL CHECK (priority IN (0, 1)),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'running', 'validating', 'pr_ready', 'failed', 'cancelled')),
  available_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  claim_id TEXT,
  lease_until TEXT,
  pr_number INTEGER CHECK (pr_number > 0),
  check_status TEXT CHECK (check_status IN ('passed', 'failed')),
  failure_code TEXT CHECK (failure_code IN ('execution_failed', 'checks_failed', 'lease_expired')),
  CHECK ((state = 'pr_ready') = (pr_number IS NOT NULL)),
  CHECK (state <> 'pr_ready' OR check_status IS 'passed'),
  CHECK ((state = 'failed') = (failure_code IS NOT NULL))
);
CREATE INDEX executions_ready ON task_executions (priority DESC, available_at, task_id)
  WHERE state = 'queued';
CREATE INDEX executions_leased ON task_executions (lease_until)
  WHERE state IN ('running', 'validating');

CREATE TABLE execution_events (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task_executions(task_id),
  state TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX execution_events_by_task ON execution_events (task_id, id);
CREATE TRIGGER audit_execution_queue AFTER INSERT ON task_executions BEGIN
  INSERT INTO execution_events (task_id, state, occurred_at)
    VALUES (NEW.task_id, NEW.state, NEW.updated_at);
END;
CREATE TRIGGER audit_execution_transition AFTER UPDATE OF state ON task_executions
WHEN OLD.state <> NEW.state BEGIN
  INSERT INTO execution_events (task_id, state, occurred_at)
    VALUES (NEW.task_id, NEW.state, NEW.updated_at);
END;
CREATE TRIGGER cancel_queued_execution AFTER UPDATE OF status ON tasks
WHEN NEW.status = 'cancelled' AND OLD.status <> NEW.status BEGIN
  UPDATE task_executions SET state = 'cancelled', finished_at = NEW.updated_at, updated_at = NEW.updated_at
    WHERE task_id = NEW.id AND state = 'queued';
END;
CREATE TRIGGER block_claimed_task_cancellation BEFORE UPDATE OF status ON tasks
WHEN NEW.status = 'cancelled' AND OLD.status <> NEW.status AND EXISTS (
  SELECT 1 FROM task_executions WHERE task_id = NEW.id AND state NOT IN ('queued', 'cancelled')
) BEGIN
  SELECT RAISE(ABORT, 'Execution already claimed');
END;
