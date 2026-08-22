ALTER TABLE sources ADD COLUMN source_key TEXT;
ALTER TABLE sources ADD COLUMN source_role TEXT NOT NULL DEFAULT 'discovery'
  CHECK (source_role IN ('official-primary', 'official-secondary', 'discovery', 'corroboration'));
ALTER TABLE sources ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1));

ALTER TABLE source_items ADD COLUMN observed_at TEXT;
ALTER TABLE source_items ADD COLUMN last_seen_at TEXT;
ALTER TABLE source_items ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(metadata_json));

CREATE UNIQUE INDEX idx_sources_source_key ON sources(source_key) WHERE source_key IS NOT NULL;

CREATE TABLE source_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  stream_key TEXT NOT NULL UNIQUE,
  lane TEXT NOT NULL CHECK (lane IN ('korea-core', 'us-impact', 'rapid-change')),
  selection_reason TEXT NOT NULL,
  cadence_minutes INTEGER NOT NULL CHECK (cadence_minutes BETWEEN 10 AND 1440),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT
);

CREATE TABLE source_item_streams (
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  stream_id INTEGER NOT NULL REFERENCES source_streams(id) ON DELETE RESTRICT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (source_item_id, stream_id)
);

CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  stream_id INTEGER NOT NULL REFERENCES source_streams(id) ON DELETE RESTRICT,
  window_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  error_code TEXT,
  UNIQUE (stream_id, window_key)
);

CREATE INDEX idx_source_streams_lane ON source_streams(lane, enabled);
CREATE INDEX idx_source_item_streams_seen ON source_item_streams(last_seen_at DESC);
CREATE INDEX idx_ingestion_runs_stream_started ON ingestion_runs(stream_id, started_at DESC);

INSERT INTO sources (source_key, name, homepage_url, source_type, source_role, license_note)
VALUES
  ('mofa-press', '대한민국 외교부', 'https://www.mofa.go.kr/www/wpge/m_20347/contents.do', 'official-rss', 'official-primary', '제목, 원문 링크, 발행 시각만 저장. 본문과 이미지는 복제하지 않음'),
  ('unikorea-press', '대한민국 통일부', 'https://www.unikorea.go.kr/web/unikorea/contents/Information_rss', 'official-rss', 'official-primary', '제목, 원문 링크, 발행 시각만 저장. 본문과 이미지는 복제하지 않음'),
  ('whitehouse-briefings', 'The White House', 'https://www.whitehouse.gov/briefings-statements/', 'official-rss', 'official-secondary', '제목, 원문 링크, 발행 시각만 저장. 본문과 이미지는 복제하지 않음'),
  ('un-peace-security', 'UN News · Peace and Security', 'https://news.un.org/en/news/topic/peace-and-security', 'official-rss', 'official-secondary', '제목, 원문 링크, 발행 시각만 저장. 본문과 이미지는 복제하지 않음');

INSERT INTO source_streams (source_id, stream_key, lane, selection_reason, cadence_minutes)
SELECT id, 'mofa-press-rss', 'korea-core', '한국 외교정책과 재외국민 안전 관련 공식 발표를 우선 수집', 30
FROM sources WHERE source_key = 'mofa-press';

INSERT INTO source_streams (source_id, stream_key, lane, selection_reason, cadence_minutes)
SELECT id, 'unikorea-press-rss', 'korea-core', '남북관계와 한반도 정책 관련 공식 발표를 우선 수집', 30
FROM sources WHERE source_key = 'unikorea-press';

INSERT INTO source_streams (source_id, stream_key, lane, selection_reason, cadence_minutes)
SELECT id, 'whitehouse-briefings-rss', 'us-impact', '미국 행정부 발표 중 한국에 파급될 수 있는 변화를 탐색', 15
FROM sources WHERE source_key = 'whitehouse-briefings';

INSERT INTO source_streams (source_id, stream_key, lane, selection_reason, cadence_minutes)
SELECT id, 'un-peace-security-rss', 'rapid-change', '분쟁·휴전·안보의 급격한 변화를 공식 국제기구 자료로 탐색', 30
FROM sources WHERE source_key = 'un-peace-security';
