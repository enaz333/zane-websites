CREATE TABLE studio_projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  brief TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, slug)
);

CREATE TABLE studio_project_requests (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES studio_projects(id),
  parent_id TEXT,
  restore_id TEXT,
  message TEXT NOT NULL,
  brief TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'ready', 'cancelled')),
  artifact TEXT,
  digest TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id, id),
  FOREIGN KEY(project_id, parent_id) REFERENCES studio_project_requests(project_id, id),
  FOREIGN KEY(project_id, restore_id) REFERENCES studio_project_requests(project_id, id)
);

CREATE UNIQUE INDEX studio_project_pending ON studio_project_requests(project_id) WHERE state = 'queued';
CREATE INDEX studio_project_history ON studio_project_requests(project_id, created_at);
