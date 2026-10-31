import mongoose, { Schema, Document } from "mongoose";

import { ORDER_STATUSES, type OrderStatus } from "../lib/orderStatus.js";

export type { OrderStatus };

export type PaymentStatus = "Pending" | "Paid" | "Failed" | "Refunded";

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface IOrder extends Document {
  createdAt: Date;
  updatedAt: Date;
  user: mongoose.Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  /** Delivery estimate (not a carrier promise). */
  estimatedDelivery?: { from: Date; to: Date };
  /** Every promised window, oldest first. The first entry is the original promise. */
  estimateHistory: {
    from: Date;
    to: Date;
    reason: string;
    timestamp: Date;
    recordedBy: "system" | "admin";
  }[];
  /** Where the original window came from: a fixed default or past deliveries. */
  estimateSource?: "default" | "history";
  /** Number of past deliveries the window was based on. */
  estimateBasis?: number;
  /** True for generated demo orders, so they are never mistaken for real ones. */
  simulated?: boolean;
  /** Entered by the seller/admin when the order ships. */
  carrier?: string;
  trackingNumber?: string;
  paymentMethod: "Simulated";
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  trackingHistory: {
    status: OrderStatus;
    message: string;
    timestamp: Date;
    /** Who recorded this event. Every event is a real change made in TrustCart. */
    recordedBy: "system" | "customer" | "admin";
  }[];
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: "An order must contain at least one item",
      },
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },

    shippingAddress: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      addressLine: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, trim: true, default: "India" },
    },
    estimatedDelivery: {
      // Optional so orders created before this field existed stay valid.
      from: { type: Date },
      to: { type: Date },
    },
    estimateHistory: [
      {
        from: { type: Date, required: true },
        to: { type: Date, required: true },
        reason: { type: String, required: true, trim: true, maxlength: 200 },
        timestamp: { type: Date, default: Date.now },
        recordedBy: {
          type: String,
          enum: ["system", "admin"],
          default: "system",
        },
        _id: false,
      },
    ],
    estimateSource: { type: String, enum: ["default", "history"] },
    estimateBasis: { type: Number, min: 0 },
    simulated: { type: Boolean, default: false, index: true },
    carrier: { type: String, trim: true, maxlength: 80 },
    trackingNumber: { type: String, trim: true, maxlength: 80 },

    paymentMethod: {
      type: String,
      enum: ["Simulated"],
      default: "Simulated",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
      required: true,
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "Placed",
      required: true,
    },
    trackingHistory: [
      {
        status: {
          type: String,
          enum: ORDER_STATUSES,
          required: true,
        },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        recordedBy: {
          type: String,
          enum: ["system", "customer", "admin"],
          default: "system",
        },
      },
    ],
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrder>("Order", orderSchema);