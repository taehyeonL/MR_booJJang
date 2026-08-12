import { error, json, options } from "../_shared/http.ts";
import { HttpError, isUuid, requireUser, serviceClient } from "../_shared/supabase.ts";

// The chosen voice streaming vendor connects here only after a verified `connected` webhook.
// This endpoint accounts for at most 60 seconds; the media bridge itself remains provider-specific.
Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const user = await requireUser(request);
    const { reservation_id, seconds } = await request.json();
    if (!isUuid(reservation_id) || !Number.isInteger(seconds) || seconds < 1 || seconds > 60) return error("Invalid AI usage payload", 400);
    const database = serviceClient();
    const { data: reservation } = await database.from("reservations").select("id, user_id, mode, status").eq("id", reservation_id).maybeSingle();
    if (!reservation || reservation.user_id !== user.id || reservation.mode !== "ai" || reservation.status !== "connected") return error("No connected AI reservation", 409);
    const { error: usageError } = await database.rpc("record_ai_seconds", { p_reservation_id: reservation_id, p_seconds: seconds });
    if (usageError) return error(usageError.message, usageError.code === "P0001" ? 429 : 400);
    return json({ accepted_seconds: seconds });
  } catch (cause) {
    return cause instanceof HttpError ? error(cause.message, cause.status) : error("Unable to record AI usage", 500);
  }
});

