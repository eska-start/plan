# Travel Planner TODO

## DB Schema & Backend
- [x] DB 스키마 설계: trips, flights, rentals, accommodations, memos, itinerary_items, diary_entries 테이블
- [x] DB 마이그레이션 실행
- [x] server/db.ts 헬퍼 함수 구현
- [x] server/routers.ts tRPC 라우터 구현 (trips, flights, rentals, accommodations, memos, itinerary, diary)

## Frontend - 글로벌 스타일 & 레이아웃
- [x] 글로벌 CSS 디자인 시스템 (색상, 폰트, 그림자, 간격)
- [x] DashboardLayout 기반 사이드바 네비게이션 구성
- [x] App.tsx 라우트 등록

## Frontend - 여행 관리
- [x] 여행 목록 페이지 (카드 그리드, 생성 버튼)
- [x] 여행 생성/수정 다이얼로그 (이름, 목적지, 날짜 범위)
- [x] 여행 상세 대시보드 (탭 네비게이션: 항공, 렌트카, 숙박, 메모, 일정, 일기, 지도)

## Frontend - 항공편
- [x] 항공편 목록 조회
- [x] 항공편 추가/수정/삭제 (항공사, 편명, 출발/도착 시간, 공항, 예약번호)

## Frontend - 렌트카
- [x] 렌트카 목록 조회
- [x] 렌트카 추가/수정/삭제 (업체, 차종, 픽업/반납 일시·장소, 예약번호)

## Frontend - 숙박
- [x] 숙박 목록 조회
- [x] 숙박 추가/수정/삭제 (숙소명, 체크인/아웃, 주소, 예약번호, 메모)

## Frontend - 메모
- [x] 메모 목록 조회
- [x] 메모 작성/수정/삭제 (제목, 내용, 고정 기능)

## Frontend - 하루별 일정 & 동선
- [x] 날짜 선택기로 날짜 탐색
- [x] 방문 장소 추가/수정/삭제 (장소명, 주소, 시간, 메모, 카테고리)
- [x] 방문 완료 체크 토글
- [x] 진행률 프로그레스 바

## Frontend - 여행 일기
- [x] 날짜별 일기 작성/수정 (텍스트, 감정 태그, 날씨 태그)
- [x] 일기 뷰/편집 모드 전환

## Frontend - 지도 시각화
- [x] 지도 컴포넌트 통합 (Map.tsx 활용)
- [x] 하루별 방문 장소 핀 표시 (번호+카테고리 색상)
- [x] 장소 간 경로 연결 (Directions API)
- [x] 날짜 선택으로 동선 전환

## 테스트 & 배포
- [x] Vitest 테스트 작성 (9개 통과)
- [x] TypeScript 오류 수정
- [x] 최종 점검 및 체크포인트 저장
