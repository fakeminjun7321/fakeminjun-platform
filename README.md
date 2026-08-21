# fakeminjun-platform

국제정세·정치·물리를 한곳에서 탐색하고, 근거를 확인하며, AI와 함께 분석하는 개인 지식 상황실입니다.

> 제품명은 아직 정하지 않았습니다. `fakeminjun-platform`은 저장소용 임시 이름입니다.

## 현재 상태

- 제품 범위와 정보 구조 초안 작성
- 데이터/API 후보와 검증 조건 정리
- 공급자 중립 아키텍처 초안 작성
- 국제정세 상황실 프론트엔드 프로토타입 구현 (`apps/web`)
- 세계 상황지도, 3개 핵심 신호, 별도 오늘 브리핑·이슈 추적 화면, 사건 선택, 호출형 AI 패널의 화면 흐름 구현
- 현재 사건은 모두 `NON-LIVE DEMO` 자료이며 AI 백엔드는 연결되지 않음
- 백엔드, 로그인, 저장소, 실제 뉴스/API, 캡처·OCR 파이프라인은 아직 구현하지 않음

## 확정된 방향

- 단순 뉴스 모음이 아니라 **분석·학습·자료 보관이 결합된 개인 워크스페이스**
- 국제정세는 한국 중심, 미국을 부중심으로 한 혼합형 상황실
- 정치는 한국을 중심으로 제도·정책 흐름을 보고, 미국과 주요 연관국을 함께 추적
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
npm run security:check
```

## 검증 상태

- **Implemented**: 기획 문서와 국제정세 프론트엔드 프로토타입이 저장소에 존재
- **Unit-verified**: 사건·관계 데이터 및 정적 Sites worker 테스트 12건 통과
- **Simulator-verified**: Chrome에서 지도 선택·레이어·배율, 브리핑·이슈 이동, AI 패널 접근성 흐름과 1440×1024, 1280×720, 700×800, 390×844 viewport를 확인
- **Simulator-verified**: 미검증 — 모바일 크기는 데스크톱 Chrome viewport로만 확인
- **Physical-device-verified**: 미검증 — 실제 기기에서 실행하지 않음
- **Live-service-verified**: 미검증 — 실제 API, AI, 인증, 저장소를 이용한 요청·저장·조회가 없음
- **Antivirus-verified**: 미검증 — 백신·EDR 엔진은 실행하지 못했으며, 정적 검토와 npm 서명·취약점 검사만 수행
