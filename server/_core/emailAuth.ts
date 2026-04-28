import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

type BcryptModule = {
  hash: (text: string, saltOrRounds: string | number) => Promise<string>;
  compare: (text: string, encrypted: string) => Promise<boolean>;
};

let bcryptModulePromise: Promise<BcryptModule | null> | null = null;

async function loadBcrypt(): Promise<BcryptModule | null> {
  if (!bcryptModulePromise) {
    bcryptModulePromise = import("bcryptjs")
      .then(mod => ({ hash: mod.hash, compare: mod.compare }))
      .catch(error => {
        console.error("[emailAuth] bcryptjs is not available:", error);
        return null;
      });
  }
  return bcryptModulePromise;
}

export function registerEmailAuthRoutes(app: Express) {
  // 회원가입: 아이디 + 비밀번호 + 가입 코드
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const bcrypt = await loadBcrypt();
      if (!bcrypt) {
        res.status(503).json({ error: "로그인 기능이 현재 비활성화되어 있습니다." });
        return;
      }

      const { username, password, signupSecret } = req.body ?? {};

      if (ENV.signupSecret && signupSecret !== ENV.signupSecret) {
        res.status(403).json({ error: "가입 코드가 올바르지 않습니다." });
        return;
      }
      if (!username || username.trim().length < 2) {
        res.status(400).json({ error: "아이디는 2자 이상이어야 합니다." });
        return;
      }
      if (!password || password.length < 4) {
        res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다." });
        return;
      }

      const normalized = username.trim().toLowerCase();
      const openId = `local_${normalized}`;

      const existing = await db.getUserByOpenId(openId);
      if (existing) {
        res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await db.upsertUser({ openId, name: username.trim(), loginMethod: "local", lastSignedIn: new Date() });
      await db.setUserPasswordHash(openId, passwordHash);

      const sessionToken = await sdk.createSessionToken(openId, { name: username.trim(), expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ ok: true });
    } catch (e) {
      console.error("[signup] error:", e);
      res.status(500).json({ error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
    }
  });

  // 로그인: 아이디 + 비밀번호
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const bcrypt = await loadBcrypt();
      if (!bcrypt) {
        res.status(503).json({ error: "로그인 기능이 현재 비활성화되어 있습니다." });
        return;
      }

      const { username, password } = req.body ?? {};

      if (!username || !password) {
        res.status(400).json({ error: "아이디와 비밀번호를 입력해주세요." });
        return;
      }

      const openId = `local_${username.trim().toLowerCase()}`;
      const user = await db.getUserByOpenId(openId);

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
        return;
      }

      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || username.trim(), expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ ok: true });
    } catch (e) {
      console.error("[login] error:", e);
      res.status(500).json({ error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
    }
  });
}
