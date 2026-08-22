# fakeminjun-platform

국제정세·물리를 한곳에서 탐색하고, 근거를 확인하며, AI와 함께 분석하는 개인 지식 상황실입니다.

> 제품명은 아직 정하지 않았습니다. `fakeminjun-platform`은 저장소용 임시 이름입니다.

## 현재 상태

- 제품 범위와 정보 구조 초안 작성
- 데이터/API 후보와 검증 조건 정리
- 공급자 중립 아키텍처 초안 작성
- 국제정세·물리 프론트엔드 프로토타입 구현 (`apps/web`)
- Cloudflare Worker BFF, D1 migration, 사건 조회, 개인 노트와 분야별 수준 설정 API의 로컬 백엔드 구현
- MapLibre 기반 확대·이동·URL 상태·레이어가 있는 세계 상황지도, 3개 핵심 신호, 별도 오늘 브리핑·이슈 추적 화면, 사건 선택, 호출형 AI 패널의 화면 흐름 구현
- 물리: 7개 학습 모드, 혼합형 자료 보관소, 검증된 공개 자료 검색, KPhO→IPhO 준비 화면과 조절 가능한 데모 설명 수준 구현
- 물리 자료 찾기는 MIT OpenCourseWare, 한국물리올림피아드, IPhO 공식 공개 링크만 사용하며 실제 검색 API는 아직 연결하지 않음
- 현재 사건은 모두 `NON-LIVE DEMO` 자료이며 AI 백엔드는 연결되지 않음
- 프론트 화면은 아직 새 API를 소비하지 않으며, 원격 Cloudflare·실제 뉴스/API·파일·캡처·OCR·AI 파이프라인은 연결하지 않음

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
- [로컬 API v1 계약](docs/api-v1.md)
- [구현·검증 기준](docs/verification-plan.md)

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

- **Implemented**: 기획 문서, 국제정세·물리 프론트엔드 프로토타입, Worker BFF, D1 schema/seed, 사건·노트·수준 API와 프론트 API client가 저장소에 존재
- **Unit-verified**: `npm test` 30건 통과. 별도 Sites worker 묶음 `npm run test:sites` 5건 통과
- **Local-runtime-verified**: 실제 로컬 Wrangler와 임시 D1에서 migration, HTTP 사건 조회, Access 개발 신원, 수준 저장, 노트 생성·수정 충돌·재시작 후 재조회·다른 사용자 격리·삭제를 확인
- **Browser-verified**: 국제정세는 실제 데스크톱 Chrome에서 OpenFreeMap 렌더, 지도 확대·이동·레이어·URL 상태, 마커 선택과 1440×1024 및 390×844 반응형 viewport 확인. 인앱 브라우저에서 분야 내비게이션이 `국제정세 / 물리`만 노출되는지, 제거된 경로의 국제정세 리디렉션, 물리 학습 허브 전환과 콘솔 오류 0건을 확인. 나머지 물리 하위 화면의 전체 상호작용·반응형 검증은 미완료
- **Simulator-verified**: 미검증 — 모바일 크기는 데스크톱 Chrome 반응형 viewport로만 확인
- **Physical-device-verified**: 미검증 — 실제 기기에서 실행하지 않음
- **Live-service-verified**: 미검증 — 원격 Cloudflare D1·Access·배포, 실제 외부 데이터 API, AI, 파일 저장소를 사용하지 않음
- **Antivirus-verified**: 미검증 — 백신·EDR 엔진은 실행하지 못했으며, 변경분 보안 검토와 npm advisory·registry signature 검사만 수행
