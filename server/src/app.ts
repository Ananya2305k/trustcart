import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import mongoose from "mongoose";
import productRoutes from "./routes/products.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import orderRoutes from "./routes/orders.js";
import refundRoutes from "./routes/refunds.js";
import ticketRoutes from "./routes/tickets.js";
import adminRoutes from "./routes/admin.js";
import statsRoutes from "./routes/stats.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// CORS_ORIGIN is a comma-separated list, e.g.
// "http://localhost:5173,https://shop.example.com".
// When it is not set, any localhost port is allowed (local development only).
const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localhostOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(helmet());
app.use(
  cors({
    origin: configuredOrigins.length > 0 ? configuredOrigins : localhostOrigin,
  })
);
app.use(express.json({ limit: "100kb" }));

// Slow down password guessing and signup spam (not /auth/me, which the
// frontend calls on every page load).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "TrustCart API is running",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/stats", statsRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Last-resort handler (malformed JSON, unexpected throws).
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;

  if (status === 500) console.error("Unhandled error:", error);

  res.status(status).json({
    success: false,
    message: status === 500 ? "Something went wrong" : "Invalid request",
  });
});

async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file");
    }
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from the .env file");
    }

    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`TrustCart API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start TrustCart:", error);
    process.exit(1);
  }
}

void startServer();
