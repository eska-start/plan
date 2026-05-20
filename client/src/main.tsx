import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const TRPC_REQUEST_TIMEOUT_MS = 10000;
const PLANLOG_ICON_SRC = "/apple-touch-icon.svg?v=planlog-2";

function replaceLegacyLogoNear(element: Element) {
  const groups = [
    element.closest(".text-center"),
    element.closest(".flex"),
    element.parentElement,
    element.parentElement?.parentElement,
  ].filter(Boolean) as Element[];

  for (const group of groups) {
    const legacyLogo = group.querySelector("svg:not([data-planlog-logo]), img:not([data-planlog-logo])");
    if (!legacyLogo) continue;

    const img = document.createElement("img");
    img.src = PLANLOG_ICON_SRC;
    img.alt = "플랜로그";
    img.dataset.planlogLogo = "true";
    img.draggable = false;
    img.className = legacyLogo.getAttribute("class") || "rounded-lg shrink-0";
    img.style.width = legacyLogo.getAttribute("width") ? `${legacyLogo.getAttribute("width")}px` : "32px";
    img.style.height = legacyLogo.getAttribute("height") ? `${legacyLogo.getAttribute("height")}px` : "32px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "10px";
    legacyLogo.replaceWith(img);
    break;
  }
}

function applyPlanLogBranding() {
  const elements = Array.from(document.querySelectorAll("h1, h2, span, p, a"));

  for (const element of elements) {
    const text = element.textContent?.trim();
    if (!text) continue;

    if (text.includes("Voya") || text.includes("Travel Journal") || text.includes("Voya·journal")) {
      element.textContent = "플랜로그";
      element.classList.add("planlog-brand-text");
      replaceLegacyLogoNear(element);
    }
  }
}

const brandObserver = new MutationObserver(() => applyPlanLogBranding());
brandObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

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

const root = createRoot(document.getElementById("root")!);

root.render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

queueMicrotask(applyPlanLogBranding);
requestAnimationFrame(applyPlanLogBranding);

const splash = document.getElementById("planlog-splash");
if (splash) {
  if (sessionStorage.getItem("splash-shown")) {
    splash.remove();
  } else {
    sessionStorage.setItem("splash-shown", "1");
    setTimeout(() => {
      splash.classList.add("is-hiding");
      setTimeout(() => {
        splash.remove();
        requestAnimationFrame(applyPlanLogBranding);
      }, 320);
    }, 2200);
  }
}
