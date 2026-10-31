import { Router } from "express";
import { Order } from "../models/Order.js";
import {
  computePromiseStats,
  type PromiseSample,
} from "../lib/deliveryEstimate.js";
import { currentEstimateWindow } from "../lib/estimateService.js";

const router = Router();

/** Only the most recent delivered orders count, so old history fades out. */
const STATS_LIMIT = 200;
/** Below this many orders the percentage is too noisy to show as a headline. */
const MIN_SAMPLE_FOR_HEADLINE = 10;

// Public: how well the store keeps its delivery promises.
router.get("/delivery-promise", async (_req, res) => {
  try {
    const [window, delivered] = await Promise.all([
      currentEstimateWindow(),
      Order.find({ orderStatus: "Delivered" })
        .sort({ updatedAt: -1 })
        .limit(STATS_LIMIT)
        .select("trackingHistory estimateHistory estimatedDelivery simulated"),
    ]);

    const samples: PromiseSample[] = [];

    for (const order of delivered) {
      const deliveredEvent = [...order.trackingHistory]
        .reverse()
        .find((e) => e.status === "Delivered");
      const original = order.estimateHistory[0]?.to ?? order.estimatedDelivery?.to;
      const latest = order.estimatedDelivery?.to ?? original;

      // Orders placed before delivery promises were tracked have no data.
      if (!deliveredEvent || !original || !latest) continue;

      samples.push({
        originalTo: original,
        currentTo: latest,
        deliveredAt: deliveredEvent.timestamp,
        revisions: Math.max(0, order.estimateHistory.length - 1),
        simulated: order.simulated === true,
      });
    }

    const stats = computePromiseStats(samples);

    return res.json({
      success: true,
      stats,
      enoughData: stats.sample >= MIN_SAMPLE_FOR_HEADLINE,
      minSample: MIN_SAMPLE_FOR_HEADLINE,
      currentWindow: window,
    });
  } catch (error) {
    console.error("Delivery promise stats error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load delivery statistics" });
  }
});

export default router;
