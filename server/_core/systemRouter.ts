import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

type GlobalNotice = {
  content: string;
  images?: string[];
  updatedAt: string;
};

let globalNotice: GlobalNotice | null = null;

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
  getNotice: publicProcedure.query(() => globalNotice),
  setNotice: adminProcedure
    .input(
      z.object({
        content: z.string().max(5000),
        images: z.array(z.string()).max(5).optional(),
      })
    )
    .mutation(({ input }) => {
      globalNotice = {
        content: input.content.trim(),
        images: input.images?.filter(Boolean) ?? [],
        updatedAt: new Date().toISOString(),
      };
      return globalNotice;
    }),
  clearNotice: adminProcedure.mutation(() => {
    globalNotice = null;
    return { success: true } as const;
  }),
});
