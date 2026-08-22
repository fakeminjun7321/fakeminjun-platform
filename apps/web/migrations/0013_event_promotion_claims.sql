PRAGMA foreign_keys = ON;

-- This claim has no event foreign key, so it can be the first statement in an
-- atomic D1 batch. Every public write is conditional on the claim established
-- by that same batch, closing the review-versus-promotion interleaving window.
CREATE TABLE event_candidate_promotion_claims (
  candidate_id TEXT PRIMARY KEY REFERENCES event_candidates(id) ON DELETE RESTRICT,
  claim_id TEXT NOT NULL UNIQUE,
  event_id INTEGER NOT NULL UNIQUE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_hash TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision > 0),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX idx_candidate_promotion_claims_owner_created
  ON event_candidate_promotion_claims(owner_id, created_at DESC);
