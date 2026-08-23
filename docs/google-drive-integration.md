# Google Drive 물리 자료 연동

작성일: 2026-08-23

## 확정된 역할

| 위치 | 맡는 일 |
|---|---|
| Google Drive | 대용량 PDF 원본의 기준 저장소 |
| Obsidian | 사용자가 직접 작성한 물리 노트의 기준 저장소 |
| STUDIO 7321 D1 | 소유자, Drive file ID, 제목·크기·수정 시각, 검사·인덱스 상태, 파일별 AI 허용 기록 |
| STUDIO 7321 R2 | 격리 검사, 선택 페이지 추출물, 짧게 유지하는 AI 임시 캐시 |
| 웹사이트 | 자료 검색·열기, 필요한 페이지 분석, 근거 표시, 이후 Obsidian 내보내기 |

PDF 원본을 D1이나 Obsidian에 복제하지 않는다. 로컬 절대 경로 대신 `drive_file_id`, 이후 추가할 `studio_id`, `obsidian_note_path`로 연결한다.

## 현재 구현 범위

- 선택 파일 전용 Google OAuth 시작·callback 계약
- 소유자와 10분 만료에 묶인 일회용 state 및 PKCE S256
- refresh token의 AES-GCM 암호화 저장
- Drive 연결 상태와 소유자별 PDF 카탈로그 조회 API
- 앱이 소유하는 `STUDIO 7321 Physics` 전용 폴더 검색·생성
- 512MiB 이하 PDF를 8MiB 단위로 브라우저에서 Drive에 직접 보내는 재개 가능한 업로드
- 업로드 세션 주소의 별도 AES-GCM 암호화, 소유자·24시간·동시 10개 제한
- 완료 뒤 서버가 실제 Drive 파일 ID·이름·크기·MIME·부모 폴더·앱 속성을 다시 확인한 경우에만 D1 카탈로그 등록
- 물리 보관소 화면의 연결·진행률·취소·Drive 원문 목록 표시
- Google 설정이 없으면 버튼과 API가 안전하게 닫히는 상태

코드는 구현됐지만 아직 실제 Google 계정을 연결하지 않았고 Drive 폴더·파일을 만들거나 업로드하지 않았다. `/Users/minjun/공부자료/Physics`도 변경하거나 전송하지 않는다.

## 필요한 운영 설정

Google Cloud에서 Web application OAuth client를 만든 뒤 다음 callback 주소를 정확히 등록한다.

```text
https://fakeminjun.vip/oauth/google-drive/finish
```

API Worker에는 값 자체를 Git에 넣지 않고 다음 secret을 등록한다.

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
```

`GOOGLE_TOKEN_ENCRYPTION_KEY`는 암호학적으로 무작위인 32바이트 값을 base64url로 표현한 별도 키다. Google client secret과 같은 값을 재사용하지 않는다. Preview와 production은 서로 다른 OAuth client와 암호화 키를 쓴다.

## 권한과 개인정보 경계

- 요청 범위는 `drive.file` 하나다. 사용자가 앱에서 선택했거나 앱을 통해 만든 파일만 다룬다.
- 장기 연결 토큰은 서버에서만 복호화한다. 브라우저와 일반 로그에는 반환하지 않는다. 브라우저에는 수명이 짧은 업로드 세션 주소만 전달하며 D1 저장본은 별도 암호화한다.
- PDF 바이트는 Cloudflare Worker를 통과하지 않고 Google의 재개 가능한 업로드 주소로 직접 전송한다. Worker는 완료 뒤 Drive 메타데이터를 다시 조회해 요청과 일치하는지 확인한다.
- AI 분석은 기본 거부다. 파일별 허용을 켠 자료에서 필요한 장·페이지 범위만 추출한다.
- 저작권 교재는 Cloudflare Access 뒤 개인 공간에 두고 파일별 OpenAI 전송 여부를 따로 선택한다.
- 수백 MB 교재 전체를 OpenAI에 보내지 않는다. 크기·페이지·시간·비용 상한을 먼저 적용한다.

## 다음 구현 순서

1. 실제 Google OAuth client와 production secret을 등록하고 본인 계정 연결을 확인한다.
2. 실제 Chrome에서 로그인→동의→복귀→전용 폴더 생성→시험 PDF 업로드→Drive 원문 열기까지 확인한다.
3. 기존 Drive PDF를 불러오는 Picker는 직접 업로드 경로가 안정된 뒤 별도로 추가한다.
4. 선택한 자료만 페이지 단위로 추출·인덱싱하고 파일별 AI 허용을 붙인다.
5. Obsidian 연동은 그 뒤 managed block 내보내기로 추가한다.

## 검증 경계

- **Implemented**: OAuth·암호화·전용 폴더·재개 가능한 업로드·서버측 완료 확인·D1 카탈로그·목록 UI 코드와 migration이 저장소에 존재한다.
- **Unit-verified**: 고정 callback, 최소 권한, PKCE/state, 용도 분리 AES-GCM, 고정 Google endpoint, 8MiB chunk·308 처리, 메타데이터 확인, 잘못된 scope·주소·응답 거부를 자동 테스트한다.
- **Local-runtime-verified**: 임시 D1에서 미설정·미연결·빈 카탈로그 상태와 연결 거부를 실제 HTTP로 확인한다.
- **Live-service-verified**: **Not verified / 미검증** — 실제 Google 자격 증명과 계정 연결을 아직 수행하지 않았다.
- **Physical-device-verified**: **Not verified / 미검증** — 실제 Chrome에서 Google 로그인·동의·복귀·Drive PDF 업로드를 실행하지 않았다.

Google의 현재 권장 흐름과 범위 설명은 공식 [Drive API OAuth 범위 문서](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [웹 서버 OAuth 문서](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Picker 문서](https://developers.google.com/workspace/drive/api/guides/picker), [재개 가능한 업로드 문서](https://developers.google.com/workspace/drive/api/guides/manage-uploads)를 기준으로 한다.
