PRAGMA foreign_keys = ON;

CREATE TABLE physics_search_cache (
  query_hash TEXT PRIMARY KEY,
  normalized_query TEXT NOT NULL CHECK (length(normalized_query) BETWEEN 1 AND 160),
  provider_status_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provider_status_json)),
  resource_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(resource_ids_json)),
  refreshed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_physics_search_cache_expiry
  ON physics_search_cache(expires_at);

CREATE TABLE physics_files (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK (length(original_name) BETWEEN 1 AND 240),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  signature_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (signature_status IN ('verified', 'rejected')),
  antivirus_status TEXT NOT NULL DEFAULT 'not-scanned'
    CHECK (antivirus_status IN ('not-scanned', 'clean', 'blocked', 'error')),
  analysis_status TEXT NOT NULL DEFAULT 'not-requested'
    CHECK (analysis_status IN ('not-requested', 'completed', 'failed')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, sha256),
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX idx_physics_files_owner_created
  ON physics_files(owner_id, created_at DESC);

CREATE TABLE analysis_evidence_links (
  analysis_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL CHECK (length(evidence_id) BETWEEN 1 AND 160),
  evidence_kind TEXT NOT NULL
    CHECK (evidence_kind IN ('event', 'source-item', 'physics-resource', 'physics-file', 'capture')),
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) BETWEEN 1 AND 160),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  cited INTEGER NOT NULL DEFAULT 0 CHECK (cited IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (analysis_id, evidence_id)
);

CREATE INDEX idx_analysis_evidence_owner_created
  ON analysis_evidence_links(owner_id, created_at DESC);
