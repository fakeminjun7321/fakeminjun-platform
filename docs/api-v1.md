# 로컬 API v1 계약

작성일: 2026-08-23

현재 API는 `apps/web/worker/index.js`의 Cloudflare Worker BFF와 로컬 D1에 구현되어 있다. 기본 경로는 `/api/v1`이다. seed 사건은 모두 `is_live=0`이며 실제 뉴스 수집 결과가 아니다.

## 실행

```bash
cd apps/web
npm ci
npm run db:migrate:local
npm run dev:backend
# 다른 터미널에서
npm run dev
```

프론트 개발 서버 `http://127.0.0.1:5173`의 `/api` 요청은 Worker `http://127.0.0.1:8787`로 전달된다. 로컬 `wrangler.jsonc`의 Access 개발 신원은 테스트용이며 production 인증을 대신하지 않는다.

전체 로컬 수명주기 검증은 `npm run test:backend`로 실행한다. 이 명령은 임시 D1을 만들고 migration과 HTTP 경로를 검증한 뒤 삭제한다.

## 응답 형태

성공 응답은 주로 다음 형태다.

```json
{ "data": {} }
```

실패 응답은 상태 코드와 함께 구조화된 오류와 요청 ID를 반환한다.

```json
{
  "error": {
    "code": "error_code",
    "message": "설명",
    "requestId": "uuid"
  }
}
```

API 응답은 기본적으로 `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Request-Id`를 사용한다. 공개 수집함은 `public, max-age=60, stale-while-revalidate=300`으로 짧게 캐시한다.

## 공개 읽기 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/v1/health` | D1 바인딩과 기본 쿼리 준비 상태 |
| `GET` | `/api/v1/events` | 지도 사건 목록 |
| `GET` | `/api/v1/events/:eventId` | 사건 상세 |
| `GET` | `/api/v1/source-items` | 실제 수집된 공식 출처 메타데이터 목록(미검증) |

사건 목록 조건:

- `bbox=west,south,east,north`: 경도 `-180..180`, 위도 `-90..90`, 역전 범위 거부
- `from=ISO_DATE`: 해당 시각 이후
- `layers=korea-core,us-impact,rapid-change`: 허용 목록만 사용
- `limit=1..100`: 기본값 50

목록의 `meta.dataStatus`는 현재 `non-live-demo`다. 화면 연결 후에도 이 값을 숨기거나 live로 바꾸지 않는다.

수집함 조건:

- `lanes=korea-core,us-impact,rapid-change`: 허용 목록만 사용
- `from=ISO_DATE`: 발행 시각 또는 마지막 관측 시각 기준
- `limit=1..100`: 기본값 30

각 항목은 `live: true`, `verificationStatus: unverified`, `contentStatus: source-metadata`를 함께 반환한다. 여기서 live는 실제 공식 피드에서 수집됐다는 뜻이며 사건·주장 검증을 의미하지 않는다. 응답 meta의 `collectionStatus`는 `current`, `stale`, `degraded`, `not-collected` 중 하나이고, 공급원별 마지막 시도·성공 시각을 함께 제공한다.

## Access 보호 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/v1/session` | 검증된 Access 신원과 로컬 사용자 경계 생성 |
| `GET` | `/api/v1/notes?subjectType=event&subjectId=:id` | 현재 사용자 노트 목록 |
| `POST` | `/api/v1/notes` | 사건·이슈 노트 생성 |
| `PATCH` | `/api/v1/notes/:noteId` | `expectedVersion`으로 노트 수정 |
| `DELETE` | `/api/v1/notes/:noteId` | 현재 사용자 노트 삭제 |
| `GET` | `/api/v1/profile/levels` | 국제정세·물리 수준 조회 |
| `PUT` | `/api/v1/profile/levels` | 수준 저장 (`I1..I5`, `P1..P5`, 또는 `null`) |
| `GET` | `/api/v1/event-candidates` | 현재 사용자의 메타데이터 사건 후보 목록 |
| `POST` | `/api/v1/event-candidates` | 공식 출처 자료 2~8개로 미검증 후보 생성 |
| `POST` | `/api/v1/event-candidates/:candidateId/reviews` | 후보 보류·검토 완료·기각 영수증 저장 |
| `POST` | `/api/v1/event-candidates/:candidateId/promote` | 편집자 전용 승격 잠금 확인; 현재 항상 409이며 사건을 쓰지 않음 |
| `GET` | `/api/v1/physics/resources` | 이미 저장된 고정 catalog·cache를 읽기 전용으로 검색 |
| `POST` | `/api/v1/physics/resources/search` | 동일 origin에서 arXiv/Crossref 메타데이터를 새로 조회하고 cache 갱신 |
| `GET` | `/api/v1/physics/library` | 현재 사용자의 링크 보관소 조회 |
| `GET` | `/api/v1/integrations/google-drive` | 현재 사용자의 Drive 연결·카탈로그 상태 조회 |
| `POST` | `/api/v1/integrations/google-drive/connect` | 선택 파일 전용 Google OAuth 시작 URL 발급 |
| `GET` | `/api/v1/integrations/google-drive/callback` | 일회용 state와 PKCE를 검증하고 암호화된 장기 연결 토큰 저장 |
| `GET` | `/api/v1/physics/drive/items` | 현재 사용자의 Drive PDF 카탈로그 조회 |
| `POST` | `/api/v1/physics/files` | PDF·PNG·JPEG 개인 파일을 비공개 R2 격리 구역에 저장하고 `202` 반환 |
| `GET` | `/api/v1/physics/files` | 현재 사용자의 개인 파일 목록 |
| `GET` | `/api/v1/physics/files/:fileId/download` | 첨부 강제 다운로드 |
| `DELETE` | `/api/v1/physics/files/:fileId` | R2 객체와 D1 메타데이터 삭제 |
| `POST` | `/api/v1/physics/files/:fileId/analyses` | 명시적으로 선택한 개인 파일을 OpenAI로 분석 |
| `POST` | `/api/v1/analyses` | OpenAI 구조화 분석 생성 |
| `GET` | `/api/v1/analyses` | 현재 사용자의 분석 기록 검색 (`q`, `domain`, `status`, `limit`) |
| `GET` | `/api/v1/analyses/:analysisId` | 현재 사용자의 분석 상태·결과 조회 |
| `DELETE` | `/api/v1/analyses/:analysisId` | 완료·실패 분석의 개인 내용 삭제 |
| `POST` | `/api/v1/ingestion/runs` | 정확한 관리자 subject만 허용하는 수동 공식 피드 수집 |

노트 생성 예시:

```json
{
  "subjectType": "event",
  "subjectId": 1,
  "body": "근거와 추론을 분리해서 다시 검토한다."
}
```

노트 수정 예시:

```json
{
  "body": "반대 설명도 함께 확인한다.",
  "expectedVersion": 1
}
```

서버는 owner ID를 요청에서 받지 않는다. Access의 안정적인 identity ID로 내부 사용자를 결정하고 모든 개인 쿼리를 `owner_id`로 제한한다. 오래된 `expectedVersion` 수정은 `409 note_version_conflict`를 반환한다.

### Google Drive 연결 기반

- OAuth 권한은 `https://www.googleapis.com/auth/drive.file` 하나로 고정한다. 연결 시작은 정확한 앱 Origin과 Access 신원을 요구한다.
- callback 주소는 `${APP_ORIGIN}/api/v1/integrations/google-drive/callback`으로 고정한다. `state`는 소유자별·10분·일회용이고 PKCE `S256`을 사용한다.
- D1에는 암호화된 refresh token과 파일 카탈로그만 저장한다. 브라우저에는 OAuth 시작 URL과 연결 상태만 반환하며 secret·refresh token·access token은 반환하지 않는다.
- 현재 구현은 연결·카탈로그 기반까지만 제공한다. 전용 폴더 선택, 기존 PDF 등록, 재개 가능한 대용량 업로드, 페이지 추출과 파일별 AI 허용 API는 후속 단계다.

### 메타데이터 사건 후보

후보 생성 본문은 정확히 다음 필드만 받으며 `Idempotency-Key`가 필수다.

```json
{ "sourceItemIds": [12, 18] }
```

- ID는 중복 없는 양의 정수 2~8개다. 서버는 제목·원문 URL·발행/수집 시각·출처 정보를 후보별 immutable snapshot으로 저장한다.
- OpenAI 입력에는 snapshot 중 제목·시각·출처 이름/역할·수집 lane만 전달한다. 저장된 URL과 수집하지 않은 원문 본문은 모델에 넣지 않는다.
- 후보 모델 출력은 `title`, `summary`, `whyGrouped`, `regionLabel`, `laneRecommendation`, `sourceAssessments`, `uncertainties`, `nextChecks`로 한정한다. 사실 목록·좌표·영향·합치도·검증 완료를 생성하지 않는다.
- `sourceAssessments`의 `evidenceId`는 요청한 출처 ID를 각각 정확히 한 번 포함해야 한다. strict schema 뒤에도 서버가 집합 일치 여부를 다시 검사한다.
- 일반 후보는 `gpt-5.6-luna` 1회, low reasoning, 도구 없음, `store: false`로 생성한다. 별도 사용량 원장은 10분 10회, 하루 30회, 30일 200회를 제한하며 후보를 지워도 원장은 남는다. 같은 소유자의 immutable snapshot 집합·prompt version·모델 계약이 같으면 `Idempotency-Key`가 달라도 저장된 후보를 반환해 모델 비용을 다시 쓰지 않는다. 사용량 예약과 pending 후보·snapshot 저장은 한 D1 batch로 묶어 후보 저장 실패 시 사용량 영수증만 남지 않게 한다.
- 목록 조건은 `status=pending|ready|failed`, `reviewStatus=unreviewed|hold|reviewed|rejected`, `limit=1..50`이다.

검토도 정확한 Origin·Access 소유자와 `Idempotency-Key`를 요구한다. 본문은 후보 hash와 revision을 함께 보내 optimistic locking을 적용한다.

```json
{
  "decision": "reviewed",
  "expectedRevision": 1,
  "candidateHash": "64자리 sha256 hex",
  "note": "원문 추가 대조 필요"
}
```

같은 `Idempotency-Key`와 동일 본문의 재전송은 같은 검토 영수증을 반환하고, 같은 키에 다른 본문을 쓰면 `409 idempotency_conflict`다. `reviewed`는 사용자가 후보를 검토했다는 뜻일 뿐 `verified`가 아니다.

승격은 정확한 Origin, Access 신원, `EVENT_EDITOR_SUBJECT`, 후보 hash/revision을 확인한다. 후보 검토 완료, 모든 출처 원문 검토, 서로 다른 publisher/source key의 `supports` 근거 2개 이상, 사용자 확인 좌표, 허용 lane을 모두 만족해야만 `events`, `event_locations`, `event_sources`에 원자적으로 기록한다. 승격 뒤에도 사건 상태는 `unverified`이고, 어느 조건이든 빠지면 `409 candidate_not_map_ready`와 `eventsWritten: 0`으로 닫힌다.

분석 생성은 `domain`, `mode`, `prompt`, 선택적인 `eventId`, `level`, 제한된 화면 맥락만 받는다. 모델 이름, 소유자, 도구와 공급자 URL은 브라우저가 정할 수 없다. `Idempotency-Key`가 필수이며 같은 키에 다른 본문을 쓰면 `409 idempotency_conflict`다. 삭제 후에도 별도 사용량 원장은 남아 삭제→재호출로 한도를 우회할 수 없다.

- Mandos 3 Swift (`mode=standard`): `gpt-5.6-luna`, low reasoning, 짧은 출력 예산의 단일 호출
- Mandos 3 Core (`mode=auto`): `gpt-5.6-terra`, medium reasoning, 균형 출력 예산의 단일 호출. 작업 길이나 종류로 Deep에 자동 전환하지 않음
- Mandos 3 Deep (`mode=deep`): `gpt-5.6-terra` medium reasoning 전문 검토 2회 + `gpt-5.6-sol` high reasoning 최종 통합 1회
- 10분 20회, 하루 50회, 30일 500회, 정밀 분석 하루 10회
- `store: false`, 모델 도구 없음, strict JSON schema와 서버의 2차 형태 검사
- OpenAI 응답 전체 90초 제한, 응답 본문 1 MiB 제한
- 사건·출처·물리 자료·개인 파일·캡처는 요청 당시 `evidenceId`와 스냅샷으로 저장. 모델이 서버가 제공하지 않은 ID를 인용하면 실패 처리하고, `provided-evidence` 단락에는 최소 한 개의 citation을 요구
- ID 집합 검사는 출처 내용의 진실성이나 인용 문장의 정확성을 보증하지 않으며 화면에도 이 경계를 표시

### 개인 파일 격리와 백신 상태

개인 파일은 10MiB 이하 PDF·PNG·JPEG만 받는다. 서버는 PDF header/EOF 또는 이미지 시그니처·크기와 SHA-256을 확인하고 `quarantine/owners/:ownerId/physics/:uuid.:ext` 형태의 비공개 R2 키에 저장한다. 소유자별 250개·총 2GiB를 원자적으로 예약한 뒤 R2에 쓰며, 동일 내용은 SHA-256으로 중복 제거한다. 업로드 작업 자체도 10분 20회·1일 100회·30일 1,000회로 기록하며 삭제해도 이 작업 한도는 환불하지 않는다. scanner 기능 플래그가 꺼져 있으면 새 업로드는 `503 physics_scanner_unavailable`로 닫힌다.

업로드 성공 응답은 `202`와 `antivirusStatus: not-scanned`를 반환한다. 이 상태는 악성코드 무해 판정이 아니라 격리 대기다. R2 `PutObject` 이벤트는 전용 Queue를 통해 공개 route가 없는 scanner Worker로 전달되고, scanner는 이벤트 account·bucket·action·키·크기·ETag, D1 메타데이터, R2 객체의 크기·SHA-256을 다시 대조한다. ClamAV Container가 48시간 이내 signature DB로 명확한 clean 결과를 냈을 때만 `antivirusStatus: clean`과 `scannedR2Etag`를 기록한다.

- `not-scanned`: 검사 대기 또는 재시도 가능 실패. 다운로드·AI 분석은 `423 physics_file_scan_pending`
- `clean`: 저장 당시 R2 ETag와 검사 ETag가 동일한 경우에만 다운로드·AI 분석 허용
- `blocked`: ClamAV 탐지. R2 객체를 삭제하고 다운로드·AI 분석은 `423 physics_file_blocked`
- `error`: 무결성 불일치 또는 재시도 소진. 다운로드·AI 분석은 `423 physics_file_scan_failed`

다운로드 직전에도 `clean`과 ETag 일치를 확인하고 R2 조건부 읽기를 사용한다. 응답은 원래 MIME으로 브라우저 실행하지 않고 `application/octet-stream` 첨부로 강제한다. ClamAV clean은 알려진 signature에 대한 검사 결과일 뿐 PDF 능동 콘텐츠의 안전성이나 자료 내용의 신뢰성을 보증하지 않는다.

scanner core 단위 테스트는 R2 이벤트와 ClamAV 출력 fixture만 검증한다. 로컬 backend 수명주기 테스트의 clean 상태는 D1에 직접 주입하므로 실제 ClamAV 실행이 아니다. 별도의 production 검증에서 Queue·R2 event notification·Container를 거친 정상 파일 clean, EICAR blocked와 객체 삭제, retry/DLQ의 file/job error·lease 해제, 다운로드·분석 차단과 시험 데이터 정리를 확인했다. 이 결과는 signature 기반 ClamAV 경로의 **Antivirus-verified** 증거이며 EDR이나 모든 악성 행위 탐지 증거는 아니다.

외부 물리 검색은 cache miss에만 소유자별 10분 30회·하루 200회·30일 2,000회 한도를 소비한다. 만료 cache와 30일 지난 검색 원장, 90일 지난 미보관 외부 catalog 항목을 정리하고, 개인 링크 보관소는 최대 2,000개다. 개인 파일 분석은 R2 객체를 읽기 전에 원자적 분석 사용량 예약을 끝낸다.

## 쓰기 요청 경계

- 정확한 `APP_ORIGIN`만 허용
- `Content-Type: application/json` 필수
- JSON 본문 최대 16 KiB
- 계약에 없는 필드 거부
- 노트 본문 1자 이상 10,000자 이하
- 사용자 값은 D1 prepared statement에 bind
- `/api/*` 오류는 정적 SPA로 fall through하지 않음

## 공식 피드 수집 경계

- 공급자 URL과 원문 hostname은 서버 코드의 고정 allowlist이며 브라우저가 URL을 전달할 수 없음
- redirect는 자동 추적하지 않고, 외교부의 같은 URL 1회 쿠키 확인만 제한적으로 허용
- 응답 제한 15초·512 KiB·RSS 항목 50건, RSS/XML Content-Type만 허용
- DTD와 ENTITY 선언 거부, 제어·bidi 문자 제거, URL scheme·host·credentials 검증
- 제목·기관·원문 링크·발행/관측 시각만 D1 저장; 본문·이미지·첨부물 미저장
- `(source_id, provider_item_id)` unique upsert와 수집 시간창 unique로 중복 실행 방어
- 수집 실패는 기존 성공 자료를 삭제하지 않으며 오류 코드만 기록
- scheduled handler와 `*/10 * * * *` production Cron Trigger가 배포되어 있으며, 2026-08-22 15:00 UTC 시간창에서 4개 stream의 성공 기록을 원격 D1에서 확인함. source inbox client는 열린 동안 60초마다 읽기 API를 다시 확인하고 탭 복귀 시 즉시 동기화함

production D1에는 0015·0016·0018 migration과 scan 테이블을 확인했다. APAC Standard production R2, Queue·DLQ, scanner Worker와 ClamAV Container에서 정상 PDF clean·다운로드·GPT-5.6 Luna 분석·근거 인용·기록 재조회, EICAR blocked·객체 삭제, retry/DLQ의 terminal error·lease 해제·HTTP 423 차단과 시험 데이터 정리를 확인했다. 현재 배포 버전의 로그인 후 Chrome UI 조작은 **Not verified / 미검증**이다.
