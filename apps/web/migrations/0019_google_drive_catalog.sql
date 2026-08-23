PRAGMA foreign_keys = ON;

CREATE TABLE google_drive_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (length(state_hash) = 43),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pkce_verifier_ciphertext TEXT NOT NULL CHECK (length(pkce_verifier_ciphertext) BETWEEN 40 AND 8192),
  pkce_verifier_iv TEXT NOT NULL CHECK (length(pkce_verifier_iv) BETWEEN 16 AND 32),
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version = 1),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_google_drive_oauth_states_owner_expiry
  ON google_drive_oauth_states(owner_id, expires_at);

CREATE UNIQUE INDEX idx_google_drive_oauth_states_owner_unique
  ON google_drive_oauth_states(owner_id);

CREATE TABLE google_drive_connections (
  owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL CHECK (length(refresh_token_ciphertext) BETWEEN 40 AND 8192),
  refresh_token_iv TEXT NOT NULL CHECK (length(refresh_token_iv) BETWEEN 16 AND 32),
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version = 1),
  scope TEXT NOT NULL CHECK (scope = 'https://www.googleapis.com/auth/drive.file'),
  root_folder_id TEXT CHECK (root_folder_id IS NULL OR length(root_folder_id) BETWEEN 10 AND 200),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'reauthorization-required', 'error')),
  last_error_code TEXT,
  connected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE physics_drive_items (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL CHECK (length(drive_file_id) BETWEEN 10 AND 200),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 240),
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size BETWEEN 0 AND 5497558138880),
  modified_time TEXT,
  md5_checksum TEXT CHECK (md5_checksum IS NULL OR length(md5_checksum) = 32),
  web_view_link TEXT CHECK (web_view_link IS NULL OR length(web_view_link) BETWEEN 1 AND 2048),
  availability_status TEXT NOT NULL DEFAULT 'available'
    CHECK (availability_status IN ('available', 'missing', 'permission-revoked', 'error')),
  index_status TEXT NOT NULL DEFAULT 'not-indexed'
    CHECK (index_status IN ('not-indexed', 'queued', 'indexing', 'ready', 'error')),
  ai_access_allowed INTEGER NOT NULL DEFAULT 0 CHECK (ai_access_allowed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, drive_file_id)
);

CREATE INDEX idx_physics_drive_items_owner_updated
  ON physics_drive_items(owner_id, updated_at DESC, id);
