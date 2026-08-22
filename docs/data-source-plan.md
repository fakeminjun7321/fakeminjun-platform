# 데이터 및 공개 API 계획

작성일: 2026-08-21

상태는 실제 연결 여부를 구분해 기록한다. 현재 공식 RSS 4개는 로컬 Worker/D1에서 실제 응답과 저장을 확인했지만 원격 Cloudflare 운영 연결은 아직 아니다.

## 상태 표기

- `1차 후보`: 첫 작동 버전에서 연결을 검토
- `후속 후보`: 기본 파이프라인 이후 추가
- `보류`: 가치가 있지만 비용·라이선스·범위 때문에 바로 넣지 않음
- `공식 문서 확인`: 문서만 읽었으며 실제 요청은 아직 성공 검증하지 않음

## 1. 국제정세

| 출처 | 편집 역할 | 저장 범위 | 현재 검증 |
|---|---|---|---|
| [대한민국 외교부 RSS](https://www.mofa.go.kr/www/wpge/m_20347/contents.do) | 한국 공식 | 제목·기관·원문 링크·발행/수집 시각 | 실제 RSS 29건 → 로컬 D1 저장·조회 확인 |
| [대한민국 통일부 RSS](https://www.unikorea.go.kr/web/unikorea/contents/Information_rss) | 한국 공식 | 동일 | 실제 RSS 10건 → 로컬 D1 저장·조회 확인 |
| [White House Briefings RSS](https://www.whitehouse.gov/briefings-statements/feed/) | 미국 공식(한국 영향 판단 전) | 동일 | 실제 RSS 30건 → 로컬 D1 저장·조회 확인 |
| [UN News Peace and Security RSS](https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml) | 국제안보 관측(급변 판단 전) | 동일 | 실제 RSS 30건 → 로컬 D1 저장·조회 확인 |
| [GDELT](https://www.gdeltproject.org/) | 전 세계 사건·보도량 변화 탐지 | 후속 후보 | 현재 환경 실제 호출 시간초과, 미채택 |
| [ReliefWeb API](https://apidoc.reliefweb.int/index.html) | 분쟁·재난·인도주의 보고서 | 보류 | 사전 승인된 `appname` 필요, 테스트 403으로 미채택 |
| [UCDP API](https://ucdp.uu.se/apidocs/index.html) | 무력 충돌의 구조화된 역사 데이터 | 후속 후보 | 공식 문서 확인, 실제 호출 미검증 |
| [ACLED API](https://acleddata.com/api-documentation/getting-started) | 세부 분쟁·시위 사건 | 후속 후보 | 계정·인증과 이용 조건 검토 필요, 실제 호출 미검증 |

수집 성공은 원문 기관이 그 제목을 발행했다는 메타데이터 확인일 뿐, 제목 속 주장을 검증했다는 뜻이 아니다. 현재 수집함은 사건·지도·합치도·신호 순위로 자동 승격하지 않는다. 기사 본문, `content:encoded`, 이미지와 첨부물은 저장하지 않는다.

## 2. 물리 및 학술 자료

| 후보 | 용도 | 도입 판단 | 인증·제한 및 주의점 | 현재 검증 |
|---|---|---|---|---|
| [arXiv API](https://info.arxiv.org/help/api/user-manual.html) | 물리 프리프린트 검색과 메타데이터 | 1차 후보 | 반복 요청 간격과 캐싱 권고 준수, 프리프린트임을 표시 | 공식 문서 확인, 실제 호출 미검증 |
| [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) | DOI·출판 메타데이터 보강 | 1차 후보 | 연락처를 포함한 polite 사용, 원문 제공 여부와 구분 | 공식 문서 확인, 실제 호출 미검증 |
| [OpenAlex API](https://developers.openalex.org/api-reference/authentication) | 논문·저자·기관·인용 관계 탐색 | 후속 후보 | API 키, 사용량·비용 정책 확인 필요 | 공식 문서 확인, 실제 호출 미검증 |
| [YouTube Data API](https://developers.google.com/youtube/v3/getting-started) | 허용된 채널의 강의 영상 탐색 | 1차 후보 | 검색 쿼터가 크므로 채널 허용 목록·캐시·갱신 주기 필요 | 공식 문서 확인, 실제 호출 미검증 |
| MIT OpenCourseWare·공식 강의 채널 | 강의·노트의 신뢰도 높은 출발점 | 1차 콘텐츠 후보 | 임베드·링크·메타데이터 사용 조건을 자료별로 확인 | 통합 방식 미결정 |

검색 결과에는 `동료평가 논문`, `프리프린트`, `강의`, `영상`, `개인 업로드` 유형을 표시한다. AI가 논문 제목·저자·DOI·수식을 추측해 만들지 않도록 원본 식별자를 보존한다.

## 3. 지도와 캡처

| 후보 | 용도 | 도입 판단 | 현재 검증 |
|---|---|---|---|
| [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) + [OpenFreeMap](https://openfreemap.org/) | 확대·이동·클러스터·레이어·지도 상태 링크 | 프로토타입 채택 | 실제 Chrome에서 공개 타일·확대·이동·필터·URL 상태 확인, 분산된 데모 사건의 클러스터 동작은 미검증 |
| [Protomaps PMTiles](https://docs.protomaps.com/pmtiles/) + Cloudflare R2/Worker | 운영 지도 자체 호스팅과 타일별 캐시 | 운영 추천 | 구조 조사 완료, 실제 R2·Worker 미연결 |
| [OpenMapTiles](https://openmaptiles.org/) | 깊은 지도 스키마·스타일 커스터마이징 | 후속 보류 | 운영 복잡도가 높아 특수 요구 발생 시 검토 |
| [W3C Screen Capture API](https://www.w3.org/TR/screen-capture/) / [`getDisplayMedia`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) | 사용자가 선택한 탭·창·화면 캡처 | 1차 후보 | 사양 확인, 실제 브라우저 경로 미검증 |

사이트 자체 요소는 앱 내부 영역 선택으로 처리하고, 다른 탭·창·화면은 브라우저의 공유 선택 창을 사용한다. 사용자의 명시적 동작 없이 자동 캡처하지 않는다.

## 4. AI 공급자

AI는 OpenAI Responses API만 사용한다. 일반 분석은 비용 효율적인 단일 모델, 정밀 분석은 제한된 전문 검토와 통합 흐름을 사용한다.

- 텍스트·이미지 입력 분석
- 구조화된 결과 생성
- 임베딩과 검색
- 인용 가능한 근거 묶음 생성
- 사용량·비용·지연 시간 기록

모델의 자체 지식만으로 현재 사건을 분석하지 않고, 수집된 출처 묶음과 분석 시각을 함께 전달한다. 모델이 반환한 인용 표시는 서버가 실제 원문과 대조한 뒤 사용자에게 보여준다.

## 5. 정규화할 최소 데이터

모든 분야 자료를 억지로 하나의 타입에 넣지 않고, 공통 근거 구조 위에 분야별 필드를 둔다.

### 공통

- 원본 URL과 공급자 식별자
- 제목, 발행·갱신 시각, 수집 시각
- 작성자·기관·출처 유형
- 언어와 지역
- 원문 사용 권한 및 저장 가능 범위
- 원본 해시 또는 버전
- 주장과 그것을 뒷받침하는 원문 위치

### 국제정세

- 사건, 행위자, 장소, 시간 범위
- 확인 상태와 출처 간 일치·충돌
- 한국 관련성, 영향 범주, 긴급성

### 물리

- DOI·arXiv ID 등 학술 식별자
- 자료 유형과 검토 상태
- 물리 분야, 선수 개념, 수학 수준
- 식·그림·페이지 인용 위치

## 6. 1차 연결 순서

1. 고정 공식 RSS 4개의 메타데이터 수집·중복 제거·로컬 D1 저장·브리핑 조회 — 구현 및 로컬 검증.
2. 수집 자료를 여러 출처의 주장·근거로 검토한 뒤에만 사건 후보를 만드는 검증 단계.
3. 검증된 사건의 지도 연결과 마지막 검증 시각·불일치 근거 표시.
4. 서버가 검증한 evidence ID만 AI에 전달하고 인용 위치를 원문과 대조.
5. 물리 자료 연결은 별도 세로 조각으로 추가.

## 7. 첫 연결 전에 결정할 항목

- production Cron 주기와 원격 Cloudflare 리소스 생성 시점
- 후속 세로 조각에서 비교할 물리·학술 API 후보
- 원문 전체 저장과 메타데이터·링크만 저장하는 기준
- 외부 API 사용량 및 월 비용 상한
- AI 분석 결과 보관 기간과 삭제 방식
- 개인 업로드 자료의 백업·암호화 정책
