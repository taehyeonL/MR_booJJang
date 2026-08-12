import { error, json, options } from "../_shared/http.ts";
import { HttpError, requireUser, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "GET") return error("Method not allowed", 405);
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    let query = serviceClient().from("reservations").select("*").eq("user_id", user.id).order("scheduled_at", { ascending: true });
    if (url.searchParams.get("from")) query = query.gte("scheduled_at", url.searchParams.get("from")!);
    if (url.searchParams.get("to")) query = query.lte("scheduled_at", url.searchParams.get("to")!);
    const { data, error: selectError } = await query;
    if (selectError) return error("Unable to retrieve reservations", 500);
    return json({ reservations: data });
  } catch (cause) {
    return cause instanceof HttpError ? error(cause.message, cause.status) : error("Unable to retrieve reservations", 500);
  }
});

