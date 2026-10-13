import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { cloudAnalyze, localAnalyze } from "./engines";
import { verifyFields, type AnalysisMode, type DocumentType } from "@shared/vision";

/**
 * 정밀 교차 검증 라우터 (Step 4 + 9 + 10).
 * - 기존 flights/rentals/accommodations.extractFromImage는 유지 (회귀 방지).
 * - 신규 UI는 vision.analyze 사용 → 임시 검증 결과만 반환, DB 저장 안 함.
 * - 사용자 확인 후 기존 create/update로만 저장 (11, 12항).
 */
export const visionRouter = router({
  analyze: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string().min(1),
        docType: z.enum(["flight", "accommodation", "rental", "itinerary"]),
        mode: z.enum(["local", "smart", "precise"]).default("smart"),
        // 스마트 모드에서 클라우드 사용 동의 여부 (외부 전송 명시 동의)
        cloudConsent: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const docType = input.docType as DocumentType;
      const mode = input.mode as AnalysisMode;

      // Step 2: 로컬 우선
      const local = await localAnalyze(input.imageUrl, docType);

      const needsCloud = async () => {
        if (mode === "local") return false;
        if (mode === "precise") return true;
        // smart: 중요 필드 누락/불확실 시만
        const vals = Object.values(local.data);
        const filled = vals.filter((v) => v != null).length;
        return filled <= 2;
      };

      let cloud: Awaited<ReturnType<typeof cloudAnalyze>> | null = null;
      let cloudSkipped: string | null = null;
      if (await needsCloud()) {
        if (!input.cloudConsent) {
          cloudSkipped = "cloud-consent-required";
        } else {
          try {
            cloud = await cloudAnalyze(input.imageUrl, docType);
          } catch (e) {
            // 클라우드 장애 시 로컬 처리 가능 (13항)
            cloudSkipped = e instanceof Error ? e.message : "cloud-failed";
            cloud = null;
          }
        }
      } else {
        cloudSkipped = "not-needed";
      }

      const fields = verifyFields(docType, local.data, cloud?.data ?? null);
      const conflictCount = fields.filter((f) => f.status === "conflict").length;
      const missingHighRisk = fields.filter(
        (f) => f.status === "missing" || f.status === "invalid",
      ).length;

      return {
        docType,
        mode,
        localEngine: local.engine,
        localNote: local.note ?? null,
        cloudEngine: cloud?.engine ?? null,
        cloudSkipped,
        fields,
        conflictCount,
        missingHighRisk,
        // 재분석 횟수 제한은 클라이언트가 attempts로 관리 (무한 재시도 방지)
        rawLocalText: local.rawText?.slice(0, 4000) ?? null,
      };
    }),

  /** 충돌/누락 필드 확대 재분석 힌트 (10항: 제한 횟수, 다수결 금지) */
  reanalyzeHint: protectedProcedure
    .input(z.object({ field: z.string(), attempt: z.number().min(1).max(2) }))
    .query(({ input }) => ({
      field: input.field,
      attempt: input.attempt,
      hint: "원본 이미지에서 해당 필드 영역을 확대·회전 보정 후 다시 analyze 호출. 2회 초과 재시도 금지.",
      maxAttempts: 2,
    })),
});
