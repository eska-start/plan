import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { AnalysisMode, DocumentType, FieldVerification } from "@shared/vision";
import { verifyFields } from "@shared/vision";
import { localDocFromText } from "@shared/localDoc";
import {
  captureImage,
  getAnalysisMode,
  getCloudConsent,
  getCloudKey,
  isNativeApp,
  ocrImage,
  setAnalysisMode,
  setCloudConsent,
  setCloudKey,
} from "@/lib/capBridge";
import { analyzeWithUserKey } from "@/lib/cloudVision";
import { Filesystem } from "@capacitor/filesystem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, FolderOpen, MinusCircle, ShieldAlert } from "lucide-react";

type AnalyzeResult = {
  docType: DocumentType;
  mode: AnalysisMode;
  localEngine: string;
  localNote: string | null;
  cloudEngine: string | null;
  cloudSkipped: string | null;
  fields: FieldVerification[];
  conflictCount: number;
};

const STATUS_STYLE: Record<string, string> = {
  matched: "border-emerald-200 bg-emerald-50",
  conflict: "border-red-300 bg-red-50",
  missing: "border-amber-300 bg-amber-50",
  invalid: "border-red-400 bg-red-100",
  single_source: "border-slate-200 bg-slate-50",
  confirmed: "border-blue-300 bg-blue-50",
};

const NATIVE = isNativeApp();

/**
 * AI 분석 결과 확인 UI (11항).
 * - 웹: 서버 vision.analyze (OCR.space + 클라우드 프록시)
 * - 네이티브: ML Kit 온디바이스 OCR + 구조분석, 정밀모드는 사용자 키로 클라우드 직통
 * - 확인 전까지 임시 데이터, 확인 후에만 일정에 등록
 */
export function VisionReview({
  docType,
  onConfirm,
}: {
  docType: DocumentType;
  onConfirm: (values: Record<string, string>) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState<string>("");
  const [mode, setMode] = useState<AnalysisMode>("smart");
  const [cloudConsent, setConsent] = useState(false);
  const [cloudKey, setKey] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState(0);
  const [working, setWorking] = useState(false);

  // 네이티브 설정 로드
  useEffect(() => {
    if (NATIVE) {
      getAnalysisMode().then(setMode).catch(() => {});
      getCloudConsent().then(setConsent).catch(() => {});
      getCloudKey().then(setKey).catch(() => {});
    }
  }, []);

  const analyze = trpc.vision.analyze.useMutation({
    onSuccess: (r) => {
      setResult(r as AnalyzeResult);
      setAttempts((a) => a + 1);
    },
    onError: () => toast.error("분석 실패. 로컬 OCR만으로 직접 입력해주세요."),
  });

  const pickNative = async (source: "camera" | "gallery") => {
    const img = await captureImage(source);
    if (!img) return;
    setLocalPath(img.path);
    setPreviewUrl(img.previewUrl);
    setImageUrl("");
    setResult(null);
  };

  const runNative = async () => {
    if (!localPath) {
      toast.error("먼저 예약 이미지를 선택해주세요.");
      return;
    }
    if ((mode === "smart" || mode === "precise") && !cloudConsent) {
      toast.error("클라우드 분석은 외부 전송 동의가 필요합니다.");
      return;
    }
    if (attempts >= 2 && mode === "precise") {
      toast.error("재분석은 2회까지만 가능합니다.");
      return;
    }
    setWorking(true);
    try {
      await setAnalysisMode(mode);
      const { text } = await ocrImage(localPath);
      const local = localDocFromText(text, docType);
      const filled = Object.values(local).filter((v) => v != null).length;
      const needCloud = mode === "precise" || (mode === "smart" && filled <= 2);
      let cloud: Record<string, string | null> | null = null;
      let cloudSkipped: string | null = "not-needed";
      let cloudEngine: string | null = null;
      if (needCloud) {
        if (!cloudKey) {
          cloudSkipped = "no-key";
        } else {
          try {
            const file = await Filesystem.readFile({ path: localPath });
            const data = typeof file.data === "string" ? file.data : "";
            cloud = await analyzeWithUserKey(data, "image/jpeg", docType, cloudKey);
            cloudEngine = "cloud-vision(user-key)";
            cloudSkipped = null;
          } catch {
            cloudSkipped = "cloud-failed";
          }
        }
      }
      const fields = verifyFields(docType, local, cloud);
      setResult({
        docType,
        mode,
        localEngine: "mlkit-ocr",
        localNote: "온디바이스 ML Kit OCR + 구조분석",
        cloudEngine,
        cloudSkipped,
        fields,
        conflictCount: fields.filter((f) => f.status === "conflict").length,
      });
      setAttempts((a) => a + 1);
    } catch {
      toast.error("온디바이스 분석 실패. 직접 입력해주세요.");
    } finally {
      setWorking(false);
    }
  };

  const run = () => {
    if (NATIVE) {
      void runNative();
      return;
    }
    if (!imageUrl) {
      toast.error("먼저 예약 이미지를 선택해주세요.");
      return;
    }
    if ((mode === "smart" || mode === "precise") && !cloudConsent) {
      toast.error("클라우드 분석은 외부 전송 동의가 필요합니다.");
      return;
    }
    if (attempts >= 2 && mode === "precise") {
      toast.error("재분석은 2회까지만 가능합니다.");
      return;
    }
    localStorage.setItem("plan-analysis-mode", mode);
    analyze.mutate({ imageUrl, docType, mode, cloudConsent });
  };

  const busy = working || analyze.isPending;

  const valueOf = (f: FieldVerification) =>
    edits[f.field] ?? f.finalValue ?? f.localValue ?? f.cloudValue ?? "";

  const confirm = () => {
    if (!result) return;
    const values: Record<string, string> = {};
    for (const f of result.fields) {
      const v = valueOf(f).trim();
      if (!v) continue;
      if (f.status === "conflict" || f.status === "invalid" || f.status === "missing") {
        if (!edits[f.field]) {
          toast.error(`"${f.field}" 확인 필요 — 직접 수정 후 등록해주세요.`);
          return;
        }
      }
      values[f.field] = v;
    }
    onConfirm(values);
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-3 bg-card">
      {NATIVE ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void pickNative("camera")}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 text-sm font-medium text-primary"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>카메라 촬영</span>
          </button>
          <button
            type="button"
            onClick={() => void pickNative("gallery")}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 text-sm font-medium text-indigo-600"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>갤러리</span>
          </button>
        </div>
      ) : (
        <Input
          type="file"
          accept="image/*,image/heic,image/heif,application/pdf"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPreviewUrl(URL.createObjectURL(file));
            const fd = new FormData();
            fd.append("file", file);
            try {
              const up = await fetch("/api/upload-ocr", { method: "POST", body: fd, credentials: "include" });
              if (!up.ok) throw new Error("upload");
              const { url } = (await up.json()) as { url: string };
              setImageUrl(url);
              setResult(null);
            } catch {
              toast.error("이미지 업로드 실패");
            }
            e.target.value = "";
          }}
        />
      )}
      {previewUrl && (
        <img src={previewUrl} alt="원본 예약 스크린샷" className="h-28 w-auto rounded-lg border object-cover" />
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">문서: {docType}</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AnalysisMode)}
          className="h-8 rounded-md border px-2"
          aria-label="분석 모드"
        >
          <option value="local">로컬 전용</option>
          <option value="smart">스마트 자동</option>
          <option value="precise">정밀 교차 검증</option>
        </select>
        {(mode === "smart" || mode === "precise") && (
          <label className="flex items-center gap-1 text-muted-foreground">
            <input
              type="checkbox"
              checked={cloudConsent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (NATIVE) void setCloudConsent(e.target.checked);
              }}
            />
            클라우드 전송 동의
          </label>
        )}
        <Button size="sm" onClick={run} disabled={busy}>
          {busy ? "분석 중..." : result ? "다시 분석" : "AI 분석"}
        </Button>
      </div>

      {NATIVE && mode !== "local" && (
        <div className="space-y-1">
          <Label className="text-[11px]">클라우드 API 키 (본인 키, 기기 내 저장)</Label>
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              type="password"
              placeholder="Gemini API 키 (정밀 분석 시만 사용)"
              value={cloudKey}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void setCloudKey(cloudKey);
                toast.success("키를 기기에 저장했습니다.");
              }}
            >
              저장
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="text-xs text-muted-foreground">
          로컬: {result.localEngine} · 클라우드: {result.cloudEngine ?? result.cloudSkipped} · 충돌{" "}
          {result.conflictCount}건 {result.localNote ? `· ${result.localNote}` : ""}
        </div>
      )}

      {result?.fields.map((f) => (
        <div key={f.field} className={`rounded-lg border p-2 ${STATUS_STYLE[f.status] ?? ""}`}>
          <div className="flex items-center gap-1 text-xs font-semibold">
            {f.status === "matched" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {f.status === "conflict" && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
            {f.status === "invalid" && <ShieldAlert className="w-3.5 h-3.5 text-red-700" />}
            {f.status === "missing" && <MinusCircle className="w-3.5 h-3.5 text-amber-600" />}
            <span>{f.field}</span>
            <span className="ml-auto font-normal text-muted-foreground">{f.status}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            로컬: {f.localValue ?? "-"} · 클라우드: {f.cloudValue ?? "-"}
            {f.evidence.length > 0 && ` · ${f.evidence.join("; ")}`}
          </div>
          <div className="mt-1">
            <Label className="text-[11px]">최종값 (직접 수정 가능)</Label>
            <Input
              className="h-8 text-xs"
              value={valueOf(f)}
              onChange={(e) => setEdits((s) => ({ ...s, [f.field]: e.target.value }))}
            />
          </div>
        </div>
      ))}

      {result && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setResult(null)}>
            취소
          </Button>
          <Button className="flex-1" onClick={confirm}>
            확인 후 일정에 등록
          </Button>
        </div>
      )}
    </div>
  );
}
