import { useRef, useState } from "react";
import { Camera, FolderOpen, Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface OcrUploadButtonProps {
  onExtracted: (data: Record<string, string | null>) => void;
  uploadEndpoint?: string;
  extractEndpoint: (imageUrl: string) => Promise<Record<string, string | null>>;
  label?: string;
}

/**
 * 사진 업로드 → 서버 OCR 추출 → 결과 콜백
 * - 카메라 촬영 (모바일)
 * - 파일 선택 (갤러리 / 데스크탑 파일)
 */
export function OcrUploadButton({ onExtracted, extractEndpoint, label = "사진으로 자동 입력" }: OcrUploadButtonProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("파일 크기는 16MB 이하여야 합니다.");
      return;
    }

    setLoading(true);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    try {
      // 1. 서버에 이미지 업로드 (multipart)
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload-ocr", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
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

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  return (
    <div className="mb-4 space-y-2">
      {/* 숨겨진 인풋 - 카메라 전용 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />
      {/* 숨겨진 인풋 - 파일 선택 전용 (capture 없음) */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        className="hidden"
        onChange={onInputChange}
      />

      {loading ? (
        <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 text-sm font-medium text-primary">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>이미지 분석 중...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* 카메라 촬영 버튼 */}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-sm font-medium text-primary"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>카메라 촬영</span>
          </button>

          {/* 파일 선택 버튼 */}
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

      {/* AI 자동 입력 안내 */}
      {!loading && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="w-3 h-3 text-primary/60" />
          예약 확인서·티켓 사진을 올리면 AI가 자동으로 정보를 입력합니다
        </p>
      )}

      {/* 미리보기 */}
      {preview && !loading && (
        <div className="mt-1 relative inline-block">
          <img
            src={preview}
            alt="업로드된 이미지"
            className="h-20 w-auto rounded-lg object-cover border border-border shadow-sm"
          />
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
