import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    staleTime: Infinity,
  });

  // 5초 이상 로딩 → 콜드스타트 안내 메시지 표시
  const [slowLoading, setSlowLoading] = useState(false);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  useEffect(() => {
    if (!meQuery.isLoading) { setSlowLoading(false); return; }
    const t = setTimeout(() => setSlowLoading(true), 5_000);
    return () => clearTimeout(t);
  }, [meQuery.isLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refetchAuth = () => {
      if (logoutMutation.isPending) return;
      void meQuery.refetch();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refetchAuth();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refetchAuth();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refetchAuth);
    window.addEventListener("online", refetchAuth);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refetchAuth);
      window.removeEventListener("online", refetchAuth);
    };
  }, [logoutMutation.isPending, meQuery.refetch]);

  useEffect(() => {
    if (!meQuery.isLoading || logoutMutation.isPending) return;

    const t = setTimeout(() => {
      void meQuery.refetch();
    }, 15_000);

    return () => clearTimeout(t);
  }, [logoutMutation.isPending, meQuery.isLoading, meQuery.refetch]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  // localStorage는 useMemo 밖 useEffect에서만 — Safari에서 useMemo 안 사이드이펙트가 SecurityError 유발
  useEffect(() => {
    try {
      localStorage.setItem("runtime-user-info", JSON.stringify(meQuery.data ?? null));
    } catch {
      // Safari 프라이버시 모드 등에서 localStorage 차단 시 무시
    }
  }, [meQuery.data]);

  const state = useMemo(() => ({
    user: meQuery.data ?? null,
    loading: meQuery.isLoading || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
  }), [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    slowLoading,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
