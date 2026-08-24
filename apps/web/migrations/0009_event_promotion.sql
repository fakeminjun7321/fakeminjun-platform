PRAGMA foreign_keys = ON;

ALTER TABLE event_candidates ADD COLUMN promoted_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_event_candidates_promoted_event
  ON event_candidates(promoted_event_id)
  WHERE promoted_event_id IS NOT NULL;

CREATE TABLE event_candidate_evidence_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES event_candidates(id) ON DELETE CASCADE,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE RESTRICT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('supports', 'context', 'contradicts')),
  locator_type TEXT NOT NULL CHECK (locator_type IN ('url', 'paragraph', 'page', 'capture')),
  locator_value TEXT CHECK (locator_value IS NULL OR length(locator_value) BETWEEN 1 AND 500),
  excerpt TEXT CHECK (excerpt IS NULL OR length(excerpt) BETWEEN 1 AND 1000),
  excerpt_hash TEXT,
  candidate_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(candidate_id, source_item_id),
  UNIQUE(owner_id, idempotency_key)
);

CREATE TABLE event_candidate_locations (
  candidate_id TEXT PRIMARY KEY REFERENCES event_candidates(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_name TEXT NOT NULL CHECK (length(place_name) BETWEEN 1 AND 200),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  accuracy TEXT NOT NULL CHECK (accuracy IN ('exact', 'approximate', 'country', 'regional')),
  candidate_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key)
);

CREATE TABLE event_candidate_promotions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES event_candidates(id) ON DELETE RESTRICT,
  event_id INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE RESTRICT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_hash TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision > 0),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX idx_candidate_evidence_reviews_candidate
  ON event_candidate_evidence_reviews(candidate_id, source_item_id);

CREATE INDEX idx_candidate_promotions_owner_created
  ON event_candidate_promotions(owner_id, created_at DESC);
