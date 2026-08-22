# Production deployment: `fakeminjun.vip`

작성일: 2026-08-22

현재 지도 타일은 운영용 자체 호스팅 PMTiles가 아니라 OpenFreeMap을 사용한다. 따라서 이 배포는 Cloudflare Access 뒤의 **개인 private alpha**이며 공개 production이라고 부르지 않는다.

## 배포 경계

운영 환경은 하나의 Worker에 프론트와 API를 합치지 않는다.

```text
브라우저
  ├─ fakeminjun.vip/*      → fakeminjun-platform-web (정적 SPA 전용)
  └─ fakeminjun.vip/api/*  → Cloudflare Access → fakeminjun-platform-api
                                                ├─ D1
                                                └─ OpenAI Responses API
```

- `fakeminjun-platform-web`에는 D1과 OpenAI 비밀키를 연결하지 않는다. 최소 Worker는 `/api/*` route가 빠졌을 때 SPA HTML을 대신 반환하지 않고 `503 api_route_unavailable`로 닫는 역할만 한다.
- `fakeminjun-platform-api`에는 Static Assets를 연결하지 않는다. 그래야 Worker의 `ctx.access`에서 검증된 Access 신원을 받을 수 있다.
- 루트 custom domain은 Cloudflare가 DNS 레코드와 TLS 인증서를 관리한다.
- `/api/*` route는 루트 custom domain보다 먼저 실행되고 API Worker에서 응답을 끝낸다.
- `workers.dev` 공개 주소는 두 Worker 모두 끈다.

## 최초 배포 순서

1. Wrangler를 대상 Cloudflare 계정에 인증한다.
2. `fakeminjun-platform-prod` D1 데이터베이스를 만든다.
3. 반환된 D1 ID를 `apps/web/wrangler.api.production.jsonc`에 기록한다.
4. `npm run db:migrate:production`으로 외부에 노출되지 않은 원격 D1에 migration을 적용한다.
5. Cloudflare Access self-hosted application을 `fakeminjun.vip` 전체에 만들고 소유자 계정만 허용한다. 이 private alpha 경계가 준비되기 전에는 custom domain을 공개하지 않는다.
6. `npm run deploy:frontend`로 루트 custom domain과 정적 SPA를 먼저 배포한다.
7. 로컬 `.dev.vars`의 `OPENAI_API_KEY`를 API Worker secret으로 등록한다. 키 값은 Git, Wrangler 설정, 셸 기록, 로그에 기록하지 않는다.
8. `npm run deploy:api`로 `/api/*` 전용 Worker와 30분 Cron을 배포한다.

`validate-production-config.mjs`는 D1 ID가 placeholder이거나 프론트/API 분리 경계가 바뀌면 배포 전에 중단한다.

## 실제 사용자 경로 검증

배포 명령 성공만으로 완료로 보지 않는다. 다음을 실제 `https://fakeminjun.vip`에서 확인한다.

1. DNS와 TLS가 정상이며 루트와 깊은 SPA 경로가 렌더링된다.
2. 미로그인 `/api/v1/session`이 Access에서 차단된다.
3. 허용 계정 로그인 뒤 `/api/v1/session`이 인증 성공을 반환한다.
4. `/api/v1/health`가 원격 D1 `ready`를 반환한다.
5. 수준 설정이나 노트를 저장하고 새로고침 및 새 세션에서 다시 조회한다.
6. 실제 OpenAI 분석 1회를 실행하고 결과와 usage 기록이 원격 D1에 남는지 확인한다.
7. Cron 실행 뒤 공식 RSS metadata가 source inbox에 나타나며 계속 `미검증`으로 표시되는지 확인한다.
8. Cloudflare에서 Worker route, Access policy, D1 migration, secret 이름, Cron 상태를 다시 읽어 확인한다.

## 현재 상태

- **Implemented**: 운영 프론트/API 분리 설정, D1 placeholder 방지 검사, 배포 명령, 검증 절차
- **Unit-verified**: 운영 배포 경계 테스트 3건 통과
- **Live-service-verified**: **Not verified / 미검증** — 원격 D1·Access·Workers·DNS를 아직 만들거나 배포하지 않음
- **Simulator-verified**: **Not verified / 미검증**
- **Physical-device-verified**: **Not verified / 미검증**
