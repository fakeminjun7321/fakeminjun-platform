PRAGMA foreign_keys = ON;

ALTER TABLE analysis_runs ADD COLUMN requested_mode TEXT NOT NULL DEFAULT 'standard'
  CHECK (requested_mode IN ('auto', 'standard', 'deep'));
ALTER TABLE analysis_runs ADD COLUMN routing_reason TEXT NOT NULL DEFAULT 'explicit-standard';
ALTER TABLE analysis_runs ADD COLUMN orchestration_version TEXT NOT NULL DEFAULT 'bounded-openai-v1';
ALTER TABLE analysis_runs ADD COLUMN plan_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(plan_json));

CREATE TABLE analysis_steps (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('standard', 'specialist', 'synthesis')),
  role TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 3),
  model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  provider_response_id TEXT,
  usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(usage_json)),
  error_code TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  UNIQUE(analysis_id, position)
);

CREATE INDEX idx_analysis_steps_run_position
  ON analysis_steps(analysis_id, position);
