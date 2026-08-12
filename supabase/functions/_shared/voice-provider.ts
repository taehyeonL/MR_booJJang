export type VoiceProviderEvent = {
  id: string;
  callId: string;
  status: "ringing" | "connected" | "completed" | "missed" | "failed";
  occurredAt: string;
  failureCode?: string;
};

export interface VoiceProvider {
  createOutboundCall(input: { to: string; from: string; reservationId: string; mode: "normal" | "ai"; maxSeconds: number }): Promise<{ providerCallId: string }>;
  endCall(providerCallId: string): Promise<void>;
  verifyWebhook(request: Request, rawBody: string): Promise<boolean>;
  parseWebhook(request: Request, rawBody: string): VoiceProviderEvent;
}

export class MockVoiceProvider implements VoiceProvider {
  async createOutboundCall(input: { reservationId: string }): Promise<{ providerCallId: string }> {
    return { providerCallId: `mock_${input.reservationId}` };
  }
  async endCall(): Promise<void> {}
  async verifyWebhook(): Promise<boolean> { return false; }
  parseWebhook(): VoiceProviderEvent { throw new Error("Mock provider does not accept webhooks"); }
}

function base64(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

async function twilioSignature(url: string, params: URLSearchParams, token: string): Promise<string> {
  const values = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = url + values.map(([key, value]) => `${key}${value}`).join("");
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return base64(new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload))));
}

export class TwilioVoiceProvider implements VoiceProvider {
  private readonly accountId = required("VOICE_ACCOUNT_ID");
  private readonly authToken = required("VOICE_AUTH_TOKEN");
  private readonly appBaseUrl = required("APP_BASE_URL").replace(/\/$/, "");

  async createOutboundCall(input: { to: string; from: string; reservationId: string; mode: "normal" | "ai"; maxSeconds: number }): Promise<{ providerCallId: string }> {
    const callback = new URL(`${this.appBaseUrl}/functions/v1/provider-webhook`);
    callback.searchParams.set("reservation_id", input.reservationId);
    const instructions = new URL(`${this.appBaseUrl}/functions/v1/call-instructions`);
    instructions.searchParams.set("reservation_id", input.reservationId);
    const body = new URLSearchParams({
      To: input.to,
      From: input.from,
      Url: instructions.toString(),
      StatusCallback: callback.toString(),
      StatusCallbackEvent: "ringing answered completed",
      StatusCallbackMethod: "POST",
      Timeout: String(Math.min(60, Math.max(10, Number(Deno.env.get("RINGING_TIMEOUT_SECONDS") ?? 30)))),
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountId}/Calls.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${this.accountId}:${this.authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(`Twilio call creation failed: ${response.status}`);
    const payload = await response.json() as { sid?: string };
    if (!payload.sid) throw new Error("Twilio returned no call SID");
    return { providerCallId: payload.sid };
  }

  async endCall(providerCallId: string): Promise<void> {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountId}/Calls/${providerCallId}.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${this.accountId}:${this.authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Status: "completed" }),
    });
    if (!response.ok) throw new Error(`Twilio call completion failed: ${response.status}`);
  }

  async verifyWebhook(request: Request, rawBody: string): Promise<boolean> {
    const signature = request.headers.get("x-twilio-signature");
    if (!signature) return false;
    const expected = await twilioSignature(request.url, new URLSearchParams(rawBody), this.authToken);
    return signature === expected;
  }

  parseWebhook(_request: Request, rawBody: string): VoiceProviderEvent {
    const body = new URLSearchParams(rawBody);
    const callId = body.get("CallSid");
    const status = body.get("CallStatus");
    if (!callId || !status) throw new Error("Invalid Twilio callback");
    const mapped = status === "ringing" ? "ringing"
      : status === "in-progress" ? "connected"
      : status === "completed" ? "completed"
      : ["no-answer", "busy", "canceled"].includes(status) ? "missed"
      : "failed";
    return {
      id: `${callId}:${status}:${body.get("Timestamp") ?? body.get("ApiVersion") ?? "event"}`,
      callId,
      status: mapped,
      occurredAt: new Date().toISOString(),
      failureCode: mapped === "failed" ? status : undefined,
    };
  }
}

export function getVoiceProvider(): VoiceProvider {
  const provider = Deno.env.get("VOICE_PROVIDER") ?? "mock";
  if (provider === "mock") return new MockVoiceProvider();
  if (provider === "twilio") return new TwilioVoiceProvider();
  throw new Error(`Unsupported VOICE_PROVIDER: ${provider}`);
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.startsWith("replace_")) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
