import { Order } from "../models/Order.js";
import {
  DAY_MS,
  windowFromHistory,
  type DurationWindow,
} from "./deliveryEstimate.js";

/** How many recent delivered orders feed the estimate. */
const HISTORY_LIMIT = 300;

/** The window a new order would get right now, based on recent deliveries. */
export async function currentEstimateWindow(): Promise<DurationWindow> {
  const delivered = await Order.find({ orderStatus: "Delivered" })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .select("createdAt trackingHistory");

  const durations: number[] = [];

  for (const order of delivered) {
    const event = [...order.trackingHistory]
      .reverse()
      .find((e) => e.status === "Delivered");
    if (!event) continue;
    durations.push((event.timestamp.getTime() - order.createdAt.getTime()) / DAY_MS);
  }

  return windowFromHistory(durations);
}
