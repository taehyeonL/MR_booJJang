import { error, json, options } from "../_shared/http.ts";
import { HttpError, isUuid, requireUser, userClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    await requireUser(request);
    const body = await request.json();
    if (!isUuid(body.idempotency_key) || ![60, 180, 300].includes(body.duration_seconds) || !["normal", "ai"].includes(body.mode) || Number.isNaN(new Date(body.scheduled_at).getTime())) {
      return error("Invalid reservation payload", 400);
    }
    const { data, error: rpcError } = await userClient(request).rpc("create_reservation", {
      p_scheduled_at: body.scheduled_at,
      p_duration_seconds: body.duration_seconds,
      p_mode: body.mode,
      p_idempotency_key: body.idempotency_key,
    });
    if (rpcError) return error(rpcError.message, rpcError.code === "P0001" ? 429 : 400);
    return json({ reservation: data }, 201);
  } catch (cause) {
    return cause instanceof HttpError ? error(cause.message, cause.status) : error("Unable to create reservation", 500);
  }
});
