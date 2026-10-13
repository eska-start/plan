/**
 * 엔티티 데이터 훅 패사드.
 * - 웹: 기존 tRPC 그대로 (동작 변경 없음).
 * - 네이티브 앱: SQLite(mobileDb) + react-query.
 * isNativeApp()은 세션 상수이므로 분기 호출 순서가 바뀌지 않음.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isNativeApp } from "./capBridge";
import * as db from "./mobileDb";
import { trpc } from "./trpc";

const N = () => isNativeApp();
const key = (e: string, ...rest: unknown[]) => ["m", e, ...rest];

type Opts = { onSuccess?: () => void; onError?: (e: unknown) => void };

// ─── Trips ───
export function useTripsList(enabled = true) {
  const n = N();
  const q = useQuery({ queryKey: key("trips"), queryFn: () => db.getTrips(), enabled: n && enabled });
  const t = trpc.trips.list.useQuery(undefined, { enabled: !n && enabled });
  return (n ? q : t) as unknown as typeof t;
}

function useNativeMut<TInput>(entity: string, fn: (input: TInput) => Promise<unknown>, opts?: Opts) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const r = await fn(input);
      await qc.invalidateQueries({ queryKey: ["m", entity] });
      if (entity === "accommodations") await qc.invalidateQueries({ queryKey: ["m", "itinerary"] });
      return r;
    },
    onSuccess: () => {
      opts?.onSuccess?.();
    },
    onError: (e) => opts?.onError?.(e),
  });
}

type TripInput = { name: string; destination: string; startDate: string; endDate: string; coverColor?: string; description?: string };

export function useCreateTrip(opts?: Opts) {
  const n = N();
  const m = useNativeMut("trips", (input: { tripId?: never } & TripInput) => db.createTrip(input), opts);
  const t = trpc.trips.create.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: TripInput) => void; mutateAsync: (i: TripInput) => Promise<unknown>; isPending: boolean };
}

export function useUpdateTrip(opts?: Opts) {
  const n = N();
  const m = useNativeMut("trips", (input: { id: number } & Partial<TripInput>) => {
    const { id, ...rest } = input;
    return db.updateTrip(id, rest);
  }, opts);
  const t = trpc.trips.update.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number } & Partial<TripInput>) => void; mutateAsync: (i: { id: number } & Partial<TripInput>) => Promise<unknown>; isPending: boolean };
}

export function useDeleteTrip(opts?: Opts) {
  const n = N();
  const m = useNativeMut("trips", (input: { id: number }) => db.deleteTrip(input.id), opts);
  const t = trpc.trips.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number }) => void; mutateAsync: (i: { id: number }) => Promise<unknown>; isPending: boolean };
}

export function useTrip(id: number) {
  const n = N();
  const q = useQuery({ queryKey: key("trip", id), queryFn: () => db.getTrip(id), enabled: n });
  const t = trpc.trips.get.useQuery({ id }, { enabled: !n });
  return (n ? q : t) as unknown as typeof t;
}

// ─── Flights ───
type FlightFields = { type?: string; airline?: string; flightNumber?: string; departureAirport?: string; arrivalAirport?: string; departureTime?: string; arrivalTime?: string; bookingRef?: string; seatNumber?: string; memo?: string };

export function useFlightsList(tripId: number) {
  const n = N();
  const q = useQuery({ queryKey: key("flights", tripId), queryFn: () => db.getFlights(tripId), enabled: n });
  const t = trpc.flights.list.useQuery({ tripId }, { enabled: !n });
  return (n ? q : t) as unknown as typeof t;
}

export function useCreateFlight(opts?: Opts) {
  const n = N();
  const m = useNativeMut("flights", (input: { tripId: number } & FlightFields) => {
    const { tripId, ...rest } = input;
    return db.createFlight(tripId, rest as Record<string, string | undefined>);
  }, opts);
  const t = trpc.flights.create.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number } & FlightFields) => void; mutateAsync: (i: { tripId: number } & FlightFields) => Promise<unknown>; isPending: boolean };
}

export function useUpdateFlight(opts?: Opts) {
  const n = N();
  const m = useNativeMut("flights", (input: { id: number } & FlightFields) => {
    const { id, ...rest } = input;
    return db.updateFlight(id, rest as Record<string, string | undefined>);
  }, opts);
  const t = trpc.flights.update.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number } & FlightFields) => void; mutateAsync: (i: { id: number } & FlightFields) => Promise<unknown>; isPending: boolean };
}

export function useDeleteFlight(opts?: Opts) {
  const n = N();
  const m = useNativeMut("flights", (input: { id: number }) => db.deleteFlight(input.id), opts);
  const t = trpc.flights.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number }) => void; mutateAsync: (i: { id: number }) => Promise<unknown>; isPending: boolean };
}

// ─── Rentals ───
type RentalFields = { company?: string; carModel?: string; pickupLocation?: string; dropoffLocation?: string; pickupTime?: string; dropoffTime?: string; bookingRef?: string; price?: string; currency?: string; memo?: string };

export function useRentalsList(tripId: number) {
  const n = N();
  const q = useQuery({ queryKey: key("rentals", tripId), queryFn: () => db.getRentals(tripId), enabled: n });
  const t = trpc.rentals.list.useQuery({ tripId }, { enabled: !n });
  return (n ? q : t) as unknown as typeof t;
}

export function useCreateRental(opts?: Opts) {
  const n = N();
  const m = useNativeMut("rentals", (input: { tripId: number } & RentalFields) => {
    const { tripId, ...rest } = input;
    return db.createRental(tripId, rest as Record<string, string | undefined>);
  }, opts);
  const t = trpc.rentals.create.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number } & RentalFields) => void; mutateAsync: (i: { tripId: number } & RentalFields) => Promise<unknown>; isPending: boolean };
}

export function useUpdateRental(opts?: Opts) {
  const n = N();
  const m = useNativeMut("rentals", (input: { id: number } & RentalFields) => {
    const { id, ...rest } = input;
    return db.updateRental(id, rest as Record<string, string | undefined>);
  }, opts);
  const t = trpc.rentals.update.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number } & RentalFields) => void; mutateAsync: (i: { id: number } & RentalFields) => Promise<unknown>; isPending: boolean };
}

export function useDeleteRental(opts?: Opts) {
  const n = N();
  const m = useNativeMut("rentals", (input: { id: number }) => db.deleteRental(input.id), opts);
  const t = trpc.rentals.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number }) => void; mutateAsync: (i: { id: number }) => Promise<unknown>; isPending: boolean };
}

// ─── Accommodations ───
type AccomFields = { name?: string; address?: string; checkIn?: string; checkOut?: string; bookingRef?: string; price?: string; currency?: string; memo?: string };

export function useAccommodationsList(tripId: number) {
  const n = N();
  const q = useQuery({ queryKey: key("accommodations", tripId), queryFn: () => db.getAccommodations(tripId), enabled: n });
  const t = trpc.accommodations.list.useQuery({ tripId }, { enabled: !n });
  return (n ? q : t) as unknown as typeof t;
}

export function useCreateAccommodation(opts?: Opts) {
  const n = N();
  const m = useNativeMut("accommodations", (input: { tripId: number } & AccomFields) => {
    const { tripId, ...rest } = input;
    return db.createAccommodation(tripId, rest as Record<string, string | undefined>);
  }, opts);
  const t = trpc.accommodations.create.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number } & AccomFields) => void; mutateAsync: (i: { tripId: number } & AccomFields) => Promise<unknown>; isPending: boolean };
}

export function useUpdateAccommodation(opts?: Opts) {
  const n = N();
  const m = useNativeMut("accommodations", (input: { id: number; tripId: number } & AccomFields) => {
    const { id, tripId, ...rest } = input;
    return db.updateAccommodation(id, tripId, rest as Record<string, string | undefined>);
  }, opts);
  const t = trpc.accommodations.update.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number; tripId: number } & AccomFields) => void; mutateAsync: (i: { id: number; tripId: number } & AccomFields) => Promise<unknown>; isPending: boolean };
}

export function useDeleteAccommodation(opts?: Opts) {
  const n = N();
  const m = useNativeMut("accommodations", (input: { id: number; tripId: number }) => db.deleteAccommodation(input.id, input.tripId), opts);
  const t = trpc.accommodations.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number; tripId: number }) => void; mutateAsync: (i: { id: number; tripId: number }) => Promise<unknown>; isPending: boolean };
}

// ─── Memos ───
type MemoFields = { title?: string; content?: string; pinned?: boolean };

export function useMemosList(tripId: number) {
  const n = N();
  const q = useQuery({ queryKey: key("memos", tripId), queryFn: () => db.getMemos(tripId), enabled: n });
  const t = trpc.memos.list.useQuery({ tripId }, { enabled: !n });
  return (n ? q : t) as unknown as typeof t;
}

export function useCreateMemo(opts?: Opts) {
  const n = N();
  const m = useNativeMut("memos", (input: { tripId: number } & MemoFields) => db.createMemo(input.tripId, input), opts);
  const t = trpc.memos.create.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number } & MemoFields) => void; mutateAsync: (i: { tripId: number } & MemoFields) => Promise<unknown>; isPending: boolean };
}

export function useUpdateMemo(opts?: Opts) {
  const n = N();
  const m = useNativeMut("memos", (input: { id: number } & MemoFields) => {
    const { id, ...rest } = input;
    return db.updateMemo(id, rest);
  }, opts);
  const t = trpc.memos.update.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number } & MemoFields) => void; mutateAsync: (i: { id: number } & MemoFields) => Promise<unknown>; isPending: boolean };
}

export function useDeleteMemo(opts?: Opts) {
  const n = N();
  const m = useNativeMut("memos", (input: { id: number }) => db.deleteMemo(input.id), opts);
  const t = trpc.memos.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number }) => void; mutateAsync: (i: { id: number }) => Promise<unknown>; isPending: boolean };
}

// ─── Itinerary ───
type ItinFields = { date?: string; order?: number; placeName?: string; address?: string; lat?: string; lng?: string; visitTime?: string; duration?: number; visited?: boolean; memo?: string; category?: string };

export function useItineraryByDate(tripId: number, date: string, enabled = true, opts?: { refetchInterval?: number }) {
  const n = N();
  const q = useQuery({ queryKey: key("itinerary", tripId, date), queryFn: () => db.getItineraryByDate(tripId, date), enabled: n && enabled, refetchInterval: opts?.refetchInterval });
  const t = trpc.itinerary.listByDate.useQuery({ tripId, date }, { enabled: !n && enabled, refetchInterval: opts?.refetchInterval });
  return (n ? q : t) as unknown as typeof t;
}

export function useCreateItineraryItem(opts?: Opts) {
  const n = N();
  const m = useNativeMut("itinerary", (input: { tripId: number } & ItinFields) => db.createItineraryItem(input.tripId, input as Record<string, string | number | boolean | undefined>), opts);
  const t = trpc.itinerary.create.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number } & ItinFields) => void; mutateAsync: (i: { tripId: number } & ItinFields) => Promise<unknown>; isPending: boolean };
}

export function useUpdateItineraryItem(opts?: Opts) {
  const n = N();
  const m = useNativeMut("itinerary", (input: { id: number } & ItinFields) => {
    const { id, ...rest } = input;
    return db.updateItineraryItem(id, rest as Record<string, string | number | boolean | undefined>);
  }, opts);
  const t = trpc.itinerary.update.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number } & ItinFields) => void; mutateAsync: (i: { id: number } & ItinFields) => Promise<unknown>; isPending: boolean };
}

export function useDeleteItineraryItem(opts?: Opts) {
  const n = N();
  const m = useNativeMut("itinerary", (input: { id: number }) => db.deleteItineraryItem(input.id), opts);
  const t = trpc.itinerary.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number }) => void; mutateAsync: (i: { id: number } & ItinFields) => Promise<unknown>; isPending: boolean };
}

export function useReorderItinerary(opts?: Opts) {
  const n = N();
  const m = useNativeMut("itinerary", (input: { tripId: number; orderedIds: number[] }) => db.reorderItineraryItems(input.tripId, input.orderedIds), opts);
  const t = trpc.itinerary.reorder.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number; orderedIds: number[] }, o?: Opts) => void; mutateAsync: (i: { tripId: number; orderedIds: number[] }) => Promise<unknown>; isPending: boolean };
}

// ─── Diary ───
type DiaryFields = { title?: string; content?: string; mood?: "amazing" | "happy" | "neutral" | "tired" | "sad"; weather?: "sunny" | "cloudy" | "rainy" | "snowy" | "windy" };

export function useDiaryByDate(tripId: number, date: string) {
  const n = N();
  const q = useQuery({ queryKey: key("diary", tripId, date), queryFn: () => db.getDiaryByDate(tripId, date), enabled: n });
  const t = trpc.diary.getByDate.useQuery({ tripId, date }, { enabled: !n });
  return (n ? q : t) as unknown as typeof t;
}

export function useUpsertDiary(opts?: Opts) {
  const n = N();
  const m = useNativeMut("diary", (input: { tripId: number; date: string } & DiaryFields) => db.upsertDiary(input.tripId, input), opts);
  const t = trpc.diary.upsert.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { tripId: number; date: string } & DiaryFields) => void; mutateAsync: (i: { tripId: number; date: string } & DiaryFields) => Promise<unknown>; isPending: boolean };
}

export function useDeleteDiary(opts?: Opts) {
  const n = N();
  const m = useNativeMut("diary", (input: { id: number }) => db.deleteDiary(input.id), opts);
  const t = trpc.diary.delete.useMutation(opts);
  return (n ? m : t) as unknown as { mutate: (i: { id: number }) => void; mutateAsync: (i: { id: number }) => Promise<unknown>; isPending: boolean };
}

// ─── Expenses (모바일 전용) ───
export function useExpensesList(tripId: number) {
  return useQuery({ queryKey: key("expenses", tripId), queryFn: () => db.getExpenses(tripId), enabled: N() });
}

export function useCreateExpense(opts?: Opts) {
  return useNativeMut("expenses", (input: { tripId: number; amount: string; category?: string; currency?: string; spentAt?: string; memo?: string; receiptPath?: string }) => db.createExpense(input.tripId, input), opts) as unknown as {
    mutate: (i: { tripId: number; amount: string; category?: string; currency?: string; spentAt?: string; memo?: string; receiptPath?: string }) => void;
    isPending: boolean;
  };
}

export function useDeleteExpense(opts?: Opts) {
  return useNativeMut("expenses", (input: { id: number }) => db.deleteExpense(input.id), opts) as unknown as {
    mutate: (i: { id: number }) => void;
    isPending: boolean;
  };
}
