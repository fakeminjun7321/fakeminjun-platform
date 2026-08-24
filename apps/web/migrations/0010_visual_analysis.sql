PRAGMA foreign_keys = ON;

CREATE TABLE analysis_inputs (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_kind TEXT NOT NULL CHECK (input_kind = 'capture'),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('site-region', 'display-media')),
  crop_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(crop_json)),
  selected_text TEXT CHECK (selected_text IS NULL OR length(selected_text) <= 2000),
  object_key TEXT,
  retained INTEGER NOT NULL DEFAULT 0 CHECK (retained IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(analysis_id, sha256)
);

CREATE INDEX idx_analysis_inputs_owner_created
  ON analysis_inputs(owner_id, created_at DESC);
