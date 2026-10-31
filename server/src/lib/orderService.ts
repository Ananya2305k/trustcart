import type { ClientSession } from "mongoose";
import { Product } from "../models/Product.js";
import type { IOrder } from "../models/Order.js";
import { HttpError } from "./errors.js";
import { canTransition, type OrderStatus } from "./orderStatus.js";

export type Actor = "system" | "customer" | "admin";

/**
 * Moves an order to a new status inside an existing transaction.
 * - validates the transition
 * - restores stock exactly once when cancelling
 * - marks the simulated payment as Paid on delivery
 * - appends a recorded tracking event
 */
export async function changeOrderStatus(
  order: IOrder,
  nextStatus: OrderStatus,
  actor: Actor,
  session: ClientSession,
  options: { message?: string; carrier?: string; trackingNumber?: string } = {}
): Promise<void> {
  if (!canTransition(order.orderStatus, nextStatus)) {
    throw new HttpError(
      400,
      `Cannot change order status from ${order.orderStatus} to ${nextStatus}`
    );
  }

  if (nextStatus === "Cancelled") {
    for (const item of order.items) {
      // $inc keeps the restore atomic; a deleted product is simply skipped.
      await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } },
        { session }
      );
    }
  }

  if (nextStatus === "Shipped") {
    if (options.carrier) order.carrier = options.carrier;
    if (options.trackingNumber) order.trackingNumber = options.trackingNumber;
  }

  if (nextStatus === "Delivered" && order.paymentStatus === "Pending") {
    // Payment is simulated in this demo: treated as collected on delivery.
    order.paymentStatus = "Paid";
  }

  const defaultMessages: Record<OrderStatus, string> = {
    Placed: "Your order has been placed",
    Confirmed: "The seller confirmed your order",
    Shipped: "Your order has been handed over for shipping",
    Delivered: "Your order was marked as delivered",
    Cancelled:
      actor === "customer"
        ? "You cancelled this order. Reserved stock was released"
        : "The order was cancelled. Reserved stock was released",
  };

  order.orderStatus = nextStatus;
  order.trackingHistory.push({
    status: nextStatus,
    message: options.message?.trim() || defaultMessages[nextStatus],
    timestamp: new Date(),
    recordedBy: actor,
  });

  await order.save({ session });
}
