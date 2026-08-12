import { error, json, options } from "../_shared/http.ts";
import { HttpError, isUuid, requireUser, userClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    await requireUser(request);
    const { reservation_id } = await request.json();
    if (!isUuid(reservation_id)) return error("reservation_id must be a UUID", 400);
    const { data, error: rpcError } = await userClient(request).rpc("cancel_reservation", { p_reservation_id: reservation_id });
    if (rpcError) return error(rpcError.message, 409);
    return json({ reservation: data });
  } catch (cause) {
    return cause instanceof HttpError ? error(cause.message, cause.status) : error("Unable to cancel reservation", 500);
  }
});
