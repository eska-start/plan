import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Loader2, Plane, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function JoinTrip() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading: authLoading, authStuck, refresh } = useAuth();
  const [status, setStatus] = useState<"idle" | "joining" | "success" | "error">("idle");
  const [tripInfo, setTripInfo] = useState<{ tripId: number; tripName: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const joinMutation = trpc.sharing.joinByToken.useMutation({
    onSuccess: (data) => {
      setTripInfo(data);
      setStatus("success");
    },
    onError: (err) => {
      setErrorMsg(err.message || "참여에 실패했습니다.");
      setStatus("error");
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return; // 로그인 후 다시 진입
    if (status === "idle" && token) {
      setStatus("joining");
      joinMutation.mutate({ token });
    }
  }, [authLoading, isAuthenticated, token, status]);

  if (authLoading && !authStuck) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authStuck) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-base font-semibold text-foreground">인증 확인이 지연되고 있어요</p>
        <p className="text-sm text-muted-foreground text-center">
          브라우저에서 요청이 멈춘 상태일 수 있어요. 다시 시도해주세요.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>다시 시도</Button>
          <Button onClick={() => window.location.reload()}>새로고침</Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Plane className="w-6 h-6 text-primary" />
        </div>
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">여행에 초대받으셨습니다</h1>
          <p className="text-sm text-muted-foreground">참여하려면 먼저 로그인해주세요.</p>
        </div>
        <Button
          onClick={() => window.location.href = getLoginUrl()}
          className="w-full max-w-xs"
        >
          로그인 후 참여하기
        </Button>
      </div>
    );
  }

  if (status === "joining") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">여행에 참여하는 중...</p>
      </div>
    );
  }

  if (status === "success" && tripInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-emerald-500" />
        </div>
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">참여 완료!</h1>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{tripInfo.tripName}</strong> 여행에 참여했습니다.
          </p>
        </div>
        <Button
          onClick={() => setLocation(`/trips/${tripInfo.tripId}`)}
          className="w-full max-w-xs"
        >
          여행 보러가기
        </Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-red-500" />
        </div>
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">참여 실패</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/")} className="w-full max-w-xs">
          홈으로 돌아가기
        </Button>
      </div>
    );
  }

  return null;
}
