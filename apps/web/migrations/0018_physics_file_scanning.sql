PRAGMA foreign_keys = ON;

ALTER TABLE physics_files ADD COLUMN r2_etag TEXT
  CHECK (r2_etag IS NULL OR length(r2_etag) BETWEEN 8 AND 256);
ALTER TABLE physics_files ADD COLUMN scanned_r2_etag TEXT
  CHECK (scanned_r2_etag IS NULL OR length(scanned_r2_etag) BETWEEN 8 AND 256);
ALTER TABLE physics_files ADD COLUMN scan_engine_version TEXT;
ALTER TABLE physics_files ADD COLUMN scan_database_version TEXT;
ALTER TABLE physics_files ADD COLUMN scan_database_updated_at TEXT;
ALTER TABLE physics_files ADD COLUMN scan_completed_at TEXT;
ALTER TABLE physics_files ADD COLUMN scan_error_code TEXT;
ALTER TABLE physics_files ADD COLUMN object_deleted_at TEXT;

CREATE TABLE physics_file_scan_jobs (
  file_id TEXT PRIMARY KEY REFERENCES physics_files(id) ON DELETE CASCADE,
  expected_r2_etag TEXT NOT NULL CHECK (length(expected_r2_etag) BETWEEN 8 AND 256),
  expected_sha256 TEXT NOT NULL CHECK (length(expected_sha256) = 64),
  expected_byte_size INTEGER NOT NULL CHECK (expected_byte_size BETWEEN 1 AND 10485760),
  state TEXT NOT NULL CHECK (state IN ('pending', 'scanning', 'clean', 'blocked', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_id TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  last_event_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_physics_file_scan_jobs_state_lease
  ON physics_file_scan_jobs(state, lease_expires_at);

CREATE TRIGGER physics_files_release_storage_after_object_delete
AFTER UPDATE OF object_deleted_at ON physics_files
WHEN OLD.object_deleted_at IS NULL AND NEW.object_deleted_at IS NOT NULL
BEGIN
  UPDATE physics_storage_usage
  SET file_count = MAX(0, file_count - 1),
      byte_size = MAX(0, byte_size - NEW.byte_size),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE owner_id = NEW.owner_id;
END;
