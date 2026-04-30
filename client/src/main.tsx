import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

(window as Window & { __APP_BOOTSTRAPPED__?: boolean }).__APP_BOOTSTRAPPED__ = true;
const TRPC_REQUEST_TIMEOUT_MS = 10_000;

const PLANLOG_ICON_MARKUP = `
<svg viewBox="0 0 64 64" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" data-planlog-logo="true" aria-hidden="true">
  <rect width="64" height="64" rx="17" fill="#EFF6FF"/>
  <path d="M12 46C18 41 24 43 31 46C38 49 46 49 52 43" stroke="#34D399" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 9C22.6 9 15 16.6 15 26C15 39.5 32 54 32 54C32 54 49 39.5 49 26C49 16.6 41.4 9 32 9Z" fill="#3B82F6"/>
  <circle cx="32" cy="26" r="11" fill="white"/>
  <path d="M26 26L30 30L38 21" stroke="#2563EB" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function applyPlanLogBranding() {
  const brandTexts = Array.from(document.querySelectorAll("h1, span, p"));

  brandTexts.forEach(element => {
    const text = element.textContent?.trim();
    if (!text) return;

    if (text.includes("Voya") || text.includes("Travel Journal")) {
      element.textContent = "플랜로그";
      element.classList.add("planlog-brand-text");
    }
  });

  document.querySelectorAll(".planlog-brand-text").forEach(element => {
    const headerGroup = element.closest(".text-center, .flex, div");
    const targetSvg = headerGroup?.querySelector("svg:not([data-planlog-logo])");
    if (targetSvg) {
      targetSvg.outerHTML = PLANLOG_ICON_MARKUP;
    }
  });
}

const brandObserver = new MutationObserver(() => applyPlanLogBranding());
brandObserver.observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(applyPlanLogBranding);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // 인증 오류 시 자동 리다이렉트 제거 — 리다이렉트 루프 방지
      // 각 페이지에서 isAuthenticated 상태로 직접 처리
      retry: 1,
      retryDelay: 1_000,
    },
  },
});

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    // 전체 왕복 횟수를 줄이기 위해 batch 링크 사용.
    // 각 batch 요청에도 abort timeout을 적용해 무한 대기 방지.
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), TRPC_REQUEST_TIMEOUT_MS);
        const onAbort = () => ctrl.abort();
        init?.signal?.addEventListener("abort", onAbort, { once: true });

        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          signal: ctrl.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
          init?.signal?.removeEventListener("abort", onAbort);
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
