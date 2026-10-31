import { Router, Response } from "express";
import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { Refund } from "../models/Refund.js";
import { authenticate, AuthRequest } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../lib/errors.js";
import { isWithinRefundWindow, REFUND_WINDOW_DAYS } from "../lib/orderStatus.js";
import {
  canRefundTransition,
  isRefundReason,
  isRefundStatus,
} from "../lib/refundStatus.js";

const router = Router();
router.use(authenticate);

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return res
      .status(error.status)
      .json({ success: false, message: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
}

// Customer: list own refund requests
router.get("/", async (req: AuthRequest, res) => {
  try {
    const refunds = await Refund.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate("order", "total createdAt items.name");
    return res.json({ success: true, refunds });
  } catch (error) {
    return sendError(res, error, "Failed to fetch refunds");
  }
});

// Customer: request a refund for a delivered order
router.post("/", async (req: AuthRequest, res) => {
  const { orderId, reason, details } = (req.body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof orderId !== "string" || !mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }

  if (!isRefundReason(reason)) {
    return res
      .status(400)
      .json({ success: false, message: "Please choose a valid reason" });
  }

  if (
    details !== undefined &&
    (typeof details !== "string" || details.length > 1000)
  ) {
    return res.status(400).json({
      success: false,
      message: "Details must be text of at most 1000 characters",
    });
  }

  try {
    const order = await Order.findOne({ _id: orderId, user: req.userId });
    if (!order) throw new HttpError(404, "Order not found");

    if (order.orderStatus !== "Delivered") {
      throw new HttpError(
        400,
        "Refunds can only be requested for delivered orders"
      );
    }

    const deliveredEvent = [...order.trackingHistory]
      .reverse()
      .find((event) => event.status === "Delivered");
    const deliveredAt = deliveredEvent?.timestamp ?? order.updatedAt;

    if (!isWithinRefundWindow(deliveredAt as Date)) {
      throw new HttpError(
        400,
        `The ${REFUND_WINDOW_DAYS}-day refund window for this order has ended`
      );
    }

    const existing = await Refund.findOne({
      order: order._id,
      status: { $ne: "Rejected" },
    });
    if (existing) {
      throw new HttpError(
        400,
        "A refund request for this order already exists"
      );
    }

    const refund = await Refund.create({
      user: req.userId,
      order: order._id,
      reason,
      details: typeof details === "string" ? details.trim() : "",
      amount: order.total,
      status: "Requested",
      history: [
        {
          status: "Requested",
          message: "You requested a refund",
          timestamp: new Date(),
          recordedBy: "customer",
        },
      ],
    });

    return res.status(201).json({ success: true, refund });
  } catch (error) {
    return sendError(res, error, "Failed to create refund request");
  }
});

// Admin: list all refund requests
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const filter = isRefundStatus(status) ? { status } : {};

    const refunds = await Refund.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("order", "total orderStatus paymentStatus");
    return res.json({ success: true, refunds });
  } catch (error) {
    return sendError(res, error, "Failed to fetch refunds");
  }
});

// Admin: move a refund through review -> decision -> payout
router.patch("/:refundId/status", requireAdmin, async (req, res) => {
  const { refundId } = req.params;
  const { status, note } = (req.body ?? {}) as Record<string, unknown>;

  if (!mongoose.isValidObjectId(refundId)) {
    return res.status(400).json({ success: false, message: "Invalid refund ID" });
  }
  if (!isRefundStatus(status)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid refund status" });
  }
  if (
    note !== undefined &&
    (typeof note !== "string" || note.trim().length > 500)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Note must be at most 500 characters" });
  }

  const cleanNote = typeof note === "string" ? note.trim() : "";

  if (status === "Rejected" && !cleanNote) {
    return res.status(400).json({
      success: false,
      message: "Please give the customer a reason when rejecting a refund",
    });
  }

  const session = await mongoose.startSession();

  try {
    let updated: unknown = null;

    await session.withTransaction(async () => {
      const refund = await Refund.findById(refundId).session(session);
      if (!refund) throw new HttpError(404, "Refund request not found");

      if (!canRefundTransition(refund.status, status)) {
        throw new HttpError(
          400,
          `Cannot change refund from ${refund.status} to ${status}`
        );
      }

      const defaults = {
        Requested: "",
        "Under review": "We started reviewing your request",
        Approved: "Your refund was approved",
        Rejected: "Your refund request was rejected",
        Refunded: "The refund was issued (simulated payment)",
      } as const;

      refund.status = status;
      if (cleanNote) refund.adminNote = cleanNote;
      refund.history.push({
        status,
        message: cleanNote || defaults[status],
        timestamp: new Date(),
        recordedBy: "admin",
      });
      await refund.save({ session });

      if (status === "Refunded") {
        await Order.updateOne(
          { _id: refund.order },
          { $set: { paymentStatus: "Refunded" } },
          { session }
        );
      }

      updated = refund;
    });

    return res.json({ success: true, refund: updated });
  } catch (error) {
    return sendError(res, error, "Failed to update refund");
  } finally {
    await session.endSession();
  }
});

export default router;
