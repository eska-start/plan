import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

(window as Window & { __APP_BOOTSTRAPPED__?: boolean }).__APP_BOOTSTRAPPED__ = true;
const TRPC_REQUEST_TIMEOUT_MS = 10_000;
const PLANLOG_ICON_SRC = "/apple-touch-icon.svg?v=planlog-2";

const PLANLOG_ICON_MARKUP = `<img src="${PLANLOG_ICON_SRC}" width="32" height="32" alt="" aria-hidden="true" data-planlog-logo="true" style="border-radius:8px;display:block;object-fit:contain" />`;

function replaceNearbyLogo(element: Element) {
  const candidateGroups = [
    element.closest(".text-center"),
    element.closest(".flex"),
    element.parentElement,
    element.parentElement?.parentElement,
  ].filter(Boolean) as Element[];

  for (const group of candidateGroups) {
    const logo = group.querySelector("svg:not([data-planlog-logo]), img:not([data-planlog-logo])");
    if (logo) {
      logo.outerHTML = PLANLOG_ICON_MARKUP;
      return;
    }
  }
}

function applyPlanLogBranding() {
  const elements = Array.from(document.querySelectorAll("h1, h2, span, p, a"));

  elements.forEach(element => {
    const text = element.textContent?.trim();
    if (!text) return;

    if (text.includes("Voya") || text.includes("Travel Journal") || text.includes("Voya·journal")) {
      element.textContent = "플랜로그";
      element.classList.add("planlog-brand-text");
      replaceNearbyLogo(element);
    }
  });
}

const brandObserver = new MutationObserver(() => applyPlanLogBranding());
brandObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
queueMicrotask(applyPlanLogBranding);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
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

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

root.render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

requestAnimationFrame(applyPlanLogBranding);
