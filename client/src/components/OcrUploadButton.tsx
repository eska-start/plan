import { useRef, useState } from "react";
import { Camera, FolderOpen, Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface OcrUploadButtonProps<T extends Record<string, unknown>> {
  onExtracted: (data: T) => void;
  extractEndpoint: (imageBase64: string) => Promise<T>;
  label?: string;
}

function resizeToBase64(file: File, maxPx = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function OcrUploadButton<T extends Record<string, unknown>>({ onExtracted, extractEndpoint, label = "사진으로 자동 입력" }: OcrUploadButtonProps<T>) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("파일 크기는 20MB 이하여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const base64 = await resizeToBase64(file);
      setPreview(base64);
      const extracted = await extractEndpoint(base64);
      onExtracted(extracted);
      toast.success("정보가 자동으로 입력되었습니다. 확인 후 수정해주세요.");
    } catch (e) {
      console.error(e);
      toast.error("이미지 분석에 실패했습니다. 직접 입력해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  return (
    <div className="mb-4 space-y-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onInputChange} />
      <input ref={fileRef} type="file" accept="image/*,image/heic,image/heif" className="hidden" onChange={onInputChange} />

      {loading ? (
        <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 text-sm font-medium text-primary">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>이미지 분석 중...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-sm font-medium text-primary"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>카메라 촬영</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition-all text-sm font-medium text-indigo-600"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span>파일 선택</span>
          </button>
        </div>
      )}

      {!loading && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="w-3 h-3 text-primary/60" />
          예약 확인서·티켓 사진을 올리면 AI가 자동으로 정보를 입력합니다
        </p>
      )}

      {preview && !loading && (
        <div className="mt-1 relative inline-block">
          <img src={preview} alt="업로드된 이미지" className="h-20 w-auto rounded-lg object-cover border border-border shadow-sm" />
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-muted shadow-sm"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
