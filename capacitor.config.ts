interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  backgroundColor?: string;
  android?: Record<string, unknown>;
  server?: Record<string, unknown>;
}

/**
 * Android APK (Capacitor) 설정.
 * - 기존 웹 기능 유지: dist/public 정적 빌드를 네이티브 WebView로 로드.
 * - API 키 하드코딩 금지: 클라우드 호출은 서버 프록시(vision.analyze) 경유만.
 * - 카메라/갤러리/공유시트/PDF/연속스크린샷 입력은 capBridge 경유.
 */
const config: CapacitorConfig = {
  appId: process.env.PLAN_APK_VARIANT === "preview" ? "com.eska.plan.preview" : "com.eska.plan",
  appName: process.env.PLAN_APK_VARIANT === "preview" ? "PLANLOG 테스트" : "PLAN",
  webDir: "dist/public",
  backgroundColor: "#ffffff",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
