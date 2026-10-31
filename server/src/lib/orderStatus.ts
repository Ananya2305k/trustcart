export const ORDER_STATUSES = [
  "Placed",
  "Confirmed",
  "Shipped",
  "Delivered",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status changes. Delivered and Cancelled are terminal. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Placed: ["Confirmed", "Cancelled"],
  Confirmed: ["Shipped", "Cancelled"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

/** Statuses a customer may cancel from (before the parcel ships). */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
  "Placed",
  "Confirmed",
];

/** Days after delivery during which a refund can be requested. */
export const REFUND_WINDOW_DAYS = 7;

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * A delivery *estimate* shown to customers (clearly labelled as an estimate).
 * It is not a carrier promise: TrustCart has no carrier integration.
 */
export function estimateDeliveryWindow(placedAt: Date): {
  from: Date;
  to: Date;
} {
  const day = 24 * 60 * 60 * 1000;
  return {
    from: new Date(placedAt.getTime() + 3 * day),
    to: new Date(placedAt.getTime() + 7 * day),
  };
}

export function isWithinRefundWindow(deliveredAt: Date, now = new Date()) {
  const windowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - deliveredAt.getTime() <= windowMs;
}
