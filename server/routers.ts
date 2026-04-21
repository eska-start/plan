import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getTripsByUser, getTripById, createTrip, updateTrip, deleteTrip,
  getFlightsByTrip, createFlight, updateFlight, deleteFlight,
  getRentalsByTrip, createRental, updateRental, deleteRental,
  getAccommodationsByTrip, createAccommodation, updateAccommodation, deleteAccommodation,
  getMemosByTrip, createMemo, updateMemo, deleteMemo,
  getItineraryByDate, getItineraryByTrip, createItineraryItem, updateItineraryItem, deleteItineraryItem,
  getDiaryEntriesByTrip, getDiaryEntryByDate, upsertDiaryEntry, deleteDiaryEntry,
} from "./db";

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
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateTrip(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteTrip(input.id, ctx.user.id)),
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
    .mutation(({ ctx, input }) => createAccommodation({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      bookingRef: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateAccommodation(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteAccommodation(input.id, ctx.user.id)),
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
});

export type AppRouter = typeof appRouter;
