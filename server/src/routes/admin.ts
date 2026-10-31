import { Router, Response } from "express";
import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { Refund } from "../models/Refund.js";
import { Ticket } from "../models/Ticket.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { isOrderStatus } from "../lib/orderStatus.js";

const router = Router();
router.use(authenticate, requireAdmin);

const LOW_STOCK_THRESHOLD = 5;

function fail(res: Response, error: unknown, message: string) {
  console.error(message, error);
  return res.status(500).json({ success: false, message });
}

router.get("/stats", async (_req, res) => {
  try {
    const [byStatus, revenue, openTickets, urgentTickets, pendingRefunds, lowStock] =
      await Promise.all([
        Order.aggregate<{ _id: string; count: number }>([
          { $match: { simulated: { $ne: true } } },
          { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
        ]),
        Order.aggregate<{ total: number }>([
          { $match: { orderStatus: "Delivered", simulated: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
        Ticket.countDocuments({ status: { $in: ["Open", "In progress"] } }),
        Ticket.countDocuments({
          status: { $in: ["Open", "In progress"] },
          "ai.urgency": "high",
        }),
        Refund.countDocuments({ status: { $in: ["Requested", "Under review"] } }),
        Product.countDocuments({
          isActive: true,
          stock: { $lte: LOW_STOCK_THRESHOLD },
        }),
      ]);

    const orders: Record<string, number> = {};
    for (const row of byStatus) orders[row._id] = row.count;

    return res.json({
      success: true,
      stats: {
        orders,
        deliveredRevenue: revenue[0]?.total ?? 0,
        openTickets,
        urgentTickets,
        pendingRefunds,
        lowStockProducts: lowStock,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
      },
    });
  } catch (error) {
    return fail(res, error, "Failed to load stats");
  }
});

router.get("/orders", async (req, res) => {
  try {
    const status = req.query.status;
    // Simulated demo orders are never listed as real orders.
    const filter = isOrderStatus(status)
      ? { orderStatus: status, simulated: { $ne: true } }
      : { simulated: { $ne: true } };

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("user", "name email");

    return res.json({ success: true, orders });
  } catch (error) {
    return fail(res, error, "Failed to fetch orders");
  }
});

router.get("/products", async (_req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    return res.json({ success: true, products });
  } catch (error) {
    return fail(res, error, "Failed to fetch products");
  }
});

router.post("/products", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { name, description, category, imageUrl } = body;
  const price = Number(body.price);
  const stock = Number(body.stock);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof description !== "string" ||
    !description.trim() ||
    typeof category !== "string" ||
    !category.trim() ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Name, description, category, a non-negative price and an integer stock are required",
    });
  }

  try {
    const product = await Product.create({
      name,
      description,
      category,
      price,
      stock,
      imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
    });
    return res.status(201).json({ success: true, product });
  } catch (error) {
    return fail(res, error, "Failed to create product");
  }
});

router.patch("/products/:productId", async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ success: false, message: "Invalid price" });
    }
    update.price = price;
  }
  if (body.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ success: false, message: "Invalid stock" });
    }
    update.stock = stock;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "Invalid isActive" });
    }
    update.isActive = body.isActive;
  }

  if (Object.keys(update).length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Nothing to update" });
  }

  try {
    const product = await Product.findByIdAndUpdate(productId, update, {
      new: true,
      runValidators: true,
    });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    return res.json({ success: true, product });
  } catch (error) {
    return fail(res, error, "Failed to update product");
  }
});

export default router;
