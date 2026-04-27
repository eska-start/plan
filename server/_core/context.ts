import { parse as parseCookieHeader } from "cookie";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// 콜드스타트는 외부 ping으로 해결 — 8초로 충분하며, 길면 iOS에서 스피너가 오래 돔
const AUTH_TIMEOUT_MS = 8_000;

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // DB가 느리거나 불안정할 때 무한 로딩 방지 — 6초 타임아웃
    user = await Promise.race([
      sdk.authenticateRequest(opts.req),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth timeout")), AUTH_TIMEOUT_MS)
      ),
    ]);
  } catch {
    user = null;

    // JWT가 유효하지 않은 경우 쿠키 자동 삭제
    // → Safari 등에서 깨진 쿠키가 남아 흰 화면 반복되는 문제 해결
    try {
      const rawCookies = opts.req.headers.cookie;
      if (rawCookies) {
        const parsed = parseCookieHeader(rawCookies);
        const cookieValue = parsed[COOKIE_NAME];
        if (cookieValue) {
          const session = await Promise.race([
            sdk.verifySession(cookieValue),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
          ]);
          if (!session) {
            // JWT 자체가 잘못됨 → 쿠키 제거
            const cookieOptions = getSessionCookieOptions(opts.req);
            opts.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
          }
        }
      }
    } catch {
      // 무시
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
