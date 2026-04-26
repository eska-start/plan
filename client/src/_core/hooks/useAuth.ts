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
  });


  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!meQuery.isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const t = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [meQuery.isLoading]);

  // 5초 이상 로딩 중 → Render 서버 콜드스타트 안내
  const [slowLoading, setSlowLoading] = useState(false);
  useEffect(() => {
    if (!meQuery.isLoading) { setSlowLoading(false); return; }
    const t = setTimeout(() => setSlowLoading(true), 5000);
    return () => clearTimeout(t);
  }, [meQuery.isLoading]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

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
    loading: (meQuery.isLoading && !loadingTimedOut) || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
  }), [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
    loadingTimedOut,
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

  useEffect(() => {
    const refetchMe = () => {
      void meQuery.refetch();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refetchMe();
    };

    window.addEventListener("online", refetchMe);
    window.addEventListener("pageshow", refetchMe);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", refetchMe);
      window.removeEventListener("pageshow", refetchMe);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [meQuery.refetch]);

  return {
    ...state,
    slowLoading,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
