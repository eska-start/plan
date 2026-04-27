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
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: Infinity,
  });

  // 3초 이상 로딩 → 안내 메시지 표시 (콜드스타트 해결 환경 기준)
  const [slowLoading, setSlowLoading] = useState(false);
  // fetch 타임아웃(8s)이 iOS에서 제대로 작동하지 않을 때를 대비한 안전망 — 10초 후 강제 비인증
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!meQuery.isLoading) { setSlowLoading(false); return; }
    const t = setTimeout(() => setSlowLoading(true), 3_000);
    return () => clearTimeout(t);
  }, [meQuery.isLoading]);

  // authTimedOut: 마운트 기준 1회 발동, 데이터 도착 시 리셋
  useEffect(() => {
    const t = setTimeout(() => setAuthTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (meQuery.data) setAuthTimedOut(false);
  }, [meQuery.data]);

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
    // authTimedOut 시 로딩 강제 종료 → AuthScreen 표시
    loading: authTimedOut ? false : (meQuery.isLoading || logoutMutation.isPending),
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: authTimedOut ? false : Boolean(meQuery.data),
  }), [
    authTimedOut,
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
