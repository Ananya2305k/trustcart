import type { Order, OrderStatus } from "./types";

export const REFUND_WINDOW_DAYS = 7;

export const ORDER_STEPS: OrderStatus[] = [
  "Placed",
  "Confirmed",
  "Shipped",
  "Delivered",
];

/** Mirrors the server's transition rules (the server enforces them). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Placed: ["Confirmed", "Cancelled"],
  Confirmed: ["Shipped", "Cancelled"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

export const inr = (value: number) =>
  `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export const shortId = (id: string) => id.slice(-8).toUpperCase();

export function deliveredAt(order: Order): string | undefined {
  return [...order.trackingHistory]
    .reverse()
    .find((event) => event.status === "Delivered")?.timestamp;
}

export function isRefundEligible(order: Order, now = Date.now()): boolean {
  if (order.orderStatus !== "Delivered") return false;
  const delivered = deliveredAt(order) ?? order.updatedAt;
  return now - new Date(delivered).getTime() <= REFUND_WINDOW_DAYS * 86_400_000;
}

export function statusTone(status: string): string {
  switch (status) {
    case "Delivered":
    case "Refunded":
    case "Resolved":
    case "Approved":
      return "green";
    case "Cancelled":
    case "Rejected":
      return "red";
    case "Shipped":
    case "Confirmed":
    case "In progress":
    case "Under review":
      return "blue";
    case "Closed":
      return "gray";
    default:
      return "amber";
  }
}
