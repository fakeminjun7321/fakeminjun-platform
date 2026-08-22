# fakeminjun-platform

국제정세·물리를 한곳에서 탐색하고, 근거를 확인하며, AI와 함께 분석하는 개인 지식 상황실입니다.

> 제품명은 아직 정하지 않았습니다. `fakeminjun-platform`은 저장소용 임시 이름입니다.

## 현재 상태

- 제품 범위와 정보 구조 초안 작성
- 데이터/API 후보와 검증 조건 정리
- Cloudflare-first 저장·API 구조와 OpenAI-only AI 구조 작성
- 국제정세·물리 프론트엔드 프로토타입 구현 (`apps/web`)
- Cloudflare Worker BFF, D1 migration, 사건 조회, 개인 노트와 분야별 수준 설정 API의 로컬 백엔드 구현
- MapLibre 기반 확대·이동·URL 상태·레이어가 있는 세계 상황지도, 3개 핵심 신호, 별도 오늘 브리핑·이슈 추적 화면, 사건 선택, 호출형 AI 패널의 화면 흐름 구현
- 물리: 7개 학습 모드, 혼합형 자료 보관소, 검증된 공개 자료 검색, KPhO→IPhO 준비 화면과 조절 가능한 데모 설명 수준 구현
- 물리 자료 찾기는 MIT OpenCourseWare, 한국물리올림피아드, IPhO 공식 공개 링크만 사용하며 실제 검색 API는 아직 연결하지 않음
- 상황지도와 분석용 데모 신호는 모두 `NON-LIVE DEMO`이며 실제 수집 자료나 사건 후보와 분리함
- 공식 RSS 4개(외교부·통일부·백악관·UN 평화·안보)의 제목·기관·원문 링크·시각을 로컬 D1에 수집하고 오늘 브리핑의 별도 `실제 수집 · 미검증` 영역에 표시
- 수집 자료는 사건·지도·검증 상태로 자동 승격하지 않으며 기사 본문과 이미지를 저장하지 않음
- 사용자가 공식 자료 2~8개를 선택하면 변경 불가능한 메타데이터 스냅샷을 만들고, `gpt-5.6-luna` 단일 OpenAI Responses 호출로 `미검증 사건 후보`를 생성함
- 사건 후보와 보류·검토 완료·기각 기록은 소유자별로 분리하며, 검토 완료도 사실 검증으로 간주하지 않음. 원문 근거와 확인된 위치가 없는 후보의 지도 승격은 서버에서 차단함
- 국제정세·물리의 호출형 AI 패널은 로컬 Worker를 거쳐 OpenAI Responses API에 연결되고, 결과·사용량·요청 중복 방지 기록을 소유자별 D1에 저장
- 일반 분석은 비용 효율적인 OpenAI 단일 모델, 정밀 분석은 OpenAI 전문 검토 2회와 최종 통합 1회로 제한
- `fakeminjun.vip`는 Cloudflare Access 뒤의 프론트/API Worker, production D1, OpenAI secret과 30분 Cron에 연결됨. 파일·캡처·OCR 파이프라인은 아직 연결하지 않음

## 확정된 방향

- 단순 뉴스 모음이 아니라 **분석·학습·자료 보관이 결합된 개인 워크스페이스**
- 국제정세는 한국 중심, 미국을 부중심으로 한 혼합형 상황실
- 물리는 개념, 수식과 유도, 논문·강의 자료, 개인 자료 보관소를 통합
- IPhO 준비는 물리 탭 안의 별도 하위 모듈
- AI 분석 패널은 항상 열려 있지 않고 사용자가 호출할 때 나타남
- 사이트 안에서 영역·탭·창·화면을 선택해 분석에 보낼 수 있는 캡처 기능
- 사용자와 분야별 수준에 따라 설명 깊이와 수학적 전개 방식을 조절
- 처음에는 개인용으로 만들되, 이후 다중 사용자로 확장 가능한 구조

## 문서

- [제품 범위와 합의 사항](docs/product-scope.md)
- [데이터 및 공개 API 계획](docs/data-source-plan.md)
- [기술 아키텍처 초안](docs/architecture.md)
- [Cloudflare-first 백엔드 구현 계획](docs/backend-cloudflare-plan.md)
- [fakeminjun.vip 운영 배포 절차](docs/production-deployment.md)
- [로컬 API v1 계약](docs/api-v1.md)
- [구현·검증 기준](docs/verification-plan.md)
- [보안·공급망 정책](SECURITY.md)

## 로컬 프로토타입

```bash
cd apps/web
npm ci
npm run dev
```

품질 확인 명령:

```bash
npm test
npm run build
npm run test:sites
npm run test:backend
npm run security:check
```

프론트와 로컬 백엔드를 함께 개발할 때는 D1 migration을 한 번 적용하고 두 프로세스를 실행한다.

```bash
cd apps/web
npm run db:migrate:local
npm run dev:backend
# 다른 터미널에서
npm run dev
```

Vite는 `/api`를 `127.0.0.1:8787`의 Worker로 전달한다. 로컬 Access 개발 신원은 실제 계정이 아니며 production 인증을 증명하지 않는다.

## 검증 상태

- **Implemented**: 기획 문서, 국제정세·물리 프론트엔드, 전용 API Worker, D1 schema/seed, 사건·노트·수준·AI 분석 API, 고정 공식 RSS 수집기, 출처 수집함, 소유자별 사건 후보·검토 API와 지도 승격 차단 경로가 저장소에 존재
- **Unit-verified**: `npm test` 65건, Sites worker 5건, 운영 배포 경계 4건 통과
- **Local-runtime-verified**: 실제 로컬 Wrangler와 임시 D1에서 migration, HTTP 사건·수집함 조회, Access 개발 신원, 수준·노트 저장과 사용자 격리, 2~8개 불변 메타데이터 스냅샷 후보, 검토 메모의 재조회, 지도 승격 fail-closed를 확인
- **Browser-verified**: 인앱 브라우저에서 실제 공식 자료 선택 → 실제 OpenAI 후보 생성 → 검토 메모 저장 → 새로고침 후 유지 경로를 확인. 콘솔 `warn`/`error`는 0건이었고 390×844 브라우저 viewport에서 수평 overflow가 없었음
- **Simulator-verified**: 미검증 — 390×844는 데스크톱 브라우저 viewport 확인이며 모바일 시뮬레이터 실행이 아님
- **Physical-device-verified**: 실제 macOS Chrome에서 production Access 로그인, 국제정세·물리 화면과 OpenAI 응답을 확인. 모바일 물리기기는 미검증
- **Live-service-verified**: `fakeminjun.vip` DNS·TLS·Access, 분리된 프론트/API Worker, production D1, OpenAI 국제정세·물리 표준 분석 2회와 D1 완료 기록, `workers.dev` 우회 404를 확인. 2026-08-22 11:00 UTC Cron 시간창에서 공식 RSS 4개가 모두 성공해 메타데이터 99건이 원격 D1에 저장됨
- **Not verified / 미검증**: 새 수동 새로고침 버튼의 production Chrome 사용자 경로, 수준·노트 UI 저장, 원격 사건 후보/검토, 파일 저장소, 인증 후 정적 응답의 CSP/HSTS
- **Antivirus-verified**: 미검증 — 백신·EDR 엔진은 실행하지 못했으며, 변경분 보안 검토와 npm advisory·registry signature 검사만 수행
