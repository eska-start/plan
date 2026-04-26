import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import axios from "axios";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sanitizeGuestRedirect } from "./redirect";
import { sdk } from "./sdk";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function parseStateOrigin(state: string): { origin: string; returnPath: string } {
  try {
    // state is base64(redirectUri) where redirectUri = `${origin}/api/oauth/callback`
    const redirectUri = atob(state);
    const url = new URL(redirectUri);
    return { origin: url.origin, returnPath: "/" };
  } catch {
    return { origin: "", returnPath: "/" };
  }
}

function buildCallbackUri(req: Request): string {
  const protocol = req.protocol;
  const host = req.get("host") ?? "";
  return `${protocol}://${host}/api/auth/google-callback`;
}

async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string }> {
  const { data } = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return { accessToken: data.access_token };
}

async function getGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  name?: string;
  email?: string;
}> {
  const { data } = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export function registerOAuthRoutes(app: Express) {
  // Trust the proxy so req.protocol reflects the real HTTPS upstream
  app.set("trust proxy", 1);

  app.get("/api/auth/login", (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      console.error("[OAuth] GOOGLE_CLIENT_ID is not configured");
      res.redirect(302, "/?error=login_not_configured");
      return;
    }

    const redirectUri = buildCallbackUri(req);
    const state = btoa(redirectUri);
    console.log("[OAuth] Initiating Google login, redirectUri:", redirectUri);

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
    });

    res.redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  app.get("/api/auth/google-callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const { origin: frontendOrigin, returnPath } = parseStateOrigin(state);

    try {
      let openId: string;
      let name: string | null = null;
      let email: string | null = null;
      const loginMethod = "google";

      if (ENV.googleClientId && ENV.googleClientSecret) {
        // Direct Google OAuth flow
        const redirectUri = buildCallbackUri(req);
        console.log("[OAuth] Exchanging code, redirectUri:", redirectUri);
        const { accessToken } = await exchangeGoogleCode(code, redirectUri);
        const userInfo = await getGoogleUserInfo(accessToken);
        console.log("[OAuth] Google user:", userInfo.email);
        openId = `google_${userInfo.sub}`;
        name = userInfo.name ?? null;
        email = userInfo.email ?? null;
      } else {
        // Fallback: Manus OAuth server flow
        const tokenResponse = await sdk.exchangeCodeForToken(code, state);
        const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
        if (!userInfo.openId) {
          res.status(400).json({ error: "openId missing from user info" });
          return;
        }
        openId = userInfo.openId;
        name = userInfo.name || null;
        email = userInfo.email ?? null;
      }

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const redirectTarget = frontendOrigin ? `${frontendOrigin}${returnPath}` : "/";
      console.log("[OAuth] Redirecting to", redirectTarget);
      // iOS Safari: JS redirect ensures cookie is stored before navigation
      const safeTarget = JSON.stringify(redirectTarget);
      res.type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<script>window.location.replace(${safeTarget});</script>
</head><body></body></html>`);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      const errorTarget = frontendOrigin
        ? `${frontendOrigin}/?error=auth_failed`
        : "/?error=auth_failed";
      res.redirect(302, errorTarget);
    }
  });

  app.get("/api/auth/clear", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
}
