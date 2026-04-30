import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const TRPC_REQUEST_TIMEOUT_MS = 10000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: 1,
      retryDelay: 1000,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
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

const root = createRoot(document.getElementById("root"));

root.render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// 👉 스플래시 2.2초 유지 후 제거
const splash = document.getElementById("planlog-splash");
if (splash) {
  setTimeout(() => {
    splash.classList.add("is-hiding");
    setTimeout(() => {
      splash.remove();
    }, 320);
  }, 2200);
}
