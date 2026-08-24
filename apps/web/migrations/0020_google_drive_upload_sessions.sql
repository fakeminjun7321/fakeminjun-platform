PRAGMA foreign_keys = ON;

CREATE TABLE google_drive_upload_sessions (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  root_folder_id TEXT CHECK (root_folder_id IS NULL OR length(root_folder_id) BETWEEN 10 AND 200),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 240),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 536870912),
  status TEXT NOT NULL DEFAULT 'initializing'
    CHECK (status IN ('initializing', 'ready', 'completed', 'error', 'expired')),
  drive_file_id TEXT CHECK (drive_file_id IS NULL OR length(drive_file_id) BETWEEN 10 AND 200),
  session_url_ciphertext TEXT CHECK (session_url_ciphertext IS NULL OR length(session_url_ciphertext) BETWEEN 40 AND 8192),
  session_url_iv TEXT CHECK (session_url_iv IS NULL OR length(session_url_iv) BETWEEN 16 AND 32),
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version = 1),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  last_error_code TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, idempotency_key),
  CHECK ((session_url_ciphertext IS NULL) = (session_url_iv IS NULL)),
  CHECK (
    (status = 'initializing'
      AND root_folder_id IS NULL AND drive_file_id IS NULL
      AND session_url_ciphertext IS NULL)
    OR (status = 'ready'
      AND root_folder_id IS NOT NULL AND drive_file_id IS NULL
      AND session_url_ciphertext IS NOT NULL)
    OR (status = 'completed'
      AND root_folder_id IS NOT NULL AND drive_file_id IS NOT NULL
      AND session_url_ciphertext IS NULL)
    OR (status IN ('error', 'expired')
      AND drive_file_id IS NULL AND session_url_ciphertext IS NULL)
  )
);

CREATE INDEX idx_google_drive_upload_sessions_owner_status_expiry
  ON google_drive_upload_sessions(owner_id, status, expires_at);
