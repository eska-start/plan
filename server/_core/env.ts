function normalizeEnvValue(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  const assigned = trimmed.match(/^[A-Z0-9_]+\s*=\s*(.+)$/);
  return (assigned ? assigned[1] : trimmed).trim();
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "local-app",
  cookieSecret: process.env.JWT_SECRET ?? "local-dev-secret-change-me",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ocrSpaceApiKey: process.env.OCR_SPACE_API_KEY ?? "",
  llmApiUrl: normalizeEnvValue(process.env.LLM_API_URL ?? process.env.OPENAI_BASE_URL),
  llmApiKey: normalizeEnvValue(process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  signupSecret: process.env.SIGNUP_SECRET ?? "",
};
