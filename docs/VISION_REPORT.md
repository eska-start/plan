# PLAN 정밀 교차 검증 — 구현 보고서 (feat/vision-crosscheck)

## 수정 파일
- `shared/vision.ts` — 공용 계약/정규화/검증 엔진 (flight/accommodation/rental/itinerary, matched/conflict/missing/invalid/single_source/confirmed, 고위험 필드 자동확정 차단)
- `server/vision/engines.ts` — localAnalyze(OCR.space+구조분석, engine=local-ocr 명시) / cloudAnalyze(이미지 시각구조 해석, 키 하드코딩 없음, 서버 프록시 경유)
- `server/vision/router.ts` — `vision.analyze` (local/smart/precise, cloudConsent 필수, 클라우드 장애 시 로컬 폴백, 재분석 2회 제한 힌트)
- `server/routers.ts` — `vision: visionRouter` 추가. 기존 `flights/rentals/accommodations.extractFromImage` 유지 (회귀 방지)
- `server/vision/verify.test.ts` — vitest 5케이스
- `client/src/components/VisionReview.tsx` — 11항 확인 UI (원본 미리보기, 필드별 상태, 충돌 강조, 직접수정, 확인 후만 저장)
- `client/src/pages/trip-tabs/FlightsTab.tsx`, `AccommodationsTab.tsx`, `RentalsTab.tsx` — 기존 OcrUploadButton 유지 + VisionReview 추가 (확인값만 폼 반영)
- `capacitor.config.ts`, `client/src/lib/capBridge.ts` — Android 스캐폴드 (appId com.eska.plan, webDir dist/public, API키 직접호출 금지)

## 구현 기능
- Step1 입력: 카메라/갤러리/공유시트/PDF/연속스크린샷 (VisionReview file input + capBridge 분기점)
- Step2 로컬: OCR.space 텍스트+정규식 구조분석, 온디바이스 VLM 아님 명시 (`localNote`)
- Step3 클라우드: `invokeLLM` vision high-detail, 사이트 템플릿/좌표 비의존 프롬프트, 왕복/경유/취소·검색결과 구분
- Step4 교차검증: `verifyFields` 정규화 비교 (공항코드/IATA, 날짜, 시간/오전오후, 통화, 편명/예약번호), 논리검증 (체크아웃 역전, 금액형식), 미확인 null 유지
- 모드: local/smart(기본)/precise + localStorage 저장, 클라우드 전송 동의 체크박스
- 중복/검색결과 보호: 확정단서 없음 → bookingStatus=search_result, 사용자 확인 전 DB 저장 안 함

## AI 모델/SDK
- 로컬: (웹/서버) OCR.space `eng` + 정규식. Android 실기기: ML Kit Text Recognition v2 + (지원기종만) Gemini Nano/ML Kit GenAI — 기종별 RAM/한영일 지원 확인 후 연동 필요 (미검증)
- 클라우드: 기존 Forge `invokeLLM` (`gemini-2.5-flash`, `server/_core/llm.ts:283`) vision high-detail + json_object

## 실제 테스트 결과
- `pnpm vitest run server/vision/verify.test.ts`: 5/5 통과
- `pnpm test` 전체: 4파일 26/26 통과 (기존 21 + 신규 5, 회귀 없음)
- `pnpm check` (`tsc --noEmit`): 통과 (Set/matchAll 스프레드 → `Array.from` 수정 후)
- 수정 버그: `normalizeDateTime('2026.10.20 오후 8:50')`가 날짜만 반환하던 문제 — 기존 AM/PM 정규식이 연도 숫자 오매칭. HH:mm 뒤탐색 + 한글 시 패턴으로 수정, `2026-10-20T20:50` 확인

## 미검증 기능
- 온디바이스 VLM 실기기 동작 (기종별 지원/메모리/속도)
- Naver/Skyscanner/Trip.com/Agoda/Booking 실스크린샷 12종 세트 평가
- 오프라인 smart→local 자동전환 E2E, PDF 다페이지, 연속스크린샷 병합
- Capacitor `android/` 플랫폼 생성 + APK 서명 빌드 (Android SDK 없음)

## 비용 요소
- OCR.space 무료키 `helloworld` 폴백 유지 (할당량 초과 시 실패 가능)
- 클라우드 vision 호출: precise 모드 문서당 1회, smart는 누락 시만 1회, 재분석 최대 2회 — 호출수/토큰 로그는 `vision.analyze` 응답에 카운트 추가 예정

## API 보안 방식
- APK에 비밀키 하드코딩 없음. `ENV.forgeApiKey` 서버측만 사용, 클라는 `vision.analyze` tRPC 프록시 경유
- 클라우드 전송 전 동의 체크 필수, 원본 URL은 `/api/upload-ocr` 서명 스토리지 경유, HTTPS 전제
- 개인정보 마스킹/로그 최소화/임시이미지 정리는 후속 (현재 rawLocalText 4000자 반환 — 실서비스 전 제거/마스킹 필요)

## APK 산출물
- 없음 (스캐폴드만). 빌드 절차: `pnpm i` → `pnpm build` → `npx cap add android` → `npx cap sync` → Android Studio 서명 빌드

## 후속 개선
1. `pnpm i && pnpm test && pnpm check` 통과
2. ML Kit 플러그인 + Gemini Nano 지원표 작성
3. 실스크린샷 12종 정확도/비용 측정표
4. rawLocalText 마스킹, 임시 이미지 TTL 삭제
5. SQLite 오프라인 큐(`capBridge.queuePendingVision`) → 온라인 동기화
