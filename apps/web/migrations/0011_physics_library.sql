PRAGMA foreign_keys = ON;

CREATE TABLE physics_catalog_resources (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  canonical_url TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  topic TEXT NOT NULL,
  level TEXT NOT NULL,
  language TEXT NOT NULL,
  authors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(authors_json)),
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  rights_note TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(provider_key, provider_item_id),
  UNIQUE(canonical_url)
);

CREATE TABLE physics_library_items (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_resource_id TEXT NOT NULL REFERENCES physics_catalog_resources(id) ON DELETE RESTRICT,
  personal_note TEXT CHECK (personal_note IS NULL OR length(personal_note) <= 10000),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(owner_id, catalog_resource_id)
);

CREATE INDEX idx_physics_catalog_provider_type
  ON physics_catalog_resources(provider_key, resource_type, topic);

CREATE INDEX idx_physics_library_owner_updated
  ON physics_library_items(owner_id, updated_at DESC);

INSERT INTO physics_catalog_resources (
  id, provider_key, provider_item_id, title, canonical_url, resource_type,
  topic, level, language, summary, rights_note, metadata_json
) VALUES
  ('mit-801', 'mit-ocw', '8.01sc', 'MIT 8.01SC Classical Mechanics',
   'https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/', '강의·문제',
   '역학', 'P3–P4', '영어', '개념 설명, 강의 영상, 문제 세트를 함께 제공하는 공개 고전역학 과정',
   '외부 원문은 복제하지 않고 링크와 메타데이터만 저장', '{"verifiedCatalog":true}'),
  ('mit-802', 'mit-ocw', '8.02', 'MIT 8.02 Physics II: Electricity and Magnetism',
   'https://ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2019/', '강의 영상',
   '전자기학', 'P3–P4', '영어', '정전기학, 자기장, 맥스웰 방정식 공개 과정',
   '외부 원문은 복제하지 않고 링크와 메타데이터만 저장', '{"verifiedCatalog":true}'),
  ('mit-803', 'mit-ocw', '8.03sc', 'MIT 8.03SC Vibrations and Waves',
   'https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/', '강의·문제',
   '진동·파동', 'P4', '영어', '진동, 푸리에 해석, 파동과 광학 공개 과정',
   '외부 원문은 복제하지 않고 링크와 메타데이터만 저장', '{"verifiedCatalog":true}'),
  ('ipho-problems', 'ipho', 'documentations', 'Past IPhO Problems and Solutions',
   'https://www.ipho-new.org/documentations/', '기출문제', '올림피아드', 'P5', '영어',
   'IPhO 공식 역대 문제와 풀이 자료', '외부 원문은 복제하지 않고 링크와 메타데이터만 저장',
   '{"verifiedCatalog":true}'),
  ('ipho-syllabus', 'ipho', 'statutes-syllabus', 'IPhO Statutes and Syllabus',
   'https://www.ipho-new.org/statutes-syllabus/', '공식 문서', '올림피아드', 'P4–P5', '영어',
   'IPhO 이론·실험 공식 범위와 대회 원칙', '외부 원문은 복제하지 않고 링크와 메타데이터만 저장',
   '{"verifiedCatalog":true}'),
  ('kpho-official', 'kpho', 'main', '한국물리올림피아드 공식 홈페이지',
   'https://newkpho.kps.or.kr/main', '공식 문서', 'KPhO', 'P3–P4', '한국어',
   '한국물리학회 물리올림피아드 일정과 통신교육 공지', '외부 원문은 복제하지 않고 링크와 메타데이터만 저장',
   '{"verifiedCatalog":true}');
