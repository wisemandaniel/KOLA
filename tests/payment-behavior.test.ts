import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFapshiStatus,
  safePaymentReference,
} from "../app/integrations.ts";

test("normalizes successful Fapshi statuses to paid", () => {
  assert.equal(normalizeFapshiStatus("SUCCESSFUL"), "paid");
  assert.equal(normalizeFapshiStatus("successful"), "paid");
});

test("normalizes terminal provider failures", () => {
  assert.equal(normalizeFapshiStatus("FAILED"), "failed");
  assert.equal(normalizeFapshiStatus("expired"), "expired");
});

test("keeps unknown and in-progress statuses pending", () => {
  assert.equal(normalizeFapshiStatus("PENDING"), "pending_provider");
  assert.equal(normalizeFapshiStatus("CREATED"), "pending_provider");
  assert.equal(normalizeFapshiStatus(""), "pending_provider");
});

test("sanitizes payment references without changing safe identifiers", () => {
  assert.equal(safePaymentReference("order_ABC-123"), "order_ABC-123");
  assert.equal(safePaymentReference("order/ABC 123"), "order_ABC_123");
});

test("limits provider references to one hundred characters", () => {
  const result = safePaymentReference("a".repeat(140));
  assert.equal(result.length, 100);
});

test("rejects references with no usable characters", () => {
  assert.throws(() => safePaymentReference("!!!"), /invalid/i);
});
