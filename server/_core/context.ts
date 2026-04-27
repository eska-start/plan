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

// 인증 컨텍스트 타임아웃을 짧게 유지해 iOS bfcache 복귀 후 장시간 스피너 고정을 방지.
// 외부 헬스체크/웜업이 있는 운영 환경 기준으로 8초 제한 사용
const AUTH_TIMEOUT_MS = 8_000;

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // DB가 느리거나 불안정할 때 무한 로딩 방지 — 8초 타임아웃
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
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
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
