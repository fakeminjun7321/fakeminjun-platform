# Cloudflare-first 백엔드 구현 계획

작성일: 2026-08-21 · 구현 상태 갱신: 2026-08-22

## 결론과 결정 경계

현재 추천안은 **Firebase와 Cloudflare를 동시에 쓰지 않고 Cloudflare-first 단일 스택으로 시작하는 것**이다.

이유는 세 가지다.

1. 현재 React/Vite 정적 앱과 Worker 전달 구조를 그대로 확장할 수 있다.
2. 사건, 출처, 주장, 근거, 분석 이력은 문서형 데이터보다 관계형 SQL 모델이 자연스럽다.
3. 이미 Cloudflare에 있는 도메인과 정적 자산, API, DB, 파일, 비동기 작업을 한 운영 경계에서 관리할 수 있다.

Firebase는 첫 출시부터 공개 회원가입, 소셜 로그인, 비밀번호 복구, 모바일 오프라인 동기화가 핵심일 때 다시 비교한다. 실제 Cloudflare 리소스 생성, DNS 변경, 결제 설정, 비밀키 등록은 사용자 승인 전에는 수행하지 않는다.

## 현재 로컬 구현

- `apps/web/worker/index.js`: 정적 SPA와 분리된 `/api/v1` Worker BFF
- `apps/web/migrations`: D1 관계형 schema와 명시적으로 `is_live=0`인 데모 사건 seed
- 공개 읽기: health, 사건 bbox/날짜/레이어 목록, 사건 상세
- 공식 출처 수집: 고정 RSS 4개, metadata-only 정규화, idempotent D1 upsert, 수집 이력, 공개 수집함 조회
- 개인 경로: Access 신원 확인, 노트 CRUD, 국제정세·물리 수준 설정, OpenAI 일반·정밀 분석 생성·조회·삭제
- 방어 경계: 서버 결정 소유자, 개인 쿼리의 `owner_id` 제한, 고정 Origin, JSON 전용, 16 KiB 본문 제한, 필드 allowlist, prepared statement, 노트 optimistic locking, 분석 idempotency·사용량 원장·응답 제한
- `apps/web/src/backendClient.js`: 화면에서 사용할 same-origin API client와 구조화 오류 타입
- Vite 개발 프록시: `127.0.0.1:5173/api` → `127.0.0.1:8787/api`

국제정세·물리 AI 패널은 이 client를 실제로 사용한다. 오늘 브리핑의 공식 출처 수집함은 실제 RSS 메타데이터를 읽지만, 지도 사건 자체는 여전히 정적 `NON-LIVE DEMO` 자료다. 원격 D1, production Access/Cron 정책과 배포는 만들지 않았다.

## 서비스 구성

| 요구 | 1차 선택 | 역할 |
|---|---|---|
| 프론트와 API | 정적 프론트 호스팅 + 전용 API Worker | 프론트와 `/api/*`를 분리해 Access 신원 컨텍스트 보존 |
| 관계형 데이터 | D1 | 사건, 출처, 주장, 근거, 이슈, 노트, 분석 메타데이터 |
| 파일과 원본 | 비공개 R2 | API 원본 JSON, 캡처, PDF, 이미지, 추출 텍스트 |
| 수집 작업 | Cron Triggers + Queues | 예약 수집, 정규화, 중복 제거 |
| 긴 처리 | Workflows, 2단계 | 추출, 임베딩, AI, 검증과 재시도 |
| 의미 검색 | Vectorize, 2단계 | 개인 자료와 근거 청크 검색 |
| AI | OpenAI Responses API 직접 호출 | OpenAI-only 모델 선택, 구조화 출력, 비용·오류 통제 |
| 개인 알파 인증 | Cloudflare Access | 허용된 소수 계정만 접근 |
| 지도 운영 | MapLibre + PMTiles + R2/Worker | 공개 타일 의존성을 자체 호스팅으로 교체 |

초기 구현은 중간 AI Gateway 없이 전용 Worker가 OpenAI Responses API만 호출한다. 프롬프트·응답 전문은 운영 로그에 남기지 않고, `store: false`, 도구 비활성화, 구조화 출력, 짧은 모델 목록과 고정 공급자 URL을 사용한다.

## 데이터 배치

```text
브라우저
  → Cloudflare Access
  → Worker BFF (/api/v1)
      ├─ D1: 사건·근거·메타데이터·노트·분석 이력
      ├─ R2: 원본 응답·캡처·PDF·이미지·파생 파일
      ├─ Queue / Workflow: 수집·추출·임베딩·AI 작업
      ├─ Vectorize: 근거 및 개인 자료 검색
      └─ OpenAI Responses API
```

브라우저는 D1, R2, Vectorize를 직접 호출하지 않는다. 모든 데이터 요청은 `/api/v1`을 통과해 나중에 공급자를 바꿔도 프론트 계약이 유지되게 한다. 서버가 발급한 단일 객체용·단기 만료 R2 업로드 URL을 통한 `PUT`만 명시적 예외로 둔다.

## 최소 D1 모델

### 수집과 사건

- `sources`: 공급자, 원문 사이트, 신뢰·라이선스 메타데이터
- `source_items`: 원본 ID, URL, 발행 시각, R2 원본 키, 콘텐츠 해시
- `source_streams`, `source_item_streams`: 편집 분류, 선택 이유, 최초·마지막 관측 시각
- `ingestion_runs`: 공급자별 시간창, 시작·성공·실패와 수집 건수
- `events`: 제목, 요약, 시간 범위, 중요도, 확인 상태
- `event_locations`: 사건별 위도·경도·정확도·장소명
- `event_sources`: 사건과 원자료의 다대다 연결

### 근거와 분석

- `claims`: 출처가 한 주장과 현재 검증 상태
- `evidence_spans`: 원문 페이지·문단·문자 범위와 해시
- `claim_evidence`: 주장과 지지·반박 근거 연결
- `issues`: 장기 추적 단위
- `issue_events`: 이슈와 사건 연결
- `analysis_runs`: 모델, 프롬프트 버전, 기준 시각, 결과 상태
- `analysis_evidence`: 분석 문장과 근거 청크 연결

### 개인 자료

- `users`, `user_profiles`: 소유자와 분야별 수준 설정
- `notes`: 사건·이슈·자료에 연결된 개인 기록
- `files`: 소유자, R2 객체 키, MIME, 크기, 해시, 처리 상태
- `file_chunks`: 페이지·영역·문단 단위 파생 텍스트와 벡터 ID
- `jobs`: 업로드·추출·삭제 작업 상태

원문 전체와 대용량 텍스트는 D1에 넣지 않는다. D1에는 R2 객체 키, 해시, 인용 위치와 정규화된 메타데이터만 둔다.

## 1차 API 계약

### 지도와 사건

```http
GET /api/v1/events?bbox=west,south,east,north&from=ISO_DATE&layers=korea-core,us-impact,rapid-change
GET /api/v1/events/:eventId
GET /api/v1/issues/:issueId
GET /api/v1/source-items?lanes=korea-core,us-impact,rapid-change&from=ISO_DATE&limit=30
```

- 목록 응답은 지도에 필요한 좌표, 범주, 확인 상태, 짧은 요약만 보낸다.
- 상세 응답은 출처, 주장, 근거, 한국 관련성과 마지막 검증 시각을 포함한다.
- `bbox`, 날짜 범위, 레이어 수, 페이지 크기는 서버에서 제한한다.
- 수집함은 실제 공식 RSS 메타데이터이지만 항상 `unverified`이며 사건 API와 분리한다.

### 노트와 설정

```http
GET    /api/v1/notes?subjectType=event&subjectId=:id
POST   /api/v1/notes
PATCH  /api/v1/notes/:noteId
DELETE /api/v1/notes/:noteId
GET    /api/v1/profile/levels
PUT    /api/v1/profile/levels
```

현재 Worker는 Cloudflare Workers의 Access 통합이 제공하는 `ctx.access.getIdentity()`에서 안정적인 `identity.user_uuid`를 우선 사용하고, 로컬 개발 신원에서는 `identity.id`로 대체해 `users.external_subject`에 연결한다. 해당 컨텍스트가 없으면 개인 경로를 닫는다. 이메일은 표시용이며 영구 소유자 키로 사용하지 않는다. 모든 개인 데이터 읽기와 쓰기는 서버가 결정한 `owner_id`로 제한하고 브라우저가 보낸 소유자 ID를 받지 않는다. production에서는 Access application과 policy를 실제 도메인에 연결하고 거부·로그아웃·다른 사용자 격리를 다시 검증해야 한다.

브라우저 세션 쿠키를 쓰는 상태 변경 API는 정확히 일치하는 `Origin`, JSON `Content-Type`, 요청 본문 크기와 허용 필드를 검사한다. wildcard CORS는 사용하지 않는다. AI 분석은 별도 D1 원장으로 10분·일·30일·정밀 분석 한도를 적용한다. 공개 읽기 API의 edge 단위 DDoS/WAF 한도는 production 배포 단계에서 추가한다.

### 파일과 분석

```http
POST /api/v1/files/initiate
POST /api/v1/files/:fileId/complete
GET  /api/v1/files/:fileId/status
POST /api/v1/analyses
GET  /api/v1/analyses/:analysisId
DELETE /api/v1/analyses/:analysisId
```

- 업로드는 무작위 단일 객체 키와 짧은 만료의 R2 업로드 URL을 사용하고, 정확한 앱 origin의 `PUT` CORS만 허용한다.
- 업로드 직후 객체는 비공개 `quarantine/`에 두고 완료 API가 R2 `HEAD`로 키·크기·Content-Type을 다시 검증한다.
- 크기·MIME·확장자·파일 시그니처 검사는 악성코드 검사가 아니다. 압축 폭탄·PDF 객체 수·페이지 수 제한과 별도의 실제 malware scanner를 두기 전에는 `Antivirus-verified`라고 표시하지 않는다.
- 검사 통과 전에는 다운로드, AI 입력, 텍스트 추출과 임베딩을 금지하고 감염·실패·시간초과 상태 및 삭제 정책을 기록한다.
- 현재 AI 분석은 분야·모드·질문·사건 ID·설명 수준·제한된 화면 맥락을 받고, 사건 상세는 서버가 D1에서 다시 읽는다.
- 일반 작업은 `gpt-5.6-luna` 한 번, 정밀 작업은 `gpt-5.6-terra` 두 번과 `gpt-5.6-sol` 통합 한 번으로 고정한다.
- 현재 모델 출력의 근거 분류는 자동 검증된 인용이 아니다. 실제 출처 수집을 붙일 때 `analysis_evidence`와 서버 검증 evidence ID를 추가해야 한다.

## 지도 데이터 경로

1. MapLibre의 현재 viewport에서 bbox를 계산한다.
2. 클라이언트가 `/api/v1/events`를 debounce해 호출한다.
3. Worker가 범위·시간·레이어·요청 빈도를 검증한다.
4. D1에서 사건과 위치를 조회해 GeoJSON을 반환한다.
5. 사건을 선택하면 상세 API로 출처와 근거를 가져온다.
6. 마지막 성공 시각과 실패·오래된 데이터 상태를 화면에 별도로 표시한다.

Worker와 D1에는 이 계약의 사건 목록·상세 API가 구현되어 있지만, 현재 프론트는 아직 정적 데모 자료를 사용한다. 따라서 화면에 보이는 사건을 API 또는 D1에서 읽은 live 데이터라고 표시하지 않는다.

## 작업·수집 안전 경계

- Queue는 at-least-once 전달을 전제로 작업별 idempotency key, D1 unique constraint 또는 처리 영수증을 둔다.
- retry 횟수와 backoff, DLQ, 운영자 재처리, Cron 중첩 방지와 cursor 원자적 갱신을 정의한다.
- 외부 수집기는 공급자별 HTTPS hostname allowlist만 사용하고 redirect마다 scheme과 host를 다시 검증한다. 사용자 URL을 서버가 임의 fetch하지 않으며 private·link-local·metadata endpoint 접근을 차단한다.
- 수집 HTML은 렌더 전에 sanitize하고, 원문 텍스트는 신뢰할 수 없는 데이터로 취급한다. 원문 속 지시가 AI 도구 호출·삭제·외부 요청을 유발할 수 없게 분리한다.
- AI는 기본적으로 근거 읽기만 가능하며, 쓰기 도구는 사용자 확인이 있는 별도 작업으로 둔다.
- 운영에서는 Worker 5xx·지연, Queue backlog·retry·DLQ, source freshness, AI 비용·오류, migration·인증·업로드 실패를 관측하고 민감정보를 제거한 감사 로그의 보관 기간을 정한다.
- 삭제는 tombstone과 재시도 가능한 job으로 D1, R2, Vectorize, 파생 청크와 AI 기록에 전파한다. 백업에서 삭제 데이터가 사라지는 시점과 복구 훈련도 별도로 검증한다.

## 환경 분리

| 환경 | 데이터와 자격 증명 |
|---|---|
| Local | 로컬 D1/R2/Queue 바인딩, 고정 fixture, `.dev.vars` Git 제외 |
| Preview | preview 전용 Worker, D1, R2, Queue, Vectorize, Access 허용 목록 |
| Production | production 전용 모든 리소스, Worker Secrets, 승인된 호스트명 |

preview와 production 바인딩은 자동 상속된다고 가정하지 않고 각각 명시한다. D1 변경은 버전 SQL migration으로 관리하고 적용 전에 export·복구 절차를 확인한다.

## 단계별 구현

### 0. 프론트 기반 — 구현됨

- MapLibre + 공개 OpenFreeMap 스타일
- 드래그, 휠·핀치 줌, 클러스터, 레이어, 지도 URL 상태
- 정적 사건 GeoJSON 어댑터

### 1. 실제 세로 조각 — 로컬 기반 일부 구현

- Access 개발 신원과 서버 소유자 경계: 로컬 구현·검증, production 미구성
- D1 migration과 `/api/v1/events` bbox 조회: 로컬 구현·검증
- 개인 노트 저장 → Worker 재시작 후 재조회: 로컬 구현·검증
- 고정 공식 RSS 4개 metadata-only 수집·중복 제거·D1 저장·브리핑 표시: 로컬 구현·실제 피드 검증
- 기사 본문·이미지는 권리와 공격면을 줄이기 위해 저장하지 않음
- 수집 자료를 복수 근거로 검증해 사건 후보로 승격하는 단계는 미구현
- 허용되는 공급자의 원본이 필요해질 때 R2와 Queue에서 별도 구현
- 지도에서 사건 선택 → 출처 확인
- 현재 프론트 화면을 API client에 연결

### 2. 자료·AI — AI 기본 경로 로컬 구현

- 캡처·PDF quarantine, 형식 검증과 실제 악성코드 검사 경계
- R2 파생물, D1 메타데이터, Vectorize 근거 검색
- OpenAI Responses API 구조화 분석: 로컬 구현·실제 API 검증
- 인용 ID 서버 검증과 분석 이력 저장

### 3. 지도 자체 호스팅

- Protomaps PMTiles의 해시 검증
- R2 저장과 Worker 타일 캐시
- `tiles.` 전용 custom domain, 정확한 CORS, 쓰기 차단
- OpenStreetMap/OpenMapTiles/Protomaps 표시 요건 유지

## 실제 연결 전 확인할 결정

1. Cloudflare-first 채택 여부
2. 첫 버전을 개인 Access 알파로 잠글지 공개 회원가입으로 시작할지
3. `fakeminjun.com`, `app.fakeminjun.com`, preview 호스트 구성
4. 월 비용 상한과 결제 계정
5. production Cron 갱신 주기와 공식 RSS 이외의 교차검증 출처
6. OpenAI 월 예산 상한과 production 모델 변경 정책
7. 파일 최대 크기·허용 형식·실제 악성코드 검사 수단·원본 보관 기간
8. 삭제·백업·복구와 감사 로그 보관 정책
9. 실제 Cloudflare 리소스·DNS·Access·Secrets 생성 승인

## 현재 검증 경계

- **Implemented**: Worker BFF, D1 schema/seed, 사건·수집함·세션·노트·수준·OpenAI 분석 API, 고정 공식 RSS 수집기, same-origin 프론트 client와 로컬 개발 설정
- **Unit-verified**: 전체 Node 테스트 57건 통과. Sites 전용 테스트는 현재 실행 결과 참조
- **Local-runtime-verified**: 실제 로컬 Wrangler와 임시 D1에서 migration, 사건·수집함 HTTP 요청, 재시작 후 영속성, 다른 사용자 데이터 격리와 삭제 확인
- **Browser-verified**: 실제 수집함 12건, 한국→미국→급변 편집 순서, 상태 경계와 안전한 원문 링크, 콘솔 오류 없음을 인앱 브라우저에서 확인
- **Simulator-verified**: **Not verified / 미검증**
- **Physical-device-verified**: **Not verified / 미검증**
- **Live-service-verified**: 로컬 Worker에서 공식 RSS 4개 총 99건 수집과 로컬 D1 조회 확인. 이전 실행에서 실제 OpenAI 일반·정밀 분석과 D1 저장·재조회·idempotent replay 확인. Cloudflare 계정의 원격 D1·Access·Worker 배포는 **Not verified / 미검증**
- R2, Queue, Workflows, Vectorize, DNS, production Cron: **Not verified / 미검증**
- 실제 업로드 악성코드 검사와 antivirus/EDR: **Not verified / 미검증**
