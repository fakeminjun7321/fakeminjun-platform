PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  homepage_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  license_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  provider_item_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  collected_at TEXT NOT NULL,
  content_hash TEXT,
  raw_object_key TEXT,
  UNIQUE(source_id, provider_item_id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  impact TEXT NOT NULL,
  region TEXT NOT NULL,
  short_region TEXT NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('korea-core', 'us-impact', 'rapid-change')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'mixed', 'unverified')),
  signal_rank INTEGER NOT NULL CHECK (signal_rank > 0),
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  agreement INTEGER NOT NULL CHECK (agreement BETWEEN 0 AND 100),
  occurred_at TEXT NOT NULL,
  last_verified_at TEXT,
  relation_label TEXT,
  facts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(facts_json)),
  disputed_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(disputed_json)),
  relevance_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(relevance_json)),
  relations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(relations_json)),
  is_live INTEGER NOT NULL DEFAULT 0 CHECK (is_live IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE event_locations (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  place_name TEXT NOT NULL,
  accuracy TEXT NOT NULL DEFAULT 'approximate'
);

CREATE TABLE event_sources (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE RESTRICT,
  relationship TEXT NOT NULL DEFAULT 'supports',
  PRIMARY KEY (event_id, source_item_id)
);

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE issue_events (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, event_id)
);

CREATE TABLE claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'mixed', 'unverified', 'disputed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE evidence_spans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  locator_type TEXT NOT NULL,
  locator_value TEXT NOT NULL,
  excerpt_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE claim_evidence (
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_span_id INTEGER NOT NULL REFERENCES evidence_spans(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('supports', 'contradicts', 'context')),
  PRIMARY KEY (claim_id, evidence_span_id)
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event', 'issue')),
  subject_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_profiles (
  owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  international_level TEXT CHECK (international_level IS NULL OR international_level IN ('I1', 'I2', 'I3', 'I4', 'I5')),
  physics_level TEXT CHECK (physics_level IS NULL OR physics_level IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_events_time_layer ON events(occurred_at DESC, layer);
CREATE INDEX idx_event_locations_bbox ON event_locations(longitude, latitude);
CREATE INDEX idx_source_items_published ON source_items(published_at DESC);
CREATE INDEX idx_notes_owner_subject ON notes(owner_id, subject_type, subject_id, updated_at DESC);
