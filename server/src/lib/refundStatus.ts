export const REFUND_STATUSES = [
  "Requested",
  "Under review",
  "Approved",
  "Rejected",
  "Refunded",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> =
  {
    Requested: ["Under review", "Rejected"],
    "Under review": ["Approved", "Rejected"],
    Approved: ["Refunded"],
    Rejected: [],
    Refunded: [],
  };

export const REFUND_REASONS = [
  "Item damaged or defective",
  "Wrong item received",
  "Item not as described",
  "No longer needed",
  "Other",
] as const;

export function isRefundStatus(value: unknown): value is RefundStatus {
  return (
    typeof value === "string" &&
    (REFUND_STATUSES as readonly string[]).includes(value)
  );
}

export function canRefundTransition(from: RefundStatus, to: RefundStatus) {
  return REFUND_TRANSITIONS[from].includes(to);
}

export type RefundReason = (typeof REFUND_REASONS)[number];

export function isRefundReason(value: unknown): value is RefundReason {
  return (
    typeof value === "string" &&
    (REFUND_REASONS as readonly string[]).includes(value)
  );
}
