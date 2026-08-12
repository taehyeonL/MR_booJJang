import { HttpError } from "./supabase.ts";

export function requireScheduler(request: Request): void {
  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (!expected || expected.startsWith("replace_")) throw new Error("Missing required environment variable: SCHEDULER_SECRET");
  if (request.headers.get("x-scheduler-secret") !== expected) throw new HttpError("Unauthorized scheduler request", 401);
}

