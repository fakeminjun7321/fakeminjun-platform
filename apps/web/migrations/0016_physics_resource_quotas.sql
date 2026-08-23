PRAGMA foreign_keys = ON;

CREATE TABLE physics_search_usage_ledger (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL CHECK (length(query_hash) = 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_physics_search_usage_owner_created
  ON physics_search_usage_ledger(owner_id, created_at DESC);

CREATE TABLE physics_storage_usage (
  owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO physics_storage_usage (owner_id, file_count, byte_size)
SELECT owner_id, COUNT(*), COALESCE(SUM(byte_size), 0)
FROM physics_files
GROUP BY owner_id;
