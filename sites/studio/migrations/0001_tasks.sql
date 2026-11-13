CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('edit', 'page', 'app')),
  project TEXT,
  title TEXT,
  page TEXT,
  slug TEXT,
  description TEXT NOT NULL,
  asap INTEGER NOT NULL CHECK (asap IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, request_key),
  CHECK (
    (kind = 'edit' AND project IS NOT NULL AND slug IS NULL AND title IS NULL) OR
    (kind = 'page' AND project IS NOT NULL AND slug IS NOT NULL AND title IS NOT NULL AND page IS NULL) OR
    (kind = 'app' AND project IS NULL AND slug IS NOT NULL AND title IS NOT NULL AND page IS NULL)
  )
);
CREATE INDEX tasks_by_owner ON tasks (owner_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX submitted_slug ON tasks (slug) WHERE status = 'submitted' AND slug IS NOT NULL;

CREATE TABLE task_events (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  actor_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('submitted', 'cancelled')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX task_events_by_task ON task_events (task_id, id);
CREATE TRIGGER audit_task_submission AFTER INSERT ON tasks BEGIN
  INSERT INTO task_events (task_id, actor_id, event, occurred_at)
  VALUES (NEW.id, NEW.owner_id, NEW.status, NEW.updated_at);
END;
CREATE TRIGGER audit_task_cancellation AFTER UPDATE OF status ON tasks
WHEN OLD.status <> NEW.status BEGIN
  INSERT INTO task_events (task_id, actor_id, event, occurred_at)
  VALUES (NEW.id, NEW.owner_id, NEW.status, NEW.updated_at);
END;
