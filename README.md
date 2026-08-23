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
- 물리: 7개 학습 모드, 혼합형 자료 보관소, KPhO→IPhO 준비 화면과 개인 올림피아드 학습 프로필 구현. 난이도 선택 UI 없이 P3 숙달·P4 완성 단계의 수학적 구조·이론·유도 중심 분석으로 고정
- 물리 자료 찾기는 고정 MIT OpenCourseWare·KPhO·IPhO 링크와 arXiv 프리프린트·Crossref DOI 메타데이터 검색을 함께 사용하고, 외부 결과를 24시간 캐시하며 검증 전 메타데이터로 표시. 외부 검색은 소유자별 10분 30회·하루 200회·30일 2,000회로 제한하고 만료 cache·오래된 미보관 자료를 정리함
- 대용량 물리 PDF는 Google Drive를 원본 보관소로 쓰는 선택 파일 전용 OAuth·암호화 토큰·소유자별 D1 카탈로그 기반을 구현. 실제 Google 계정 연결, 폴더 선택, 파일 등록·업로드는 아직 수행하지 않음
- PDF·PNG·JPEG 개인 파일은 소유자별 비공개 R2 격리 키와 D1 메타데이터로 보관한다. R2 `PutObject` 이벤트를 단일 동시성 Queue로 받아 digest 고정 ClamAV Container에서 비동기 검사하고, `clean` 판정과 동일 R2 ETag가 함께 확인된 파일만 다운로드·OpenAI 분석을 허용하는 fail-closed 경로가 저장소에 구현되어 있다. 파일은 최대 250개·총 2GiB이며 링크 보관소는 2,000개로 제한한다
- 상황지도와 분석용 데모 신호는 모두 `NON-LIVE DEMO`이며 실제 수집 자료나 사건 후보와 분리함
- 공식 RSS 4개(외교부·통일부·백악관·UN 평화·안보)의 제목·기관·원문 링크·시각을 로컬 D1에 수집하고 오늘 브리핑의 별도 `실제 수집 · 미검증` 영역에 표시
- production Worker는 공식 RSS를 10분마다 수집하고, 국제정세 화면은 열려 있을 때 60초마다 API를 다시 확인하며 브라우저 탭 복귀 시 즉시 동기화함
- 수집 자료는 사건·지도·검증 상태로 자동 승격하지 않으며 기사 본문과 이미지를 저장하지 않음
- 사용자가 공식 자료 2~8개를 선택하면 변경 불가능한 메타데이터 스냅샷을 만들고, `gpt-5.6-luna` 단일 OpenAI Responses 호출로 `미검증 사건 후보`를 생성함
- 사건 후보와 보류·검토 완료·기각 기록은 소유자별로 분리하며, 검토 완료도 사실 검증으로 간주하지 않음. 서로 다른 출처의 원문 지지 근거 2개와 확인된 위치가 없는 후보의 지도 승격은 서버에서 차단함
- 국제정세·물리의 호출형 AI 패널은 로컬 Worker를 거쳐 OpenAI Responses API에 연결되고, 결과·사용량·요청 중복 방지 기록을 소유자별 D1에 저장
- Mandos 3 Swift는 `gpt-5.6-luna` 저추론 단일 호출, Core는 `gpt-5.6-terra` 중간 추론 단일 호출, Deep은 `gpt-5.6-terra` 전문 검토 2회와 `gpt-5.6-sol` 고추론 최종 통합 1회로 제한
- 분석 요청 당시 서버가 제공한 사건·출처·물리 자료·개인 파일·캡처의 근거 ID와 스냅샷을 분석 기록에 저장하고, 모델이 허용되지 않은 ID를 인용하면 실패 처리. 분석 기록은 분야·상태·검색어로 다시 열 수 있음
- `fakeminjun.vip`는 Cloudflare Access 뒤의 프론트/API Worker, production D1, APAC Standard R2, OpenAI secret과 10분 Cron에 연결됨. 0015·0016·0018 D1 migration과 frontend/API/scanner 배포를 완료함

## 확정된 방향

- 단순 뉴스 모음이 아니라 **분석·학습·자료 보관이 결합된 개인 워크스페이스**
- 국제정세는 한국 중심, 미국을 부중심으로 한 혼합형 상황실
- 물리는 개념, 수식과 유도, 논문·강의 자료, 개인 자료 보관소를 통합
- IPhO 준비는 물리 탭 안의 별도 하위 모듈
- AI 분석 패널은 항상 열려 있지 않고 사용자가 호출할 때 나타남
- 사이트 안에서 영역·탭·창·화면을 선택해 분석에 보낼 수 있는 캡처 기능
- 물리는 현재 개인 수준에 맞춘 수학적 구조·이론·유도 중심 분석으로 고정하고 난이도 선택 UI를 두지 않음
- 처음에는 개인용으로 만들되, 이후 다중 사용자로 확장 가능한 구조

## 문서

- [제품 범위와 합의 사항](docs/product-scope.md)
- [데이터 및 공개 API 계획](docs/data-source-plan.md)
- [기술 아키텍처 초안](docs/architecture.md)
- [Cloudflare-first 백엔드 구현 계획](docs/backend-cloudflare-plan.md)
- [fakeminjun.vip 운영 배포 절차](docs/production-deployment.md)
- [로컬 API v1 계약](docs/api-v1.md)
- [Google Drive 물리 자료 연동](docs/google-drive-integration.md)
- [구현·검증 기준](docs/verification-plan.md)
- [2026-08-23 운영 보안 검증 기록](docs/security-operations-verification-2026-08-23.md)
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

- **Implemented**: 기존 국제정세·물리 기능에 arXiv/Crossref 검색·캐시, 비공개 물리 파일 API/UI, 격리 Queue·ClamAV Container scanner, clean+ETag 다운로드/AI 잠금, 파일 분석, 근거 ID 인용·분석 기록 검색, 독립 근거 기반 지도 승격 경로가 저장소에 존재
- **Unit-verified**: `npm test` 114건, 운영 배포 경계 5건, Sites worker 5건과 로컬 D1·R2 백엔드 통합 테스트 통과. 공급망 검사에서 npm 취약점 0건, registry signature 127개와 attestation 65개를 확인했고 PR #23 CI의 고정 ClamAV 이미지 취약점 검사·Worker 번들 검사도 통과함
- **Local-runtime-verified**: 임시 D1·R2에서 migration, 물리 파일 중복 제거·총량 한도·격리 중 다운로드/분석 차단, 테스트가 D1에 주입한 clean 상태 뒤 다운로드, 재시작 영속성·삭제, 외부 검색/분석 선예약 한도, 160자 검색, 분석 기록 검색, 독립 출처 지지 근거 2개+위치 확인 후 지도 승격과 사건-출처 보존을 확인. 이 clean 주입은 실제 백신 판정이 아님
- **Browser-verified**: 인앱 브라우저에서 실제 공식 자료 선택 → 실제 OpenAI 후보 생성 → 검토 메모 저장 → 새로고침 후 유지 경로를 확인. 콘솔 `warn`/`error`는 0건이었고 390×844 브라우저 viewport에서 수평 overflow가 없었음
- **Simulator-verified**: 미검증 — 390×844는 데스크톱 브라우저 viewport 확인이며 모바일 시뮬레이터 실행이 아님
- **Physical-device-verified**: 이전 production 버전은 실제 macOS Chrome에서 Access 로그인, 국제정세·물리 화면과 OpenAI 응답을 확인. 현재 frontend/API/scanner 버전의 Chrome 사용자 경로와 모바일 물리기기는 **Not verified / 미검증**
- **Live-service-verified**: DNS·TLS·미로그인 Access 차단·D1·OpenAI·Cron, arXiv/Crossref 실제 검색·캐시 hit, production D1 0015·0016·0018 migration을 확인. production Queue/R2/ClamAV 경로에서 정상 PDF `clean`·동일 바이트 다운로드·GPT-5.6 Luna 분석·인용/기록 재조회, EICAR `blocked`·R2 삭제·다운로드/AI 차단, 전달 시도 1~4 뒤 DLQ의 `scan_retries_exhausted`·file/job `error`·lease 해제·HTTP 423 차단을 확인하고 모든 시험 데이터를 삭제함
- **Security-control-verified**: HTTP→HTTPS 301, 미로그인 루트/API의 Access 302, 잘못된 origin의 쓰기 요청 403, 앱의 물리 외부 검색 한도 429와 시험 원장 정리를 확인. 이는 원격 WAF 규칙이나 DDoS 부하 방어 검증이 아님
- **Not verified / 미검증**: 현재 배포 버전의 실제 Chrome 로그인 후 파일·인용/기록 UI 조작, 비허용 계정 거부, 모바일 화면, Cloudflare Access 정책 상세·WAF 규칙·비용 경보, 실제 DDoS/부하 경로
- **Antivirus-verified**: production 정상 파일, EICAR, retry/DLQ와 목적지 D1·R2·API 결과 및 정리를 모두 확인함. 단, ClamAV signature 검사는 EDR이나 모든 악성 행위 탐지를 의미하지 않음
