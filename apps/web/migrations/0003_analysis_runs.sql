PRAGMA foreign_keys = ON;

CREATE TABLE analysis_runs (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN ('international', 'physics')),
  mode TEXT NOT NULL CHECK (mode IN ('standard', 'deep')),
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  level TEXT,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  context_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(context_json)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  model_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(model_ids_json)),
  provider_response_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(provider_response_ids_json)),
  usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(usage_json)),
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX idx_analysis_runs_owner_created
  ON analysis_runs(owner_id, created_at DESC);

CREATE INDEX idx_analysis_runs_owner_mode_created
  ON analysis_runs(owner_id, mode, created_at DESC);
