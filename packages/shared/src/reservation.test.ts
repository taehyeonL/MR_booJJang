import assert from "node:assert/strict";
import test from "node:test";
import { canTransition, validateCreateReservation } from "./reservation.js";

test("only permitted status transitions are accepted", () => {
  assert.equal(canTransition("scheduled", "cancelled"), true);
  assert.equal(canTransition("connected", "cancelled"), false);
});

test("future reservations require a UUID idempotency key", () => {
  const input = {
    scheduled_at: "2026-09-01T10:00:00+09:00",
    duration_seconds: 60 as const,
    mode: "normal" as const,
    idempotency_key: "7e7900d8-f68d-4d6f-8479-2ef5adc59c9a",
  };
  assert.equal(validateCreateReservation(input, new Date("2026-08-01T00:00:00Z")), null);
  assert.equal(validateCreateReservation({ ...input, idempotency_key: "repeat" }), "idempotency_key must be a UUID");
});
