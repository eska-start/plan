import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sanitizeGuestRedirect } from "./redirect";
import { sdk } from "./sdk";

export function registerOAuthRoutes(app: Express) {
  // Trust the proxy so req.protocol reflects the real HTTPS upstream
  app.set("trust proxy", 1);

  app.get("/api/auth/clear", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    // iOS Safari: JS redirect ensures cookie is cleared before navigation
    res.type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<script>window.location.replace("/");</script>
</head><body></body></html>`);
  });

  app.get("/api/auth/guest-login", async (req: Request, res: Response) => {
    const redirect = sanitizeGuestRedirect(
      typeof req.query.redirect === "string" ? req.query.redirect : undefined
    );
    try {
      const openId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = `게스트-${openId.slice(-4)}`;

      await db.upsertUser({
        openId,
        name,
        email: null,
        loginMethod: "guest",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // iOS Safari: HTTP 302 + Set-Cookie 동시 처리 시 쿠키가 무시되는 버그.
      // HTML 응답 후 JS로 이동하면 쿠키가 먼저 저장된 뒤 navigate → 안정적.
      const safeRedirect = JSON.stringify(redirect);
      res.type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<script>window.location.replace(${safeRedirect});</script>
</head><body></body></html>`);
    } catch (error) {
      console.error("[GuestAuth] Login failed", error);
      res.type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<script>window.location.replace("/");</script>
</head><body></body></html>`);
    }
  });

  app.get("/api/auth/guest-login", async (req: Request, res: Response) => {
    const redirect = sanitizeGuestRedirect(
      typeof req.query.redirect === "string" ? req.query.redirect : undefined
    );
    try {
      const openId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = `게스트-${openId.slice(-4)}`;

      await db.upsertUser({
        openId,
        name,
        email: null,
        loginMethod: "guest",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, redirect);
    } catch (error) {
      console.error("[GuestAuth] Login failed", error);
      res.redirect(302, "/?error=guest_auth_failed");
    }
  });
}
