# Security and supply-chain policy

이 저장소는 개인용으로 시작하지만 인터넷에 노출될 가능성을 전제로 관리한다.

## 공급망

- JavaScript 의존성은 `package-lock.json`에 고정하고 `.npmrc`의 `ignore-scripts=true`를 기본으로 유지한다.
- 새 패키지는 기존 코드로 안전하게 구현하기 어려울 때만 추가한다. 이번 RSS 수집기는 외부 XML 패키지를 추가하지 않았다.
- 의존성 변경 전후에 출처, 유지보수 상태, 설치 스크립트, 알려진 취약점과 registry signature를 확인한다.
- `npm audit --omit=dev`와 `npm audit signatures`를 PR·main push·주간 CI에서 실행한다.
- Dependabot은 npm과 GitHub Actions 업데이트 PR을 매주 만들며 자동 병합하지 않는다. 테스트와 변경분 검토 뒤에만 반영한다.
- GitHub Actions는 tag가 아니라 commit SHA로 고정한다.

## 인터넷 노출과 DDoS

- production은 Cloudflare Access로 개인 경로를 닫고, 공개 읽기 API에는 WAF·rate limit·캐시·비용 상한을 설정한다.
- AI, 수집, 업로드 같은 비용 발생 경로는 인증, 사용자/시간창 한도, 본문 크기 제한과 timeout을 둔다.
- 외부 수집 URL은 코드의 정확한 HTTPS allowlist만 허용한다. 사용자 입력 URL fetch와 자동 redirect를 허용하지 않는다.
- DDoS 방어는 애플리케이션 코드만으로 완료되지 않는다. 원격 Cloudflare 정책을 실제 배포·부하 경로에서 검증하기 전에는 `DDoS-verified`라고 표시하지 않는다.

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
