import { error, json, options } from "../_shared/http.ts";
import { isUuid, serviceClient } from "../_shared/supabase.ts";
import { getVoiceProvider } from "../_shared/voice-provider.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const providerName = Deno.env.get("VOICE_PROVIDER") ?? "mock";
    if (providerName === "mock") return error("Mock provider has no public webhook", 404);
    const rawBody = await request.text();
    const provider = getVoiceProvider();
    if (!(await provider.verifyWebhook(request, rawBody))) return error("Invalid provider signature", 401);
    const event = provider.parseWebhook(request, rawBody);
    const database = serviceClient();
    const callbackReservationId = new URL(request.url).searchParams.get("reservation_id");
    let reservationId: string | null = null;
    const { data: byCall } = await database.from("reservations").select("id").eq("provider_call_id", event.callId).maybeSingle();
    if (byCall) reservationId = byCall.id;
    else if (isUuid(callbackReservationId)) reservationId = callbackReservationId;
    if (!reservationId) return error("Unknown provider call", 404);
    const { error: eventError } = await database.from("provider_events").insert({ provider: providerName, provider_event_id: event.id, reservation_id: reservationId, payload: { raw: rawBody } });
    if (eventError?.code === "23505") return json({ duplicate: true });
    if (eventError) throw eventError;
    const { error: statusError } = await database.rpc("apply_provider_status", { p_provider_call_id: event.callId, p_status: event.status, p_occurred_at: event.occurredAt, p_failure_code: event.failureCode ?? null });
    if (statusError) throw statusError;
    return json({ accepted: true });
  } catch (cause) {
    return error("Unable to process provider webhook", 500);
  }
});

