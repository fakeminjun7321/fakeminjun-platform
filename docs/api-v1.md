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

API 응답은 `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Request-Id`를 사용한다.

## 공개 읽기 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/v1/health` | D1 바인딩과 기본 쿼리 준비 상태 |
| `GET` | `/api/v1/events` | 지도 사건 목록 |
| `GET` | `/api/v1/events/:eventId` | 사건 상세 |

사건 목록 조건:

- `bbox=west,south,east,north`: 경도 `-180..180`, 위도 `-90..90`, 역전 범위 거부
- `from=ISO_DATE`: 해당 시각 이후
- `layers=korea-core,us-impact,rapid-change`: 허용 목록만 사용
- `limit=1..100`: 기본값 50

목록의 `meta.dataStatus`는 현재 `non-live-demo`다. 화면 연결 후에도 이 값을 숨기거나 live로 바꾸지 않는다.

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
| `POST` | `/api/v1/analyses` | OpenAI 구조화 분석 생성 |
| `GET` | `/api/v1/analyses/:analysisId` | 현재 사용자의 분석 상태·결과 조회 |
| `DELETE` | `/api/v1/analyses/:analysisId` | 완료·실패 분석의 개인 내용 삭제 |

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

production Access 정책과 원격 D1은 아직 구현·검증하지 않았다. R2 파일, 캡처·OCR와 외부 데이터 수집 API도 이 계약에 포함되지 않는다. OpenAI 경로는 로컬 실제 API로 검증했지만 production Cloudflare 경로는 별도 검증 대상이다.
