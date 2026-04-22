import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface OcrUploadButtonProps {
  onExtracted: (data: Record<string, string | null>) => void;
  uploadEndpoint: string; // "/api/upload-ocr"
  extractEndpoint: (imageUrl: string) => Promise<Record<string, string | null>>;
  label?: string;
}

/**
 * 사진 업로드 → 서버 OCR 추출 → 결과 콜백
 */
export function OcrUploadButton({ onExtracted, extractEndpoint, label = "사진으로 자동 입력" }: OcrUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    setLoading(true);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    try {
      // 1. 서버에 이미지 업로드 (multipart)
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload-ocr", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("이미지 업로드 실패");
      const { url } = await uploadRes.json() as { url: string };

      // 2. LLM OCR 추출
      const extracted = await extractEndpoint(url);
      onExtracted(extracted);
      toast.success("정보가 자동으로 입력되었습니다. 확인 후 수정해주세요.");
    } catch (e) {
      console.error(e);
      toast.error("이미지 분석에 실패했습니다. 직접 입력해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-sm font-medium text-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>이미지 분석 중...</span>
          </>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            <span>{label}</span>
          </>
        )}
      </button>
      {preview && !loading && (
        <div className="mt-2 relative inline-block">
          <img src={preview} alt="업로드된 이미지" className="h-16 w-auto rounded-lg object-cover border border-border" />
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-muted"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
