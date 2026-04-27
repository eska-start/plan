import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

(window as Window & { __APP_BOOTSTRAPPED__?: boolean }).__APP_BOOTSTRAPPED__ = true;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
      // 인증 오류 시 자동 리다이렉트 제거 — 리다이렉트 루프 방지
      // 각 페이지에서 isAuthenticated 상태로 직접 처리
      retry: false,
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
    // iOS Safari에서 로그인 후 새로고침 시 batch 요청이 오래 걸리며 흰 화면처럼 멈추는 케이스 완화:
    // batch 대신 단일 요청 링크로 전환해 한 요청 지연이 전체 초기 렌더를 막지 않도록 함.
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        // 30s timeout + React Query's own cancellation signal combined
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30_000);
        const onRQAbort = () => ctrl.abort();
        init?.signal?.addEventListener("abort", onRQAbort, { once: true });
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          signal: ctrl.signal,
        }).finally(() => {
          clearTimeout(t);
          init?.signal?.removeEventListener("abort", onRQAbort);
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
