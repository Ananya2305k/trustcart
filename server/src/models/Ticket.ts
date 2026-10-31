import mongoose, { Schema, Document } from "mongoose";

export const TICKET_STATUSES = [
  "Open",
  "In progress",
  "Resolved",
  "Closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === "string" &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export interface ITicket extends Document {
  createdAt: Date;
  updatedAt: Date;
  user: mongoose.Types.ObjectId;
  order?: mongoose.Types.ObjectId;
  subject: string;
  category: string;
  status: TicketStatus;
  messages: {
    author: "customer" | "admin";
    text: string;
    timestamp: Date;
  }[];
  statusHistory: { status: TicketStatus; timestamp: Date }[];
  /** Output of the optional AI service. Only shown to admins. */
  ai?: {
    category: string;
    categoryConfidence: number;
    sentiment: string;
    sentimentScore: number;
    urgency: "low" | "medium" | "high";
    urgencySignals: string[];
    suggestedReply: string;
    replySource: string;
    modelVersion: string;
    analysedAt: Date;
  };
}

const ticketSchema = new Schema<ITicket>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, default: "General", trim: true },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "Open",
      required: true,
    },
    messages: [
      {
        author: {
          type: String,
          enum: ["customer", "admin"],
          required: true,
        },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        timestamp: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    statusHistory: [
      {
        status: { type: String, enum: TICKET_STATUSES, required: true },
        timestamp: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    ai: {
      category: String,
      categoryConfidence: Number,
      sentiment: String,
      sentimentScore: Number,
      urgency: { type: String, enum: ["low", "medium", "high"] },
      urgencySignals: [String],
      suggestedReply: String,
      replySource: String,
      modelVersion: String,
      analysedAt: Date,
    },
  },
  { timestamps: true }
);

export const Ticket = mongoose.model<ITicket>("Ticket", ticketSchema);
