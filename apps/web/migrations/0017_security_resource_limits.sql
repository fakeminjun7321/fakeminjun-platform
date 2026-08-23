PRAGMA foreign_keys = ON;

ALTER TABLE physics_search_usage_ledger ADD COLUMN idempotency_key TEXT;
ALTER TABLE physics_search_usage_ledger ADD COLUMN request_hash TEXT
  CHECK (request_hash IS NULL OR length(request_hash) = 64);
ALTER TABLE physics_search_usage_ledger ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'completed', 'failed'));
ALTER TABLE physics_search_usage_ledger ADD COLUMN updated_at TEXT NOT NULL
  DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE UNIQUE INDEX idx_physics_search_usage_owner_idempotency
  ON physics_search_usage_ledger(owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_physics_search_usage_created
  ON physics_search_usage_ledger(created_at);

CREATE TABLE physics_upload_usage_ledger (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT CHECK (request_hash IS NULL OR length(request_hash) = 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_physics_upload_usage_owner_created
  ON physics_upload_usage_ledger(owner_id, created_at DESC);

CREATE INDEX idx_physics_upload_usage_owner_idempotency
  ON physics_upload_usage_ledger(owner_id, idempotency_key);

CREATE INDEX idx_physics_upload_usage_created
  ON physics_upload_usage_ledger(created_at);

CREATE INDEX idx_source_items_source_last_seen
  ON source_items(source_id, COALESCE(last_seen_at, collected_at) DESC, id DESC);
