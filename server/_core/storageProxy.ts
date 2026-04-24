import type { Express } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveUploadFilePath } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/uploads/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const normalized = key.replace(/^\/+/, "");
      const filePath = resolveUploadFilePath(normalized);
      const root = path.resolve(process.env.LOCAL_UPLOAD_DIR?.trim() || path.resolve(process.cwd(), "data", "uploads"));
      const resolved = path.resolve(filePath);
      const relative = path.relative(root, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        res.status(400).send("Invalid storage key");
        return;
      }

      await fs.access(resolved);
      res.sendFile(resolved);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(404).send("File not found");
    }
  });
}
