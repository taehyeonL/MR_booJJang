import { error, json, options } from "../_shared/http.ts";
import { HttpError, serviceClient } from "../_shared/supabase.ts";
import { requireScheduler } from "../_shared/scheduler.ts";
import { getVoiceProvider } from "../_shared/voice-provider.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    requireScheduler(request);
    const database = serviceClient();
    const { data: reservations, error: claimError } = await database.rpc("claim_due_reservations", { p_limit: 25 });
    if (claimError) throw claimError;
    const provider = getVoiceProvider();
    const from = Deno.env.get("VOICE_FROM_NUMBER") ?? "";
    if (!from && (reservations?.length ?? 0) > 0) throw new Error("Missing required environment variable: VOICE_FROM_NUMBER");
    const results = await Promise.all((reservations ?? []).map(async (reservation) => {
      const { data: profile, error: profileError } = await database.from("profiles").select("phone_e164").eq("id", reservation.user_id).single();
      if (profileError || !profile) throw new Error(`Profile missing for reservation ${reservation.id}`);
      try {
        const call = await provider.createOutboundCall({ to: profile.phone_e164, from, reservationId: reservation.id, mode: reservation.mode, maxSeconds: reservation.mode === "ai" ? 60 : reservation.duration_seconds });
        const { error: updateError } = await database.from("reservations").update({ provider: Deno.env.get("VOICE_PROVIDER") ?? "mock", provider_call_id: call.providerCallId, status: "dialing" }).eq("id", reservation.id).eq("status", "dispatching");
        if (updateError) throw updateError;
        return { id: reservation.id, outcome: "dialing" };
      } catch (cause) {
        await database.from("reservations").update({ status: "failed", failure_code: "provider_create_failed", ended_at: new Date().toISOString() }).eq("id", reservation.id).eq("status", "dispatching");
        return { id: reservation.id, outcome: "failed", message: cause instanceof Error ? cause.message : "unknown error" };
      }
    }));
    return json({ dispatched: results });
  } catch (cause) {
    return cause instanceof HttpError ? error(cause.message, cause.status) : error("Unable to dispatch reservations", 500);
  }
});

