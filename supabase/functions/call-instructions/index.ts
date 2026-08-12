import { getVoiceProvider } from "../_shared/voice-provider.ts";
import { serviceClient, isUuid } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const provider = getVoiceProvider();
  if (Deno.env.get("VOICE_PROVIDER") !== "twilio" || !(await provider.verifyWebhook(request, ""))) return new Response("Unauthorized", { status: 401 });
  const reservationId = new URL(request.url).searchParams.get("reservation_id");
  if (!isUuid(reservationId)) return new Response("Bad request", { status: 400 });
  const { data: reservation } = await serviceClient().from("reservations").select("mode").eq("id", reservationId).maybeSingle();
  if (!reservation) return new Response("Not found", { status: 404 });
  const message = reservation.mode === "ai"
    ? "AI 음성 연결은 아직 설정되지 않았습니다. 잠시 후 종료합니다."
    : "부장님입니다. 요청하신 전화입니다.";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ko-KR">${message}</Say><Hangup/></Response>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
});

