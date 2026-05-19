import { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("이미지 파일만 업로드 가능합니다."));
  },
});

export function registerUploadRoutes(app: import("express").Express) {
  const router = Router();

  const handleImageUpload = (prefix: "ocr" | "notice") => async (req: import("express").Request, res: import("express").Response) => {
    upload.single("file")(req, res, async (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "업로드 실패";
        res.status(400).json({ error: message });
        return;
      }
      try {
        if (!req.file) {
          res.status(400).json({ error: "파일이 없습니다." });
          return;
        }
        const ext = req.file.originalname.split(".").pop() ?? "jpg";
        const key = `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const absoluteUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
        res.json({ url: absoluteUrl, key });
      } catch (e) {
        console.error(`[upload-${prefix}]`, e);
        res.status(500).json({ error: "업로드 실패" });
      }
    });
  };

  router.post("/api/upload-ocr", handleImageUpload("ocr"));

  router.post("/api/upload-notice", handleImageUpload("notice"));

  app.use(router);
}
