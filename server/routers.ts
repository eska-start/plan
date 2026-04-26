import { z } from "zod";
import { nanoid } from "nanoid";
import { eachDayOfInterval, parseISO, format } from "date-fns";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { ENV } from "./_core/env";
import {
  extractTextWithFreeOcr,
  extractTextWithFreeOcrBase64,
  parseAccommodationFromText,
  parseFlightFromText,
  parseFlightsFromText,
  parseRentalFromText,
  hasFlight,
  hasAccommodation,
  hasRental,
} from "./_core/freeOcr";
import {
  getTripsByUser, getTripById, createTrip, updateTrip, deleteTrip,
  getFlightsByTrip, createFlight, updateFlight, deleteFlight,
  getRentalsByTrip, createRental, updateRental, deleteRental,
  getAccommodationsByTrip, createAccommodation, updateAccommodation, deleteAccommodation,
  getMemosByTrip, createMemo, updateMemo, deleteMemo,
  getItineraryByDate, getItineraryByTrip, createItineraryItem, updateItineraryItem, deleteItineraryItem,
  reorderItineraryItems, deleteItineraryItemsBySource,
  getDiaryEntriesByTrip, getDiaryEntryByDate, upsertDiaryEntry, deleteDiaryEntry,
  createTripShare, getTripShareByToken, getTripSharesByTrip, deleteTripShare,
  getTripMembers, addTripMember, removeTripMember,
  getExpensesByTrip, createExpense, updateExpense, deleteExpense,
  getChecklistByTrip, createChecklistItem, updateChecklistItem, deleteChecklistItem, bulkCreateChecklistItems,
} from "./db";

// ─── Helper: 숙박 → 일정 자동 생성 ──────────────────────────────────────────
async function syncAccommodationToItinerary(
  tripId: number,
  userId: number,
  accommodationId: number,
  name: string,
  address: string | undefined | null,
  checkIn: string | undefined | null,
  checkOut: string | undefined | null,
) {
  if (!checkIn || !checkOut) return;
  try {
    // 기존 연동 항목 삭제
    await deleteItineraryItemsBySource(tripId, accommodationId);
    // 체크인~체크아웃 날짜 범위 생성 (체크인 날만 추가, 체크아웃 당일은 제외)
    const days = eachDayOfInterval({ start: parseISO(checkIn), end: parseISO(checkOut) });
    // 체크인 날: "체크인" 항목, 중간 날: "숙박 중", 체크아웃 날: "체크아웃" 항목
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const dateStr = format(d, "yyyy-MM-dd");
      let label = "";
      if (i === 0) label = `🏨 체크인 — ${name}`;
      else if (i === days.length - 1) label = `🏨 체크아웃 — ${name}`;
      else label = `🏨 숙박 — ${name}`;
      await createItineraryItem({
        tripId,
        userId,
        date: dateStr,
        placeName: label,
        address: address ?? undefined,
        category: "accommodation",
        sourceType: "accommodation",
        sourceId: accommodationId,
        order: 0,
        visited: false,
      });
    }
  } catch (e) {
    console.error("[syncAccommodation] error:", e);
  }
}

// ─── Trips Router ─────────────────────────────────────────────────────────────
const tripsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getTripsByUser(ctx.user.id)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => getTripById(input.id, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      destination: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      coverColor: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => createTrip({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      destination: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      coverColor: z.string().optional(),
      description: z.string().optional(),
      budget: z.string().optional().nullable(),
      budgetCurrency: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateTrip(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteTrip(input.id, ctx.user.id)),

  // AI 텍스트 분석으로 여행 데이터 추출 (LLM 필요)
  aiExtract: protectedProcedure
    .input(z.object({ tripId: z.number(), text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await getTripById(input.tripId, ctx.user.id);
      if (!ENV.llmApiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "LLM_API_KEY가 설정되지 않았습니다." });
      }
      const res = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `당신은 여행 예약 정보 추출 전문가입니다. 사용자가 제공한 텍스트(한국어·영어 모두 가능)에서 여행 정보를 추출해 JSON만 반환합니다.

반환 스키마 (null = 정보 없음):
{
  "flights": [
    {
      "airline": string|null,
      "flightNumber": string|null,
      "departureAirport": string|null,
      "arrivalAirport": string|null,
      "departureTime": string|null,
      "arrivalTime": string|null,
      "bookingRef": string|null,
      "seatNumber": string|null,
      "type": "departure"|"return"|"transit"|null
    }
  ],
  "accommodations": [
    {
      "name": string|null,
      "address": string|null,
      "checkIn": string|null,
      "checkOut": string|null,
      "bookingRef": string|null,
      "price": string|null,
      "currency": string|null
    }
  ],
  "rentals": [
    {
      "company": string|null,
      "carModel": string|null,
      "pickupLocation": string|null,
      "dropoffLocation": string|null,
      "pickupTime": string|null,
      "dropoffTime": string|null,
      "bookingRef": string|null,
      "price": string|null,
      "currency": string|null
    }
  ],
  "reply": string
}

규칙:
- 날짜는 YYYY-MM-DD 형식, 시간은 HH:mm 형식 (날짜+시간이면 YYYY-MM-DDTHH:mm)
- 공항은 IATA 3자리 코드로 (ICN, FSZ, NRT 등)
- 가는편=departure, 오는편=return, 경유=transit
- reply: 추출한 내용을 한국어로 간단히 요약
- 빈 배열이면 [] 로 반환, null 사용 금지`,
          },
          { role: "user" as const, content: input.text },
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown>;
        return {
          flights: Array.isArray(parsed.flights) ? parsed.flights : [],
          accommodations: Array.isArray(parsed.accommodations) ? parsed.accommodations
            : parsed.accommodation ? [parsed.accommodation] : [],
          rentals: Array.isArray(parsed.rentals) ? parsed.rentals
            : parsed.rental ? [parsed.rental] : [],
          reply: typeof parsed.reply === "string" ? parsed.reply : "",
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 응답 파싱에 실패했습니다." });
      }
    }),

  // AI 이미지 분석으로 여행 데이터 추출 (Gemini 비전)
  aiExtractFromImage: protectedProcedure
    .input(z.object({ tripId: z.number(), imageBase64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getTripById(input.tripId, ctx.user.id);
      if (!ENV.llmApiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "LLM_API_KEY가 설정되지 않았습니다." });
      }
      const dataUri = input.imageBase64.startsWith("data:")
        ? input.imageBase64
        : `data:image/jpeg;base64,${input.imageBase64}`;
      const systemPrompt = `당신은 여행 예약 이미지 분석 전문가입니다. 이미지에서 여행 예약 정보를 추출해 JSON만 반환합니다.

반환 스키마:
{
  "flights": [{ "airline": string|null, "flightNumber": string|null, "departureAirport": string|null, "arrivalAirport": string|null, "departureTime": string|null, "arrivalTime": string|null, "bookingRef": string|null, "seatNumber": string|null, "type": "departure"|"return"|"transit"|null }],
  "accommodations": [{ "name": string|null, "address": string|null, "checkIn": string|null, "checkOut": string|null, "bookingRef": string|null, "price": string|null, "currency": string|null }],
  "rentals": [{ "company": string|null, "carModel": string|null, "pickupLocation": string|null, "dropoffLocation": string|null, "pickupTime": string|null, "dropoffTime": string|null, "bookingRef": string|null, "price": string|null, "currency": string|null }],
  "reply": string
}
규칙: 날짜=YYYY-MM-DD, 시간=HH:mm, 날짜+시간=YYYY-MM-DDTHH:mm, 공항=IATA 3자리, 가는편=departure, 오는편=return, reply는 한국어로 추출 내용 요약, 빈배열=[]`;
      const res = await invokeLLM({
        messages: [
          { role: "system" as const, content: systemPrompt },
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "이 예약 확인서 이미지에서 여행 정보를 추출해주세요." },
              { type: "image_url" as const, image_url: { url: dataUri, detail: "high" as const } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown>;
        // AI가 singular key로 반환하는 경우 배열로 정규화
        return {
          flights: Array.isArray(parsed.flights) ? parsed.flights : [],
          accommodations: Array.isArray(parsed.accommodations) ? parsed.accommodations
            : parsed.accommodation ? [parsed.accommodation] : [],
          rentals: Array.isArray(parsed.rentals) ? parsed.rentals
            : parsed.rental ? [parsed.rental] : [],
          reply: typeof parsed.reply === "string" ? parsed.reply : "",
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 응답 파싱에 실패했습니다." });
      }
    }),

  // 이미지 한 장에서 항공편·숙박·렌트카 동시 추출 (무료 OCR 폴백)
  importAllFromImage: protectedProcedure
    .input(z.object({ tripId: z.number(), imageBase64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getTripById(input.tripId, ctx.user.id); // 접근 권한 확인
      const text = await extractTextWithFreeOcrBase64(input.imageBase64);
      const flights = parseFlightsFromText(text);
      const accommodation = parseAccommodationFromText(text);
      const rental = parseRentalFromText(text);
      return {
        rawText: text,
        flights: flights.length > 0 ? flights : null,
        accommodation: hasAccommodation(accommodation) ? accommodation : null,
        rental: hasRental(rental) ? rental : null,
      };
    }),
});

// ─── Flights Router ───────────────────────────────────────────────────────────
const flightsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getFlightsByTrip(input.tripId, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      type: z.enum(["departure", "return", "transit"]).optional(),
      airline: z.string().optional(),
      flightNumber: z.string().optional(),
      departureAirport: z.string().optional(),
      arrivalAirport: z.string().optional(),
      departureTime: z.string().optional(),
      arrivalTime: z.string().optional(),
      bookingRef: z.string().optional(),
      seatNumber: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => createFlight({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      type: z.enum(["departure", "return", "transit"]).optional(),
      airline: z.string().optional(),
      flightNumber: z.string().optional(),
      departureAirport: z.string().optional(),
      arrivalAirport: z.string().optional(),
      departureTime: z.string().optional(),
      arrivalTime: z.string().optional(),
      bookingRef: z.string().optional(),
      seatNumber: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateFlight(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteFlight(input.id, ctx.user.id)),

  // ── OCR: 사진으로 항공편 정보 추출 ──
  extractFromImage: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      if (!ENV.llmApiKey) {
        return {};
      }

      const res = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `You are a travel document parser. Extract flight information from the image and return JSON only.
Return this exact JSON schema (use null for missing fields):
{
  "airline": string | null,
  "flightNumber": string | null,
  "departureAirport": string | null,
  "arrivalAirport": string | null,
  "departureTime": string | null,
  "arrivalTime": string | null,
  "bookingRef": string | null,
  "seatNumber": string | null,
  "type": "departure" | "return" | "transit" | null
}
For times, use ISO 8601 format (YYYY-MM-DDTHH:mm) if date is visible, otherwise HH:mm only.`,
          } as Message,
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "항공권 또는 e-ticket 이미지에서 정보를 추출해주세요." },
              { type: "image_url" as const, image_url: { url: input.imageBase64, detail: "high" as const } },
            ],
          } as Message,
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const content = typeof raw === "string" ? raw : "{}";
        return JSON.parse(content);
      } catch {
        return {};
      }
    }),
});

// ─── Rentals Router ───────────────────────────────────────────────────────────
const rentalsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getRentalsByTrip(input.tripId, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      company: z.string().optional(),
      carModel: z.string().optional(),
      pickupLocation: z.string().optional(),
      dropoffLocation: z.string().optional(),
      pickupTime: z.string().optional(),
      dropoffTime: z.string().optional(),
      bookingRef: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => createRental({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      company: z.string().optional(),
      carModel: z.string().optional(),
      pickupLocation: z.string().optional(),
      dropoffLocation: z.string().optional(),
      pickupTime: z.string().optional(),
      dropoffTime: z.string().optional(),
      bookingRef: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateRental(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteRental(input.id, ctx.user.id)),

  // ── OCR: 사진으로 렌트카 정보 추출 ──
  extractFromImage: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      if (!ENV.llmApiKey) {
        return {};
      }

      const res = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `You are a travel document parser. Extract car rental information from the image and return JSON only.
Return this exact JSON schema (use null for missing fields):
{
  "company": string | null,
  "carModel": string | null,
  "pickupLocation": string | null,
  "dropoffLocation": string | null,
  "pickupTime": string | null,
  "dropoffTime": string | null,
  "bookingRef": string | null,
  "price": string | null,
  "currency": string | null
}
For times, use ISO 8601 format (YYYY-MM-DDTHH:mm) if date is visible.`,
          } as Message,
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "렌트카 예약 확인서 이미지에서 정보를 추출해주세요." },
              { type: "image_url" as const, image_url: { url: input.imageBase64, detail: "high" as const } },
            ],
          } as Message,
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const content = typeof raw === "string" ? raw : "{}";
        return JSON.parse(content);
      } catch {
        return {};
      }
    }),
});

// ─── Accommodations Router ────────────────────────────────────────────────────
const accommodationsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getAccommodationsByTrip(input.tripId, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      name: z.string().min(1),
      address: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      bookingRef: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createAccommodation({ ...input, userId: ctx.user.id });
      // 일정 자동 연동
      if (id && input.checkIn && input.checkOut) {
        await syncAccommodationToItinerary(
          input.tripId, ctx.user.id, id,
          input.name, input.address, input.checkIn, input.checkOut,
        );
      }
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      tripId: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      bookingRef: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, tripId, ...data } = input;
      await updateAccommodation(id, ctx.user.id, data);
      // 일정 재동기화
      const accList = await getAccommodationsByTrip(tripId, ctx.user.id);
      const acc = accList.find(a => a.id === id);
      if (acc) {
        const name = data.name ?? acc.name;
        const address = data.address ?? acc.address;
        const checkIn = data.checkIn ?? acc.checkIn;
        const checkOut = data.checkOut ?? acc.checkOut;
        await syncAccommodationToItinerary(tripId, ctx.user.id, id, name, address, checkIn, checkOut);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteAccommodation(input.id, ctx.user.id);
      // 연동 일정 삭제
      await deleteItineraryItemsBySource(input.tripId, input.id);
    }),

  // ── OCR: 사진으로 숙박 정보 추출 ──
  extractFromImage: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      if (!ENV.llmApiKey) {
        return {};
      }

      const res = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `You are a travel document parser. Extract hotel/accommodation booking information from the image and return JSON only.
Return this exact JSON schema (use null for missing fields):
{
  "name": string | null,
  "address": string | null,
  "checkIn": string | null,
  "checkOut": string | null,
  "bookingRef": string | null,
  "price": string | null,
  "currency": string | null
}
For dates, use YYYY-MM-DD format.`,
          } as Message,
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "호텔 또는 숙박 예약 확인서 이미지에서 정보를 추출해주세요." },
              { type: "image_url" as const, image_url: { url: input.imageBase64, detail: "high" as const } },
            ],
          } as Message,
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const content = typeof raw === "string" ? raw : "{}";
        return JSON.parse(content);
      } catch {
        return {};
      }
    }),
});

// ─── Memos Router ─────────────────────────────────────────────────────────────
const memosRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getMemosByTrip(input.tripId, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      pinned: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => createMemo({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      pinned: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateMemo(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteMemo(input.id, ctx.user.id)),
});

// ─── Itinerary Router ─────────────────────────────────────────────────────────
const itineraryRouter = router({
  listByDate: protectedProcedure
    .input(z.object({ tripId: z.number(), date: z.string() }))
    .query(({ ctx, input }) => getItineraryByDate(input.tripId, ctx.user.id, input.date)),

  listByTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getItineraryByTrip(input.tripId, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      date: z.string(),
      order: z.number().optional(),
      placeName: z.string().min(1),
      address: z.string().optional(),
      lat: z.string().optional(),
      lng: z.string().optional(),
      visitTime: z.string().optional(),
      duration: z.number().optional(),
      visited: z.boolean().optional(),
      memo: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => createItineraryItem({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      order: z.number().optional(),
      placeName: z.string().optional(),
      address: z.string().optional(),
      lat: z.string().optional(),
      lng: z.string().optional(),
      visitTime: z.string().optional(),
      duration: z.number().optional(),
      visited: z.boolean().optional(),
      memo: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateItineraryItem(id, ctx.user.id, data);
    }),

   delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteItineraryItem(input.id, ctx.user.id)),
  reorder: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      orderedIds: z.array(z.number()),
    }))
    .mutation(({ ctx, input }) =>
      reorderItineraryItems(input.tripId, ctx.user.id, input.orderedIds)
    ),
});
// ─── Diary Router ─────────────────────────────────────────────────────────────
const diaryRouter = router({
  listByTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getDiaryEntriesByTrip(input.tripId, ctx.user.id)),

  getByDate: protectedProcedure
    .input(z.object({ tripId: z.number(), date: z.string() }))
    .query(({ ctx, input }) => getDiaryEntryByDate(input.tripId, ctx.user.id, input.date)),

  upsert: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      date: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      mood: z.enum(["amazing", "happy", "neutral", "tired", "sad"]).optional(),
      weather: z.enum(["sunny", "cloudy", "rainy", "snowy", "windy"]).optional(),
    }))
    .mutation(({ ctx, input }) => upsertDiaryEntry({ ...input, userId: ctx.user.id })),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteDiaryEntry(input.id, ctx.user.id)),
});

// ─── Sharing Router ───────────────────────────────────────────────────────────
const sharingRouter = router({
  /** 초대 링크 생성 */
  createInvite: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const trip = await getTripById(input.tripId, ctx.user.id);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND" });
      if (trip.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "오너만 초대 링크를 생성할 수 있습니다." });
      const token = nanoid(32);
      await createTripShare({ tripId: input.tripId, inviteToken: token, createdBy: ctx.user.id });
      return { token };
    }),

  /** 초대 링크 목록 */
  listInvites: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const trip = await getTripById(input.tripId, ctx.user.id);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND" });
      return getTripSharesByTrip(input.tripId);
    }),

  /** 초대 링크 삭제 */
  deleteInvite: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteTripShare(input.id, ctx.user.id)),

  /** 초대 토큰으로 참여 */
  joinByToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const share = await getTripShareByToken(input.token);
      if (!share) throw new TRPCError({ code: "NOT_FOUND", message: "유효하지 않은 초대 링크입니다." });
      if (share.expiresAt && share.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "만료된 초대 링크입니다." });
      }
      const trip = await getTripById(share.tripId, share.createdBy);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND" });
      // 오너는 멤버로 추가 불필요
      if (trip.userId !== ctx.user.id) {
        await addTripMember({ tripId: share.tripId, userId: ctx.user.id, role: "editor" });
      }
      return { tripId: share.tripId, tripName: trip.name };
    }),

  /** 멤버 목록 */
  listMembers: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const trip = await getTripById(input.tripId, ctx.user.id);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND" });
      const members = await getTripMembers(input.tripId);
      return { ownerId: trip.userId, members };
    }),

  /** 멤버 제거 */
  removeMember: protectedProcedure
    .input(z.object({ tripId: z.number(), userId: z.number() }))
    .mutation(({ ctx, input }) => removeTripMember(input.tripId, input.userId, ctx.user.id)),
});

// ─── Expenses Router ──────────────────────────────────────────────────────────
const expensesRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getExpensesByTrip(input.tripId, ctx.user.id)),

  create: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      date: z.string(),
      amount: z.string(),
      currency: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => createExpense({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      date: z.string().optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateExpense(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteExpense(input.id, ctx.user.id)),

  aiExtract: protectedProcedure
    .input(z.object({ tripId: z.number(), text: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getTripById(input.tripId, ctx.user.id);
      if (!ENV.llmApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "LLM_API_KEY가 필요합니다." });
      const res = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `여행 지출 파서입니다. 텍스트에서 지출 정보를 추출해 JSON만 반환합니다.\n반환 스키마: { "expenses": [{ "date": "YYYY-MM-DD|null", "amount": "숫자문자열", "currency": "KRW|JPY|USD|EUR|...", "category": "항공|숙박|식비|교통|쇼핑|액티비티|기타", "description": "string" }], "reply": "한국어 요약" }\n규칙: amount는 숫자만(쉼표·통화기호 제거), date 모를 경우 null, category는 반드시 위 목록 중 하나`,
          },
          { role: "user" as const, content: input.text },
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const p = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown>;
        return { expenses: Array.isArray(p.expenses) ? p.expenses : [], reply: typeof p.reply === "string" ? p.reply : "" };
      } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 응답 파싱 실패" }); }
    }),

  aiExtractFromImage: protectedProcedure
    .input(z.object({ tripId: z.number(), imageBase64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getTripById(input.tripId, ctx.user.id);
      if (!ENV.llmApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "LLM_API_KEY가 필요합니다." });
      const dataUri = input.imageBase64.startsWith("data:") ? input.imageBase64 : `data:image/jpeg;base64,${input.imageBase64}`;
      const res = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `영수증/결제 내역 이미지 파서. JSON만 반환: { "expenses": [{ "date": "YYYY-MM-DD|null", "amount": "숫자문자열", "currency": "KRW|JPY|USD|EUR|...", "category": "항공|숙박|식비|교통|쇼핑|액티비티|기타", "description": "string" }], "reply": "한국어요약" }`,
          },
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: "이 영수증/결제 내역에서 지출 정보를 추출해주세요." },
              { type: "image_url" as const, image_url: { url: dataUri, detail: "high" as const } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      try {
        const raw = res.choices?.[0]?.message?.content;
        const p = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown>;
        return { expenses: Array.isArray(p.expenses) ? p.expenses : [], reply: typeof p.reply === "string" ? p.reply : "" };
      } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 응답 파싱 실패" }); }
    }),
});

// ─── Checklist Router ─────────────────────────────────────────────────────────
const DEFAULT_CHECKLIST_ITEMS = [
  { group: "필수서류", label: "여권", order: 0 },
  { group: "필수서류", label: "비자 (해당 시)", order: 1 },
  { group: "필수서류", label: "항공권 / 예약 확인서", order: 2 },
  { group: "돈·통신", label: "현금 환전", order: 0 },
  { group: "돈·통신", label: "신용/체크카드", order: 1 },
  { group: "돈·통신", label: "해외 유심 / 포켓와이파이", order: 2 },
  { group: "옷·가방", label: "여행 가방 / 캐리어", order: 0 },
  { group: "옷·가방", label: "여행 옷", order: 1 },
  { group: "옷·가방", label: "편한 신발", order: 2 },
  { group: "기타", label: "보조배터리", order: 0 },
  { group: "기타", label: "카메라", order: 1 },
  { group: "기타", label: "상비약", order: 2 },
] as const;

const checklistRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(({ ctx, input }) => getChecklistByTrip(input.tripId, ctx.user.id)),

  seed: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const trip = await getTripById(input.tripId, ctx.user.id);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = await getChecklistByTrip(input.tripId, ctx.user.id);
      if (existing.length > 0) return { seeded: false };
      await bulkCreateChecklistItems(DEFAULT_CHECKLIST_ITEMS.map(item => ({ ...item, tripId: input.tripId, userId: ctx.user.id })));
      return { seeded: true };
    }),

  create: protectedProcedure
    .input(z.object({ tripId: z.number(), group: z.string().optional(), label: z.string().min(1), order: z.number().optional() }))
    .mutation(({ ctx, input }) => createChecklistItem({ ...input, userId: ctx.user.id })),

  toggle: protectedProcedure
    .input(z.object({ id: z.number(), done: z.boolean() }))
    .mutation(({ ctx, input }) => updateChecklistItem(input.id, ctx.user.id, { done: input.done })),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteChecklistItem(input.id, ctx.user.id)),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  trips: tripsRouter,
  flights: flightsRouter,
  rentals: rentalsRouter,
  accommodations: accommodationsRouter,
  memos: memosRouter,
  itinerary: itineraryRouter,
  diary: diaryRouter,
  sharing: sharingRouter,
  expenses: expensesRouter,
  checklist: checklistRouter,
});

export type AppRouter = typeof appRouter;

