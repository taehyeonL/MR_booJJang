import type { CreateReservationInput, Reservation } from "@bujangnim/shared";
import { supabase } from "./supabase";

function client() { if (!supabase) throw new Error("Supabase 설정이 필요합니다. .env의 공개 설정을 확인하세요."); return supabase; }

async function call<T>(name: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const current = client();
  const { data: sessionData } = await current.auth.getSession();
  if (!sessionData.session) throw new Error("로그인이 필요합니다.");
  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/functions/v1/${name}`, {
    method,
    headers: { Authorization: `Bearer ${sessionData.session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "요청 처리에 실패했습니다.");
  return payload;
}
export async function createReservation(input: CreateReservationInput): Promise<Reservation> { return (await call<{ reservation: Reservation }>("create-reservation", "POST", input)).reservation; }
export async function cancelReservation(reservationId: string): Promise<Reservation> { return (await call<{ reservation: Reservation }>("cancel-reservation", "POST", { reservation_id: reservationId })).reservation; }
export async function listReservations(): Promise<Reservation[]> { return (await call<{ reservations: Reservation[] }>("list-reservations", "GET")).reservations; }
