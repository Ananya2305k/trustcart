import { Router } from "express";
import mongoose from "mongoose";
import { Cart } from "../models/Cart.js";
import { Product } from "../models/Product.js";
import {
  authenticate,
  AuthRequest,
} from "../middleware/authenticate.js";

const router = Router();

// All cart endpoints require authentication.
router.use(authenticate);

function getUserId(req: AuthRequest): string {
  return req.userId!;
}

// View the current user's cart
router.get("/", async (req, res) => {
  try {
    const cart = await Cart.findOne({
      user: getUserId(req as AuthRequest),
    }).populate("items.product", "name price imageUrl stock isActive");

    const items = (cart?.items ?? [])
      .filter((item) => item.product != null)
      .map((item) => {
        const product = item.product as unknown as {
          _id: mongoose.Types.ObjectId;
          name: string;
          price: number;
          imageUrl: string;
          stock: number;
          isActive: boolean;
        };

        return {
          product,
          quantity: item.quantity,
          subtotal: product.price * item.quantity,
        };
      });

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    return res.json({
      success: true,
      data: {
        items,
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
        total,
      },
    });
  } catch (error) {
    console.error("Failed to fetch cart:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch cart",
    });
  }
});

// Add a product to the cart
router.post("/items", async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body ?? {};

    if (
      typeof productId !== "string" ||
      !mongoose.isValidObjectId(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid productId and positive integer quantity are required",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        success: false,
        message: "Requested quantity exceeds available stock",
      });
    }

    const userId = getUserId(req as AuthRequest);
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.product.toString() === productId
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: "Requested quantity exceeds available stock",
        });
      }

      existingItem.quantity = newQuantity;
    } else {
      cart.items.push({
        product: new mongoose.Types.ObjectId(productId),
        quantity,
      });
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Product added to cart",
    });
  } catch (error) {
    console.error("Failed to add to cart:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to add product to cart",
    });
  }
});

// Update an item's quantity
router.patch("/items/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body ?? {};

    if (
      !mongoose.isValidObjectId(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid productId and positive integer quantity are required",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        success: false,
        message: "Requested quantity exceeds available stock",
      });
    }

    const cart = await Cart.findOne({
      user: getUserId(req as AuthRequest),
    });

    const item = cart?.items.find(
      (entry) => entry.product.toString() === productId
    );

    if (!cart || !item) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart",
      });
    }

    item.quantity = quantity;
    await cart.save();

    return res.json({
      success: true,
      message: "Cart quantity updated",
    });
  } catch (error) {
    console.error("Failed to update cart:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update cart",
    });
  }
});

// Remove an item from the cart
router.delete("/items/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid productId",
      });
    }

    const cart = await Cart.findOne({
      user: getUserId(req as AuthRequest),
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const initialLength = cart.items.length;

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart",
      });
    }

    await cart.save();

    return res.json({
      success: true,
      message: "Product removed from cart",
    });
  } catch (error) {
    console.error("Failed to remove cart item:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to remove product",
    });
  }
});

export default router;