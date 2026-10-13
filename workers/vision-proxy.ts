/**
 * 서버리스 비전 프록시 템플릿 (Cloudflare Workers).
 * 공용 비밀키를 APK에 넣지 않고, 사용자별 키를 안전하게 중계할 때 사용.
 * 배포: `npx wrangler deploy workers/vision-proxy.ts` (wrangler 별도 설치)
 * 앱에서는 Preferences에 프록시 URL만 저장하고, 키는 워커 환경변수로 보관.
 */
export interface Env {
  GEMINI_KEY: string;
  ALLOWED_ORIGINS?: string;
}

const MODEL = "gemini-2.0-flash";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(env) });
    }
    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405, headers: cors(env) });
    }
    if (!env.GEMINI_KEY) {
      return new Response("server misconfigured", { status: 500, headers: cors(env) });
    }
    let body: { image?: string; mimeType?: string; prompt?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return new Response("bad request", { status: 400, headers: cors(env) });
    }
    if (!body.image || !body.prompt) {
      return new Response("bad request", { status: 400, headers: cors(env) });
    }
    // 비용 폭주 방지: 8MB 제한
    if (body.image.length > 8 * 1024 * 1024) {
      return new Response("image too large", { status: 413, headers: cors(env) });
    }
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: body.prompt },
                { inline_data: { mime_type: body.mimeType ?? "image/jpeg", data: body.image } },
              ],
            },
          ],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    );
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors(env), "Content-Type": "application/json" },
    });
  },
};

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGINS ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
