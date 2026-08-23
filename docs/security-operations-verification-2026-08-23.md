# 운영 보안 검증 기록 — 2026-08-23

대상은 `https://fakeminjun.vip`의 현재 frontend/API/scanner와 production D1·R2·Queue다. 실제 DDoS 트래픽을 발생시키지 않고, 개인 데이터와 기존 사용량에 영향을 남기지 않는 범위에서 경계를 검증했다.

## 검증 결과

| 통제 | 실제 관찰 결과 | 수준 |
|---|---|---|
| HTTPS 강제 | `http://fakeminjun.vip/`가 HTTPS로 `301` 전환 | **Live-service-verified** |
| 미인증 경계 | 미로그인 루트와 `/api/v1/session`이 Cloudflare Access 로그인으로 `302` | **Live-service-verified** |
| 요청 출처 경계 | 인증된 세션의 잘못된 origin 물리 검색 쓰기 요청이 `403 origin_forbidden` | **Live-service-verified** |
| 비용 발생 검색 한도 | 소유자 1의 10분 물리 검색 한도에 정확히 30개 시험 원장을 넣은 뒤 새 요청이 `429 physics_search_rate_limited`; 시험 원장 30개를 삭제하고 잔여 0 확인 | **Live-service-verified** |
| 스캔 큐 연결 | R2 bucket producer → 기본 scan Queue → scanner consumer와 DLQ → scanner consumer 연결 확인 | **Live-service-verified** |
| 재시도 소진 | 격리 파일 1개에 활성 lease 고장을 주입해 동일 메시지 delivery attempt 1·2·3·4와 DLQ 소비 관찰 | **Live-service-verified** |
| DLQ 목적지 상태 | 파일과 작업 모두 `error`, `scan_retries_exhausted`, `lease_id`·`lease_expires_at` null 확인 | **Live-service-verified** |
| 실패 파일 격리 | 다운로드와 OpenAI 분석이 각각 `423 physics_file_scan_failed`로 차단 | **Live-service-verified** |
| 시험 데이터 정리 | API delete `204`, 해당 D1 파일·작업 0, 전체 파일·작업 기준값 0, 정확한 R2 key 부재 확인 | **Live-service-verified** |
| 공급망 | npm 취약점 0, registry signature 127개, attestation 65개; PR #23 CI의 pinned ClamAV 이미지 high/critical 검사와 Worker 번들 검사 통과 | **Unit-verified / CI-verified** |

## 현재 배포 식별자

- frontend: `e3f1aeca-41d3-47de-a894-3ae48fdccdff`
- API: `9ea270f3-ed8c-43eb-bf0c-2105ac953a45`
- scanner: `82047ca5-1127-4bbf-ac0a-96134b518bcc`
- scanner container application: `a03eadc2-cd09-4709-bafd-2d3f53db614c`
- pinned image digest: `sha256:d454d0230953f8f2f910994a91457f2a2a988307255c8b1f105c1b98383b7e08`

## Not verified / 미검증

- Cloudflare Access 허용 정책의 현재 계정 목록과 비허용 계정의 실제 로그인 거부
- Cloudflare WAF/rate-limit rule의 control-plane 설정과 실제 edge 차단 결과
- 비용·사용량 경보의 수신 대상, 임계값, 실제 알림 도착
- 실제 DDoS·대량 부하 방어와 비용 상한 동작
- 현재 배포 버전의 macOS Chrome 로그인 후 파일 업로드·분석·인용/기록 재조회 UI 경로
- 모바일 실기기 경로

현재 Wrangler OAuth 권한과 사용 가능한 브라우저 제어 연결로는 Access/WAF/비용 경보 control plane을 읽지 못했다. 실제 부하를 발생시키는 검사는 서비스·비용 위험 때문에 수행하지 않았다. 애플리케이션의 인증·origin·사용량·Queue fail-closed 결과는 확인했지만 이를 `WAF-verified` 또는 `DDoS-verified`로 확대 해석하지 않는다.
