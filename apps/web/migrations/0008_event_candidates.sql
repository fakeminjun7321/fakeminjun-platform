PRAGMA foreign_keys = ON;

CREATE TABLE event_candidates (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  review_decision TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_decision IN ('unreviewed', 'hold', 'reviewed', 'rejected')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 2 AND 8),
  source_item_ids_json TEXT NOT NULL CHECK (json_valid(source_item_ids_json)),
  evidence_digest TEXT NOT NULL,
  model_contract TEXT NOT NULL,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  candidate_hash TEXT,
  model_id TEXT,
  provider_response_id TEXT,
  usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(usage_json)),
  prompt_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  reviewed_at TEXT,
  UNIQUE(owner_id, idempotency_key)
);

CREATE UNIQUE INDEX idx_event_candidates_owner_active_evidence
  ON event_candidates(owner_id, evidence_digest, prompt_version)
  WHERE status IN ('pending', 'ready');

CREATE TABLE event_candidate_sources (
  candidate_id TEXT NOT NULL REFERENCES event_candidates(id) ON DELETE CASCADE,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE RESTRICT,
  evidence_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 7),
  title_snapshot TEXT NOT NULL,
  canonical_url_snapshot TEXT NOT NULL,
  published_at_snapshot TEXT,
  collected_at_snapshot TEXT NOT NULL,
  content_hash_snapshot TEXT,
  source_key_snapshot TEXT NOT NULL,
  source_name_snapshot TEXT NOT NULL,
  source_role_snapshot TEXT NOT NULL,
  source_lane_snapshot TEXT NOT NULL
    CHECK (source_lane_snapshot IN ('korea-core', 'us-impact', 'rapid-change')),
  PRIMARY KEY(candidate_id, source_item_id),
  UNIQUE(candidate_id, evidence_id)
);

CREATE TABLE event_candidate_usage_ledger (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key)
);

CREATE TABLE event_candidate_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES event_candidates(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('hold', 'reviewed', 'rejected')),
  expected_revision INTEGER NOT NULL CHECK (expected_revision > 0),
  candidate_hash TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 1000),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX idx_event_candidates_owner_created
  ON event_candidates(owner_id, created_at DESC);

CREATE INDEX idx_event_candidates_owner_review_created
  ON event_candidates(owner_id, review_decision, created_at DESC);

CREATE INDEX idx_event_candidate_usage_owner_created
  ON event_candidate_usage_ledger(owner_id, created_at DESC);

CREATE INDEX idx_event_candidate_reviews_candidate_created
  ON event_candidate_reviews(candidate_id, created_at DESC);
