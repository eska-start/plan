# Manus 완전 분리형(무료 중심) 적용 가이드

이 프로젝트는 아래 기준으로 동작하도록 정리되었습니다.

- 인증: `/api/auth/guest-login` (로컬/무료)
- OCR: OCR.space 무료 키 (`OCR_SPACE_API_KEY`) 또는 기본 demo 키
- 파일 업로드: Forge/S3 대신 **로컬 디스크 저장** (`/uploads/*`)
- 지도: `VITE_GOOGLE_MAPS_API_KEY` 직접 사용 (Google Maps JS)
- LLM(선택): `LLM_API_URL`, `LLM_API_KEY`(또는 OpenAI 환경변수) 사용

---

## 1) 파일 업로드 저장소(무료) 연결

기본값은 서버 내부 디스크(`data/uploads`)입니다.

### 로컬 개발
- 아무 설정 없이 사용 가능
- 업로드 URL: `/uploads/<key>`

### Render/Fly/Railway 같은 서버 배포
- 환경변수 권장:
  - `LOCAL_UPLOAD_DIR=/var/data/uploads`
- 주의: 컨테이너 재배포 시 파일이 사라질 수 있습니다.

### 영구 저장이 필요하면(무료 우선)
- Cloudflare R2/Supabase Storage 무료 티어를 쓰고 싶다면,
  `server/storage.ts`의 `storagePut/storageGetSignedUrl`만 해당 SDK로 교체하면 됩니다.

---

## 2) 연동해야 하는 외부 서비스

### A. OCR (무료)
- 최소 설정: `OCR_SPACE_API_KEY` (없으면 demo 키 사용)
- 실제 운영 권장: 본인 API 키 발급 후 환경변수 등록

### B. 지도
- `VITE_GOOGLE_MAPS_API_KEY` 등록
- 키 제한(HTTP referrer) 설정 필수

### C. DB
- 기존처럼 `DATABASE_URL` 필요

### D. LLM (선택)
- OCR 폴백만 쓸 거면 없어도 앱 핵심은 동작
- AI 기능까지 쓰려면:
  - `LLM_API_KEY` (또는 `OPENAI_API_KEY`)
  - `LLM_API_URL` (기본 OpenAI endpoint 사용 가능)
  - `LLM_MODEL` (기본값: `gpt-4.1-mini`)

#### OpenAI로 변경(저렴한 설정)
1. 환경변수 설정
   - `OPENAI_API_KEY=<your_key>`
   - `LLM_API_URL=https://api.openai.com/v1/chat/completions`
   - `LLM_MODEL=gpt-4.1-mini` (기본 추천)
   - 값에 `LLM_API_URL=` 같은 키 이름까지 같이 넣지 말고 **URL만** 넣기
2. 더 저렴하게 쓰려면
   - 초저가 우선: `LLM_MODEL=gpt-4.1-nano`
   - 정확도/가격 균형: `LLM_MODEL=gpt-4.1-mini`
   - 요청 토큰 제한: 서버에서 `max_tokens` 기본값(현재 1024) 유지 또는 더 낮춤
   - 반복 배치 작업은 Batch API 사용(공식 문서 기준 할인 제공)
3. 가격 확인
   - 최신 단가는 OpenAI 공식 페이지에서 확인: `https://openai.com/api/pricing`

---

## 3) Render 배포용 환경변수 예시

- `NODE_ENV=production`
- `DATABASE_URL=...`
- `JWT_SECRET=랜덤긴문자열`
- `LOCAL_UPLOAD_DIR=/var/data/uploads`
- `OCR_SPACE_API_KEY=...` (선택)
- `VITE_GOOGLE_MAPS_API_KEY=...`
- `LLM_API_KEY=...` (선택)
- `LLM_API_URL=https://api.openai.com/v1/chat/completions` (선택)

---

## 4) 체크리스트

1. 로그인 버튼 클릭 시 `/api/auth/guest-login`으로 이동하는지
2. 파일 업로드 후 `/uploads/...` URL이 반환되는지
3. 업로드된 이미지 URL이 브라우저에서 열리는지
4. 지도 탭에서 Google Maps 로딩되는지
5. OCR 자동입력이 동작하는지
