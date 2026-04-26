import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import TripDetail from "./pages/TripDetail";
import JoinTrip from "./pages/JoinTrip";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/trips/:id/:tab?" component={TripDetail} />
      <Route path="/join/:token" component={JoinTrip} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // iOS Safari bfcache: page restored from cache freezes React state.
    // sessionStorage flag prevents reload loops (flag cleared on fresh loads).
    const handler = (e: PageTransitionEvent) => {
      if (!e.persisted) { sessionStorage.removeItem("_bfr"); return; }
      if (sessionStorage.getItem("_bfr")) return; // already reloaded once
      sessionStorage.setItem("_bfr", "1");
      window.location.reload();
    };
    window.addEventListener("pageshow", handler);
    return () => window.removeEventListener("pageshow", handler);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
