import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

(window as Window & { __APP_BOOTSTRAPPED__?: boolean }).__APP_BOOTSTRAPPED__ = true;
const TRPC_REQUEST_TIMEOUT_MS = 10_000;
const MIN_SPLASH_MS = 2200;

const PLANLOG_ICON_MARKUP = `
<svg viewBox="0 0 64 64" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" data-planlog-logo="true" aria-hidden="true">
  <defs>
    <linearGradient id="pl-small-pin" x1="18" y1="9" x2="49" y2="54" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3B82F6"/><stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
    <linearGradient id="pl-small-green" x1="11" y1="41" x2="29" y2="53" gradientUnits="userSpaceOnUse">
      <stop stop-color="#87DCCA"/><stop offset="1" stop-color="#55C7A9"/>
    </linearGradient>
    <linearGradient id="pl-small-blue" x1="38" y1="41" x2="56" y2="53" gradientUnits="userSpaceOnUse">
      <stop stop-color="#77B7FF"/><stop offset="1" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
  <path d="M12 44C12 41 15 39 18 40L28 42C30 43 31 44 31 46L32 54C32 57 30 59 27 58L14 55C12 55 11 53 11 51L12 44Z" fill="url(#pl-small-green)"/>
  <path d="M32 43L38 41C41 40 43 42 44 45L45 54C45 57 43 59 40 58L33 55C32 55 31 53 31 51L31 46C31 44 31 43 32 43Z" fill="#E5E7EB"/>
  <path d="M44 42L55 40C58 39 60 41 59 44L58 51C58 53 57 55 55 55L42 58C39 59 37 57 38 54L40 46C41 44 42 42 44 42Z" fill="url(#pl-small-blue)"/>
  <path d="M32 6C21 6 13 14 13 25C13 41 32 55 32 55C32 55 51 41 51 25C51 14 43 6 32 6Z" fill="url(#pl-small-pin)"/>
  <circle cx="32" cy="25" r="11" fill="white"/>
  <path d="M26 25L30 29L38 20" stroke="#2563EB" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function replaceNearbyLogo(element: Element) {
  const candidateGroups = [
    element.closest(".text-center"),
    element.closest(".flex"),
    element.parentElement,
    element.parentElement?.parentElement,
  ].filter(Boolean) as Element[];

  for (const group of candidateGroups) {
    const svg = group.querySelector("svg:not([data-planlog-logo])");
    if (svg) {
      svg.outerHTML = PLANLOG_ICON_MARKUP;
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

  document.querySelectorAll("svg:not([data-planlog-logo])").forEach(svg => {
    const parentText = svg.parentElement?.textContent ?? "";
    const nearbyText = svg.parentElement?.parentElement?.textContent ?? "";
    if (parentText.includes("플랜로그") || nearbyText.includes("플랜로그")) {
      svg.outerHTML = PLANLOG_ICON_MARKUP;
    }
  });
}

const brandObserver = new MutationObserver(() => applyPlanLogBranding());
brandObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
queueMicrotask(applyPlanLogBranding);
setInterval(applyPlanLogBranding, 350);

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

setTimeout(() => {
  root.render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
  requestAnimationFrame(applyPlanLogBranding);
}, MIN_SPLASH_MS);
