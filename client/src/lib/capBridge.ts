import { mergeOcrLines, type OcrLine } from "@shared/ocrLayout";
/**
 * Capacitor 네이티브 브리지 (Android).
 * - 카메라/갤러리 촬영 → ML Kit OCR(한국어+영문) → 텍스트
 * - 설정/키는 Preferences (API 키 하드코딩 없음, 사용자 입력 키만 저장)
 * - SQLite: mobileDb 경유. 확인 전 임시 검증 결과 저장 큐 포함
 */
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Preferences } from "@capacitor/preferences";
import { Script, TextRecognition } from "@capacitor-mlkit/text-recognition";
import { Capacitor } from "@capacitor/core";
import type { AnalysisMode } from "@shared/vision";

export type CapImage = { path: string; previewUrl: string; source: "camera" | "gallery" };

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isMlKitAvailable(): boolean {
  return isNativeApp();
}

export async function captureImage(source: "camera" | "gallery"): Promise<CapImage | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 100,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });
    if (!photo.path || !photo.webPath) throw new Error("IMAGE_PATH_UNAVAILABLE");
    return { path: photo.path, previewUrl: photo.webPath, source };
  } catch (e) {
    if (/cancel|취소/i.test(e instanceof Error ? e.message : String(e))) return null;
    throw e;
  }
}

/**
 * ML Kit 온디바이스 OCR. 한국어+영문 모델을 각각 실행 후 병합.
 * 좌표(blocks)는 필요시 확대 재분석에 사용.
 */
export async function ocrImage(imagePath: string): Promise<{ text: string; blocks: number; lines: OcrLine[] }> {
  const runs = [];
  const errors: string[] = [];
  for (const script of [Script.Korean, Script.Latin]) {
    try { runs.push(await TextRecognition.processImage({ path: imagePath, script })); }
    catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  if (!runs.length) throw new Error(`OCR_ENGINE_FAILED: ${errors.join("; ")}`);
  const texts = runs.filter((r) => r && r.text.trim()).map((r) => (r as { text: string }).text);
  const observations: OcrLine[] = [];
  for (const run of runs) for (const block of run.blocks) for (const line of block.lines) {
    const box = line.boundingBox;
    if (box) observations.push({ text: line.text, ...box });
  }
  const lines = mergeOcrLines(observations);
  // Keep spatially distinct duplicate dates/times. The layout parser uses coordinates.
  const text = lines.length ? lines.map(line => line.text).join("\n") : texts[0] ?? "";
  if (!text.trim()) throw new Error("OCR_EMPTY_TEXT");
  return { text, blocks: runs.reduce((n, run) => n + run.blocks.length, 0), lines };
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
