import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUSES,
  canTransition,
  estimateDeliveryWindow,
  isOrderStatus,
  isWithinRefundWindow,
  CUSTOMER_CANCELLABLE,
} from "../src/lib/orderStatus.js";
import {
  canRefundTransition,
  isRefundStatus,
} from "../src/lib/refundStatus.js";

test("valid forward transitions are allowed", () => {
  assert.ok(canTransition("Placed", "Confirmed"));
  assert.ok(canTransition("Confirmed", "Shipped"));
  assert.ok(canTransition("Shipped", "Delivered"));
  assert.ok(canTransition("Placed", "Cancelled"));
  assert.ok(canTransition("Confirmed", "Cancelled"));
});

test("skipping steps or going backwards is rejected", () => {
  assert.ok(!canTransition("Placed", "Shipped"));
  assert.ok(!canTransition("Placed", "Delivered"));
  assert.ok(!canTransition("Shipped", "Cancelled"));
  assert.ok(!canTransition("Delivered", "Shipped"));
});

test("Delivered and Cancelled are terminal", () => {
  for (const next of ORDER_STATUSES) {
    assert.ok(!canTransition("Delivered", next));
    assert.ok(!canTransition("Cancelled", next));
  }
});

test("customers can only cancel before shipping", () => {
  assert.deepEqual([...CUSTOMER_CANCELLABLE], ["Placed", "Confirmed"]);
});

test("isOrderStatus rejects unknown values", () => {
  assert.ok(isOrderStatus("Shipped"));
  assert.ok(!isOrderStatus("shipped"));
  assert.ok(!isOrderStatus(42));
  assert.ok(!isOrderStatus(undefined));
});

test("delivery estimate is a 3-7 day window", () => {
  const placed = new Date("2026-01-01T00:00:00Z");
  const { from, to } = estimateDeliveryWindow(placed);
  assert.equal(from.toISOString(), "2026-01-04T00:00:00.000Z");
  assert.equal(to.toISOString(), "2026-01-08T00:00:00.000Z");
});

test("refund window is 7 days after delivery", () => {
  const delivered = new Date("2026-01-10T00:00:00Z");
  assert.ok(isWithinRefundWindow(delivered, new Date("2026-01-17T00:00:00Z")));
  assert.ok(!isWithinRefundWindow(delivered, new Date("2026-01-17T00:00:01Z")));
});

test("refund workflow only moves forward", () => {
  assert.ok(canRefundTransition("Requested", "Under review"));
  assert.ok(canRefundTransition("Under review", "Approved"));
  assert.ok(canRefundTransition("Approved", "Refunded"));
  assert.ok(!canRefundTransition("Requested", "Refunded"));
  assert.ok(!canRefundTransition("Rejected", "Approved"));
  assert.ok(!canRefundTransition("Refunded", "Requested"));
  assert.ok(isRefundStatus("Under review"));
  assert.ok(!isRefundStatus("Pending"));
});
