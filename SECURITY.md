# Security and supply-chain policy

이 저장소는 개인용으로 시작하지만 인터넷에 노출될 가능성을 전제로 관리한다.

## 공급망

- JavaScript 의존성은 `package-lock.json`에 고정하고 `.npmrc`의 `ignore-scripts=true`를 기본으로 유지한다.
- 새 패키지는 기존 코드로 안전하게 구현하기 어려울 때만 추가한다. 이번 RSS 수집기는 외부 XML 패키지를 추가하지 않았다.
- 의존성 변경 전후에 출처, 유지보수 상태, 설치 스크립트, 알려진 취약점과 registry signature를 확인한다.
- 전체 `npm audit`와 `npm audit signatures`를 PR·main push·주간 CI에서 실행한다.
- Dependabot은 npm과 GitHub Actions 업데이트 PR을 매주 만들며 자동 병합하지 않는다. 테스트와 변경분 검토 뒤에만 반영한다.
- GitHub Actions는 tag가 아니라 commit SHA로 고정한다.

## 인터넷 노출과 DDoS

- production은 Cloudflare Access로 개인 경로를 닫고, 공개 읽기 API에는 WAF·rate limit·캐시·비용 상한을 설정한다.
- AI, 수집, 업로드 같은 비용 발생 경로는 인증, 사용자/시간창 한도, 본문 크기 제한과 timeout을 둔다.
- 외부 수집 URL은 코드의 정확한 HTTPS allowlist만 허용한다. 사용자 입력 URL fetch와 자동 redirect를 허용하지 않는다.
- DDoS 방어는 애플리케이션 코드만으로 완료되지 않는다. 원격 Cloudflare 정책을 실제 배포·부하 경로에서 검증하기 전에는 `DDoS-verified`라고 표시하지 않는다.

## 개인 파일 격리와 악성코드 검사

- 허용된 PDF·PNG·JPEG도 먼저 비공개 R2의 `quarantine/owners/...` 경로에만 저장한다. 브라우저에는 R2 주소나 객체 키를 노출하지 않는다.
- R2 `PutObject` 이벤트는 전용 Queue와 DLQ를 거쳐 공개 route가 없는 scanner Worker로 전달한다. 이벤트의 account, bucket, action, 객체 키, 10MiB 크기 상한과 ETag가 정확히 일치하지 않으면 검사 대상으로 인정하지 않는다.
- scanner는 D1의 소유자·크기·SHA-256·예상 ETag와 R2 객체를 다시 대조하고, lease로 중복 처리를 제한한 뒤 digest로 고정한 ClamAV Container에서 최대 120초 동안 검사한다. Container의 외부 통신 허용 대상은 signature 갱신용 `database.clamav.net`으로 제한한다.
- ClamAV signature DB 시각이 48시간보다 오래됐거나 버전 출력·종료 코드·timeout이 불명확하면 `clean`으로 승격하지 않는다. 다운로드와 OpenAI 분석은 `antivirus_status=clean`이며 `scanned_r2_etag=r2_etag`인 객체만 허용한다.
- 탐지 파일은 R2 객체를 삭제하고 `blocked` 기록을 남긴다. 검사 실패·재시도 소진 파일도 다운로드와 AI 분석을 계속 차단한다.
- ClamAV clean은 알려진 signature에 대한 한 시점의 판정일 뿐 파일의 무해성, PDF 능동 콘텐츠 안전성 또는 물리 내용의 신뢰성을 보증하지 않는다. 다운로드는 계속 `application/octet-stream` 첨부로 강제한다.

scanner core fixture, mock Queue, 직접 주입한 D1 `clean` 상태는 실제 백신 실행 증거가 아니다. **Antivirus-verified**라고 보고하려면 production과 같은 경로에서 정상 파일의 clean 판정, EICAR의 blocked 판정과 객체 삭제, signature DB 시각·engine 기록, retry/DLQ 결과를 각각 확인하고 시험 객체를 정리해야 한다.

## 보고 경계

- `npm audit`과 registry signature는 알려진 패키지 위험 신호를 확인할 뿐 백신·EDR 검사가 아니다.
- 화면 렌더, mock, 빌드, 단위 테스트는 원격 인증·저장·WAF·DDoS 방어를 증명하지 않는다.
- 발견된 취약점은 영향 범위와 재현 조건을 확인하고, 보안 업데이트와 기능 업데이트를 분리해 검토한다.

로컬 점검:

```bash
cd apps/web
npm ci
npm test
npm run test:backend
npm run security:check
```
