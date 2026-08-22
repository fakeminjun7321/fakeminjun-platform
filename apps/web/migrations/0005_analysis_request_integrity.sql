ALTER TABLE analysis_runs ADD COLUMN request_hash TEXT;
ALTER TABLE analysis_usage_ledger ADD COLUMN request_hash TEXT;

CREATE INDEX idx_analysis_runs_owner_request_hash
  ON analysis_runs(owner_id, request_hash);
