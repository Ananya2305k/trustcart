import { Router, Response } from "express";
import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { Ticket, isTicketStatus, type TicketStatus } from "../models/Ticket.js";
import { authenticate, AuthRequest } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../lib/errors.js";
import { analyseTicket } from "../lib/aiClient.js";

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

function cleanText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

// Customer: create a ticket
router.post("/", async (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const subject = cleanText(body.subject, 3, 120);
  const message = cleanText(body.message, 10, 2000);

  if (!subject || !message) {
    return res.status(400).json({
      success: false,
      message:
        "Subject (3-120 characters) and message (10-2000 characters) are required",
    });
  }

  try {
    let orderId: string | undefined;

    if (body.orderId !== undefined && body.orderId !== "") {
      if (
        typeof body.orderId !== "string" ||
        !mongoose.isValidObjectId(body.orderId)
      ) {
        throw new HttpError(400, "Invalid order ID");
      }
      const owned = await Order.exists({ _id: body.orderId, user: req.userId });
      if (!owned) throw new HttpError(404, "Order not found");
      orderId = body.orderId;
    }

    // Optional: ticket creation still works when the AI service is down.
    const analysis = await analyseTicket(subject, message);
    const now = new Date();

    const ticket = await Ticket.create({
      user: req.userId,
      order: orderId,
      subject,
      category:
        analysis && analysis.categoryConfidence >= 0.4
          ? analysis.category
          : "General",
      status: "Open",
      messages: [{ author: "customer", text: message, timestamp: now }],
      statusHistory: [{ status: "Open", timestamp: now }],
      ai: analysis ? { ...analysis, analysedAt: now } : undefined,
    });

    const safe = await Ticket.findById(ticket._id).select("-ai");
    return res.status(201).json({ success: true, ticket: safe });
  } catch (error) {
    return sendError(res, error, "Failed to create ticket");
  }
});

// Customer: list own tickets (AI output is not exposed to customers)
router.get("/", async (req: AuthRequest, res) => {
  try {
    const tickets = await Ticket.find({ user: req.userId })
      .sort({ updatedAt: -1 })
      .select("-ai");
    return res.json({ success: true, tickets });
  } catch (error) {
    return sendError(res, error, "Failed to fetch tickets");
  }
});

// Admin: all tickets, most urgent first
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const filter: { status?: TicketStatus } = isTicketStatus(status)
      ? { status }
      : {};

    const tickets = await Ticket.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("order", "total orderStatus");

    // Active tickets first, then by AI urgency (high -> low), newest first.
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const isClosed = (status: string) =>
      status === "Resolved" || status === "Closed";
    const sortable = tickets as unknown as {
      status: string;
      ai?: { urgency?: keyof typeof rank };
    }[];

    sortable.sort((a, b) => {
      const closedDiff = Number(isClosed(a.status)) - Number(isClosed(b.status));
      if (closedDiff) return closedDiff;
      return rank[a.ai?.urgency ?? "low"] - rank[b.ai?.urgency ?? "low"];
    });

    return res.json({ success: true, tickets });
  } catch (error) {
    return sendError(res, error, "Failed to fetch tickets");
  }
});

// Customer: view one own ticket
router.get("/:ticketId", async (req: AuthRequest, res) => {
  const { ticketId } = req.params;
  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ success: false, message: "Invalid ticket ID" });
  }

  try {
    const ticket = await Ticket.findOne({
      _id: ticketId,
      user: req.userId,
    }).select("-ai");
    if (!ticket) throw new HttpError(404, "Ticket not found");
    return res.json({ success: true, ticket });
  } catch (error) {
    return sendError(res, error, "Failed to fetch ticket");
  }
});

// Customer: add a follow-up message
router.post("/:ticketId/messages", async (req: AuthRequest, res) => {
  const { ticketId } = req.params;
  const text = cleanText((req.body ?? {}).text, 1, 2000);

  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ success: false, message: "Invalid ticket ID" });
  }
  if (!text) {
    return res
      .status(400)
      .json({ success: false, message: "Message must be 1-2000 characters" });
  }

  try {
    const ticket = await Ticket.findOne({ _id: ticketId, user: req.userId });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    if (ticket.status === "Closed") {
      throw new HttpError(400, "This ticket is closed. Please open a new one");
    }

    ticket.messages.push({ author: "customer", text, timestamp: new Date() });

    // A reply to a resolved ticket re-opens it.
    if (ticket.status === "Resolved") {
      ticket.status = "Open";
      ticket.statusHistory.push({ status: "Open", timestamp: new Date() });
    }

    await ticket.save();
    const safe = await Ticket.findById(ticket._id).select("-ai");
    return res.status(201).json({ success: true, ticket: safe });
  } catch (error) {
    return sendError(res, error, "Failed to send message");
  }
});

// Admin: reply (optionally changing status in the same call)
router.post("/:ticketId/reply", requireAdmin, async (req, res) => {
  const { ticketId } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = cleanText(body.text, 1, 2000);

  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ success: false, message: "Invalid ticket ID" });
  }
  if (!text) {
    return res
      .status(400)
      .json({ success: false, message: "Reply must be 1-2000 characters" });
  }

  const nextStatus = body.status;
  if (nextStatus !== undefined && !isTicketStatus(nextStatus)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  try {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new HttpError(404, "Ticket not found");

    ticket.messages.push({ author: "admin", text, timestamp: new Date() });

    const target: TicketStatus =
      nextStatus ?? (ticket.status === "Open" ? "In progress" : ticket.status);

    if (target !== ticket.status) {
      ticket.status = target;
      ticket.statusHistory.push({ status: target, timestamp: new Date() });
    }

    await ticket.save();
    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    return sendError(res, error, "Failed to reply");
  }
});

// Admin: change status without replying
router.patch("/:ticketId/status", requireAdmin, async (req, res) => {
  const { ticketId } = req.params;
  const { status } = (req.body ?? {}) as Record<string, unknown>;

  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ success: false, message: "Invalid ticket ID" });
  }
  if (!isTicketStatus(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  try {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new HttpError(404, "Ticket not found");

    if (ticket.status !== status) {
      ticket.status = status;
      ticket.statusHistory.push({ status, timestamp: new Date() });
      await ticket.save();
    }

    return res.json({ success: true, ticket });
  } catch (error) {
    return sendError(res, error, "Failed to update ticket");
  }
});

export default router;
