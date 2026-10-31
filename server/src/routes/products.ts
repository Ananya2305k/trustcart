import { Router } from "express";
import { Product } from "../models/Product.js";
import { escapeRegex } from "../lib/text.js";
 
const router = Router();
 
// Get active products with search, category filtering, and pagination
router.get("/", async (req, res) => {
  try {
    // Escaped so characters like "(" or "*" are searched literally instead of
    // breaking the query (or enabling expensive regex patterns).
    const search =
      typeof req.query.search === "string"
        ? escapeRegex(req.query.search.trim().slice(0, 60))
        : "";
 
    const category =
      typeof req.query.category === "string"
        ? req.query.category.trim()
        : "";
 
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
 
    const filter: Record<string, unknown> = {
      isActive: true,
    };
 
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
 
    if (category) {
      filter.category = category;
    }
 
    const skip = (page - 1) * limit;
 
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);
 
    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch products:", error);
 
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});
 
export default router;