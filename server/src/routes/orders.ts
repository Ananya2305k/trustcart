import { Router, Response } from "express";
import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { Cart } from "../models/Cart.js";
import { Product } from "../models/Product.js";
import { authenticate, AuthRequest } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError } from "../lib/errors.js";
import { changeOrderStatus } from "../lib/orderService.js";
import { CUSTOMER_CANCELLABLE, isOrderStatus } from "../lib/orderStatus.js";
import { applyWindow } from "../lib/deliveryEstimate.js";
import { currentEstimateWindow } from "../lib/estimateService.js";

const router = Router();

router.use(authenticate);

type ShippingInput = {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/**
 * Accepts the address either at the top level of the body (current frontend)
 * or nested under `shippingAddress`.
 */
function parseShipping(body: unknown): ShippingInput | null {
  const root = (body ?? {}) as Record<string, unknown>;
  const source =
    typeof root.shippingAddress === "object" && root.shippingAddress !== null
      ? (root.shippingAddress as Record<string, unknown>)
      : root;

  const read = (key: string) =>
    typeof source[key] === "string" ? (source[key] as string).trim() : "";

  const shipping = {
    fullName: read("fullName"),
    phone: read("phone"),
    addressLine: read("addressLine") || read("addressLine1"),
    city: read("city"),
    state: read("state"),
    postalCode: read("postalCode"),
    country: read("country") || "India",
  };

  const required = [
    shipping.fullName,
    shipping.phone,
    shipping.addressLine,
    shipping.city,
    shipping.state,
    shipping.postalCode,
  ];

  return required.every(Boolean) ? shipping : null;
}

// Place an order from the logged-in user's cart
router.post("/checkout", async (req: AuthRequest, res: Response) => {
  const shipping = parseShipping(req.body);

  if (!shipping) {
    return res.status(400).json({
      success: false,
      message: "Please provide all shipping address fields",
    });
  }

  // Read-only lookup, done before the transaction starts.
  const window = await currentEstimateWindow();

  const session = await mongoose.startSession();

  try {
    let createdOrder: unknown = null;

    await session.withTransaction(async () => {
      const cart = await Cart.findOne({ user: req.userId }).session(session);

      if (!cart || cart.items.length === 0) {
        throw new HttpError(400, "Your cart is empty");
      }

      let subtotal = 0;
      const orderItems = [];

      for (const item of cart.items) {
        const product = await Product.findOne({
          _id: item.product,
          isActive: true,
        }).session(session);

        if (!product) {
          throw new HttpError(
            400,
            "A product in your cart is no longer available"
          );
        }

        if (product.stock < item.quantity) {
          throw new HttpError(
            400,
            `Insufficient stock for ${product.name}. Available: ${product.stock}`
          );
        }

        subtotal += product.price * item.quantity;

        orderItems.push({
          product: product._id,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          imageUrl: product.imageUrl,
        });
      }

      // Atomically reduce stock only when enough stock remains.
      for (const item of orderItems) {
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: item.product,
            isActive: true,
            stock: { $gte: item.quantity },
          },
          { $inc: { stock: -item.quantity } },
          { new: true, session }
        );

        if (!updatedProduct) {
          throw new HttpError(
            400,
            `Stock changed during checkout for ${item.name}. Please try again`
          );
        }
      }

      const shippingFee = subtotal >= 1000 ? 0 : 50;
      const total = subtotal + shippingFee;
      const now = new Date();
      const promised = applyWindow(now, window);

      const orders = await Order.create(
        [
          {
            user: req.userId,
            items: orderItems,
            subtotal,
            shippingFee,
            total,
            shippingAddress: shipping,
            estimatedDelivery: promised,
            estimateSource: window.source,
            estimateBasis: window.basis,
            estimateHistory: [
              {
                from: promised.from,
                to: promised.to,
                reason:
                  window.source === "history"
                    ? `Initial estimate from the last ${window.basis} deliveries`
                    : "Initial default estimate (not enough delivery history yet)",
                timestamp: now,
                recordedBy: "system",
              },
            ],
            paymentMethod: "Simulated",
            paymentStatus: "Pending",
            orderStatus: "Placed",
            trackingHistory: [
              {
                status: "Placed",
                message: "Your order has been placed",
                timestamp: now,
                recordedBy: "system",
              },
            ],
          },
        ],
        { session }
      );

      await Cart.updateOne(
        { user: req.userId },
        { $set: { items: [] } },
        { session }
      );

      createdOrder = orders[0];
    });

    return res.status(201).json({
      success: true,
      message:
        "Order placed successfully. Payment is simulated for this demo.",
      order: createdOrder,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }

    console.error("Checkout error:", error);

    return res.status(500).json({
      success: false,
      message: "Checkout failed. Please try again.",
    });
  } finally {
    await session.endSession();
  }
});

// Get all orders belonging to the logged-in customer
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .select("-__v");

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Fetch orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
});

// Get details of one order belonging to the logged-in customer
router.get("/:orderId", async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.userId,
    }).select("-__v");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Fetch order details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
    });
  }
});

// Customer cancels their own order (only before it ships)
router.post("/:orderId/cancel", async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }

  const session = await mongoose.startSession();

  try {
    let updatedOrder: unknown = null;

    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        user: req.userId,
      }).session(session);

      if (!order) throw new HttpError(404, "Order not found");

      if (!CUSTOMER_CANCELLABLE.includes(order.orderStatus)) {
        throw new HttpError(
          400,
          `An order that is ${order.orderStatus.toLowerCase()} can no longer be cancelled`
        );
      }

      await changeOrderStatus(order, "Cancelled", "customer", session);
      updatedOrder = order;
    });

    return res.json({
      success: true,
      message: "Order cancelled",
      order: updatedOrder,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }

    console.error("Cancel order error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to cancel order" });
  } finally {
    await session.endSession();
  }
});

// Admin-only: revise the promised delivery window. The reason is mandatory and
// every revision is kept, so the customer can see how the date changed.
router.patch(
  "/:orderId/estimate",
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { orderId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const from = new Date(String(body.from));
    const to = new Date(String(body.to));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Valid from and to dates are required" });
    }
    if (from.getTime() > to.getTime()) {
      return res
        .status(400)
        .json({ success: false, message: "The start date must not be after the end date" });
    }
    if (reason.length < 5 || reason.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Give the customer a reason (5-200 characters)",
      });
    }

    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
      if (order.orderStatus === "Delivered" || order.orderStatus === "Cancelled") {
        return res.status(400).json({
          success: false,
          message: `The delivery date of a ${order.orderStatus.toLowerCase()} order cannot be changed`,
        });
      }

      order.estimatedDelivery = { from, to };
      order.estimateHistory.push({
        from,
        to,
        reason,
        timestamp: new Date(),
        recordedBy: "admin",
      });
      await order.save();

      return res.json({
        success: true,
        message: "Delivery estimate revised",
        order,
      });
    } catch (error) {
      console.error("Revise estimate error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to revise the estimate" });
    }
  }
);

// Admin-only order status update
router.patch(
  "/:orderId/status",
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { orderId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { status, message, carrier, trackingNumber } = body;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    if (!isOrderStatus(status) || status === "Placed") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order status" });
    }

    const optionalText = (value: unknown) =>
      value === undefined || value === ""
        ? undefined
        : typeof value === "string" && value.trim().length <= 200
          ? value.trim()
          : null;

    const cleanMessage = optionalText(message);
    const cleanCarrier = optionalText(carrier);
    const cleanTracking = optionalText(trackingNumber);

    if (
      cleanMessage === null ||
      cleanCarrier === null ||
      cleanTracking === null
    ) {
      return res.status(400).json({
        success: false,
        message: "Message, carrier and tracking number must be short text",
      });
    }

    const session = await mongoose.startSession();

    try {
      let updatedOrder: unknown = null;

      await session.withTransaction(async () => {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new HttpError(404, "Order not found");

        await changeOrderStatus(order, status, "admin", session, {
          message: cleanMessage,
          carrier: cleanCarrier,
          trackingNumber: cleanTracking,
        });
        updatedOrder = order;
      });

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message });
      }

      console.error("Update order status error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to update order status" });
    } finally {
      await session.endSession();
    }
  }
);

export default router;
