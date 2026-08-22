PRAGMA foreign_keys = ON;

CREATE TABLE analysis_usage_ledger (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('standard', 'deep')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX idx_analysis_usage_owner_created
  ON analysis_usage_ledger(owner_id, created_at DESC);

CREATE INDEX idx_analysis_usage_owner_mode_created
  ON analysis_usage_ledger(owner_id, mode, created_at DESC);
