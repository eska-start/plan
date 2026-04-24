import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), "data", "uploads");

function getUploadRoot() {
  return process.env.LOCAL_UPLOAD_DIR?.trim() || DEFAULT_UPLOAD_ROOT;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\.\.+/g, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function ensureDirForKey(key: string) {
  const dir = path.dirname(path.join(getUploadRoot(), key));
  await fs.mkdir(dir, { recursive: true });
}

export function resolveUploadFilePath(key: string): string {
  return path.join(getUploadRoot(), normalizeKey(key));
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const fullPath = resolveUploadFilePath(key);
  await ensureDirForKey(key);
  const payload = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await fs.writeFile(fullPath, payload);
  return { key, url: `/uploads/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/uploads/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return `/uploads/${key}`;
}
