export const PLAN_LIMITS = {
  free: { dailyCalls: 2, monthlyCalls: 20, monthlyAiSeconds: 0 },
  pro: { dailyCalls: 30, monthlyCalls: 300, monthlyAiSeconds: 0 },
  ai_pro: { dailyCalls: 30, monthlyCalls: 300, monthlyAiSeconds: 1_800 },
} as const;

export type PlanCode = keyof typeof PLAN_LIMITS;
export type ReservationMode = "normal" | "ai";
export type ReservationStatus =
  | "scheduled"
  | "dispatching"
  | "dialing"
  | "ringing"
  | "connected"
  | "completed"
  | "cancelled"
  | "failed"
  | "missed";

export type CreateReservationInput = {
  scheduled_at: string;
  duration_seconds: 60 | 180 | 300;
  mode: ReservationMode;
  idempotency_key: string;
};

export type Reservation = CreateReservationInput & {
  id: string;
  status: ReservationStatus;
  attempt_count: number;
  provider?: string | null;
  provider_call_id?: string | null;
  ringing_started_at?: string | null;
  connected_at?: string | null;
  ended_at?: string | null;
  failure_code?: string | null;
  created_at: string;
};

const transitions: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  scheduled: ["dispatching", "cancelled"],
  dispatching: ["dialing", "failed"],
  dialing: ["ringing", "failed"],
  ringing: ["connected", "missed", "failed"],
  connected: ["completed", "failed"],
  completed: [],
  cancelled: [],
  failed: [],
  missed: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return transitions[from].includes(to);
}

export function validateCreateReservation(input: CreateReservationInput, now = new Date()): string | null {
  const scheduledAt = new Date(input.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now) return "scheduled_at must be in the future";
  if (!([60, 180, 300] as number[]).includes(input.duration_seconds)) return "unsupported duration";
  if (input.mode !== "normal" && input.mode !== "ai") return "unsupported mode";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotency_key)) {
    return "idempotency_key must be a UUID";
  }
  return null;
}

