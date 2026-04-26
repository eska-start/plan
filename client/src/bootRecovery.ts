// index.html의 초기 로딩 감시 스크립트와 동기화
(window as Window & { __APP_BOOTSTRAPPED__?: boolean }).__APP_BOOTSTRAPPED__ = true;

// iOS Safari에서 오래된 bfcache 복원 시 빈 화면이 남는 문제 방지
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      window.location.reload();
    }
  });
}
