/**
 * Capacitor 네이티브 브리지 (Android).
 * - 카메라/갤러리/공유시트 이미지 → File/Blob 정규화
 * - PDF 첫 페이지 렌더는 서버 업로드 후 처리 (클라 무거운 렌더 금지)
 * - SQLite: 웹은 drizzle-mysql/tRPC, 앱 오프라인 임시저장은 localStorage 큐 → 온라인 시 동기화
 * - ML Kit OCR: 웹뷰 JS가 아닌 네이티브 플러그인에서 수행 후 텍스트+좌표 반환 (플러그인 미설치 시 서버 OCR 폴백)
 */

export type CapImage = { file: File; previewUrl: string; source: "camera" | "gallery" | "share" | "file" };

export function isNativeApp(): boolean {
  return (
    typeof window !== "undefined" &&
    ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ??
      false)
  );
}

export async function pickImage(source: "camera" | "gallery"): Promise<CapImage | null> {
  // 네이티브 플러그인(Camera) 있으면 여기서 분기. 없으면 기존 <input capture> 폴백을 호출자가 사용.
  void source;
  return null;
}

/** 확인 전 임시 검증 결과 저장 큐 (SQLite 대체 전 단계: localStorage) */
const QUEUE_KEY = "plan-vision-pending-queue";
export function queuePendingVision(entry: Record<string, unknown>): void {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as unknown[];
    q.push({ ...entry, queuedAt: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
  } catch {
    /* storage optional */
  }
}
