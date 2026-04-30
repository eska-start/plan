import fs from "node:fs/promises";
import path from "node:path";
import type { Express, Request, Response } from "express";

type NoticePayload = {
  content: string;
  updatedAt: string;
  images: string[];
};

const NOTICE_FILE = path.resolve(process.cwd(), "data", "global-notice.json");

async function readNotice(): Promise<NoticePayload | null> {
  try {
    const raw = await fs.readFile(NOTICE_FILE, "utf8");
    const parsed = JSON.parse(raw) as NoticePayload;
    if (!parsed?.content && (!parsed?.images || parsed.images.length === 0)) return null;
    return {
      content: typeof parsed.content === "string" ? parsed.content : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      images: Array.isArray(parsed.images) ? parsed.images : [],
    };
  } catch {
    return null;
  }
}

async function writeNotice(payload: NoticePayload) {
  await fs.mkdir(path.dirname(NOTICE_FILE), { recursive: true });
  await fs.writeFile(NOTICE_FILE, JSON.stringify(payload), "utf8");
}

export function registerNoticeRoutes(app: Express) {
  app.get("/api/notice", async (_req: Request, res: Response) => {
    const notice = await readNotice();
    res.json({ notice });
  });

  app.post("/api/notice", async (req: Request, res: Response) => {
    const body = req.body as NoticePayload;
    const payload: NoticePayload = {
      content: (body?.content ?? "").trim(),
      updatedAt: new Date().toISOString(),
      images: Array.isArray(body?.images) ? body.images : [],
    };
    if (!payload.content && payload.images.length === 0) {
      res.status(400).json({ error: "공지 내용 또는 이미지가 필요합니다." });
      return;
    }
    await writeNotice(payload);
    res.json({ notice: payload });
  });

  app.delete("/api/notice", async (_req: Request, res: Response) => {
    await fs.rm(NOTICE_FILE, { force: true });
    res.json({ ok: true });
  });
}
