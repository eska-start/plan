import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
  const touchStartY = useRef<number | null>(null);
  const pullDistance = useRef(0);

  useEffect(() => {
    const MOBILE_WIDTH = 1024;
    const THRESHOLD_PX = 72;
    let refreshing = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= MOBILE_WIDTH || window.scrollY > 0) return;
      touchStartY.current = e.touches[0]?.clientY ?? null;
      pullDistance.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null || window.scrollY > 0) return;
      const currentY = e.touches[0]?.clientY ?? touchStartY.current;
      pullDistance.current = Math.max(0, currentY - touchStartY.current);
    };

    const onTouchEnd = () => {
      if (window.innerWidth >= MOBILE_WIDTH || refreshing) return;
      if (window.scrollY <= 0 && pullDistance.current >= THRESHOLD_PX) {
        refreshing = true;
        window.location.reload();
      }
      touchStartY.current = null;
      pullDistance.current = 0;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
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
