import type { NextFunction, Response } from "express";
import { User } from "../models/User.js";
import type { AuthRequest } from "./authenticate.js";

/** Use after `authenticate`. Checks the role in the database on every call. */
export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const user = await User.findById(req.userId).select("role");

  if (!user || user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
}
