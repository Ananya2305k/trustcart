import mongoose, { Schema, Document } from "mongoose";
import {
  REFUND_REASONS,
  REFUND_STATUSES,
  type RefundStatus,
} from "../lib/refundStatus.js";

export interface IRefund extends Document {
  user: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  reason: (typeof REFUND_REASONS)[number];
  details: string;
  amount: number;
  status: RefundStatus;
  /** Visible to the customer when the request is rejected or updated. */
  adminNote?: string;
  history: {
    status: RefundStatus;
    message: string;
    timestamp: Date;
    recordedBy: "customer" | "admin";
  }[];
}

const refundSchema = new Schema<IRefund>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    reason: { type: String, enum: REFUND_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000, default: "" },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: REFUND_STATUSES,
      default: "Requested",
      required: true,
    },
    adminNote: { type: String, trim: true, maxlength: 500 },
    history: [
      {
        status: { type: String, enum: REFUND_STATUSES, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        recordedBy: {
          type: String,
          enum: ["customer", "admin"],
          required: true,
        },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

export const Refund = mongoose.model<IRefund>("Refund", refundSchema);
