import { createClient, type User } from "npm:@supabase/supabase-js@2.112.3";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.startsWith("replace_")) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function serviceClient() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClient(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) throw new HttpError("Authentication is required", 401);
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!publicKey) throw new Error("Missing required environment variable: SUPABASE_PUBLISHABLE_KEY");
  return createClient(required("SUPABASE_URL"), publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export async function requireUser(request: Request): Promise<User> {
  const header = request.headers.get("Authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError("Authentication is required", 401);
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError("Invalid authentication token", 401);
  return data.user;
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
