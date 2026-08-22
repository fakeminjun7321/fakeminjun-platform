# 로컬 API v1 계약

작성일: 2026-08-22

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
| `POST` | `/api/v1/analyses` | OpenAI 구조화 분석 생성 |
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

같은 `Idempotency-Key`와 동일 본문의 재전송은 같은 검토 영수증을 반환하고, 같은 키에 다른 본문을 쓰면 `409 idempotency_conflict`다. `reviewed`는 사용자가 후보를 검토했다는 뜻일 뿐 `verified`가 아니다. 후보 API는 항상 `verificationStatus: unverified`, `evidenceScope: source-metadata-only`, `mapReadiness.ready: false`를 반환한다.

승격 경로는 정확한 Origin, Access 신원, `EVENT_EDITOR_SUBJECT` 일치를 모두 확인한 뒤에도 `409 candidate_not_map_ready`와 `eventsWritten: 0`을 반환한다. 원문 근거와 사용자 확인 위치를 위한 별도 계약이 생기기 전에는 `events`, `event_locations`, `event_sources`에 쓰지 않는다.

분석 생성은 `domain`, `mode`, `prompt`, 선택적인 `eventId`, `level`, 제한된 화면 맥락만 받는다. 모델 이름, 소유자, 도구와 공급자 URL은 브라우저가 정할 수 없다. `Idempotency-Key`가 필수이며 같은 키에 다른 본문을 쓰면 `409 idempotency_conflict`다. 삭제 후에도 별도 사용량 원장은 남아 삭제→재호출로 한도를 우회할 수 없다.

- 일반 분석: OpenAI `gpt-5.6-luna` 1회
- 정밀 분석: `gpt-5.6-terra` 전문 검토 2회 + `gpt-5.6-sol` 통합 1회
- 10분 20회, 하루 50회, 30일 500회, 정밀 분석 하루 10회
- `store: false`, 모델 도구 없음, strict JSON schema와 서버의 2차 형태 검사
- OpenAI 응답 전체 90초 제한, 응답 본문 1 MiB 제한
- 모델이 적은 `basis`, `confidence`, `sourceBoundary`는 자동 검증된 인용이 아니며 화면에도 그렇게 표시

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
- scheduled handler는 구현했지만 production Cron Trigger는 아직 설정하지 않음

production Access, 원격 D1, 분리된 프론트/API Worker, OpenAI secret과 30분 Cron은 배포됐다. 실제 macOS Chrome에서 Access 로그인 뒤 국제정세·물리 표준 분석 2회를 실행했고 원격 D1 완료 기록과 사용량을 확인했다. Cron 첫 자동 RSS 실행, production 수준·노트 저장, 사건 후보 생성·검토·승격 잠금의 원격 경로는 아직 별도 검증 대상이다. R2 파일과 캡처·OCR은 이 계약에 포함되지 않는다.
