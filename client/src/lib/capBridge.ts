/**
 * Capacitor 네이티브 브리지 (Android).
 * - 카메라/갤러리 촬영 → ML Kit OCR(한국어+영문) → 텍스트
 * - 설정/키는 Preferences (API 키 하드코딩 없음, 사용자 입력 키만 저장)
 * - SQLite: mobileDb 경유. 확인 전 임시 검증 결과 저장 큐 포함
 */
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Preferences } from "@capacitor/preferences";
import { Script, TextRecognition } from "@capacitor-mlkit/text-recognition";
import type { AnalysisMode } from "@shared/vision";

export type CapImage = { path: string; previewUrl: string; source: "camera" | "gallery" };

export function isNativeApp(): boolean {
  return (
    typeof window !== "undefined" &&
    ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ??
      false)
  );
}

export function isMlKitAvailable(): boolean {
  return isNativeApp();
}

export async function captureImage(source: "camera" | "gallery"): Promise<CapImage | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });
    if (!photo.path || !photo.webPath) return null;
    return { path: photo.path, previewUrl: photo.webPath, source };
  } catch {
    return null; // 사용자 취소 등
  }
}

/**
 * ML Kit 온디바이스 OCR. 한국어+영문 모델을 각각 실행 후 병합.
 * 좌표(blocks)는 필요시 확대 재분석에 사용.
 */
export async function ocrImage(imagePath: string): Promise<{ text: string; blocks: number }> {
  const runs = await Promise.all([
    TextRecognition.processImage({ path: imagePath, script: Script.Korean }).catch(() => null),
    TextRecognition.processImage({ path: imagePath, script: Script.Latin }).catch(() => null),
  ]);
  const texts = runs.filter((r) => r && r.text.trim()).map((r) => (r as { text: string }).text);
  // 완전히 동일한 줄 중복 제거
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const t of texts) {
    for (const line of t.split("\n")) {
      const s = line.trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      merged.push(line);
    }
  }
  const blockCount = runs.reduce((n, r) => n + (r?.blocks?.length ?? 0), 0);
  return { text: merged.join("\n"), blocks: blockCount };
}

// ─── 설정 (Preferences) ───
const K_MODE = "plan-analysis-mode";
const K_CLOUD_KEY = "plan-cloud-key";
const K_CLOUD_CONSENT = "plan-cloud-consent";

export async function getAnalysisMode(): Promise<AnalysisMode> {
  const { value } = await Preferences.get({ key: K_MODE }).catch(() => ({ value: null }));
  return value === "local" || value === "precise" ? value : "smart";
}

export async function setAnalysisMode(mode: AnalysisMode): Promise<void> {
  await Preferences.set({ key: K_MODE, value: mode });
}

export async function getCloudKey(): Promise<string> {
  const { value } = await Preferences.get({ key: K_CLOUD_KEY }).catch(() => ({ value: null }));
  return value ?? "";
}

export async function setCloudKey(key: string): Promise<void> {
  if (key) await Preferences.set({ key: K_CLOUD_KEY, value: key });
  else await Preferences.remove({ key: K_CLOUD_KEY });
}

export async function getCloudConsent(): Promise<boolean> {
  const { value } = await Preferences.get({ key: K_CLOUD_CONSENT }).catch(() => ({ value: null }));
  return value === "1";
}

export async function setCloudConsent(on: boolean): Promise<void> {
  await Preferences.set({ key: K_CLOUD_CONSENT, value: on ? "1" : "0" });
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
