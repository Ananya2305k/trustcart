/**
 * Generates SIMULATED delivered orders so the history-based delivery estimate
 * and promise statistics have something to work with in a demo.
 *
 *   npm run seed-history              # adds 60 simulated orders
 *   npm run seed-history -- 100       # adds 100
 *   npm run seed-history -- --clear   # removes all simulated orders
 *
 * IMPORTANT: this is made-up data. The delivery-time distribution below is an
 * assumption for demonstration, not a measurement. Every order is flagged
 * `simulated: true`, and the public statistics report the simulated share.
 */
import dotenv from "dotenv";
import crypto from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { DAY_MS } from "../lib/deliveryEstimate.js";

dotenv.config();

const DEMO_EMAIL = "demo-history@trustcart.local";

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Assumed mix: most deliveries 3-6 days, some slower, a few much slower. */
function sampleDurationDays(): number {
  const roll = Math.random();
  if (roll < 0.8) return randomBetween(3, 6);
  if (roll < 0.95) return randomBetween(6, 9);
  return randomBetween(9, 14);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from the .env file");
  }
  await mongoose.connect(process.env.MONGODB_URI);

  if (process.argv.includes("--clear")) {
    const result = await Order.deleteMany({ simulated: true });
    console.log(`Removed ${result.deletedCount} simulated orders.`);
    return;
  }

  const requested = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)));
  const count = Number.isInteger(requested) && requested > 0 ? requested : 60;

  const products = await Product.find({ isActive: true }).limit(20);
  if (products.length === 0) {
    throw new Error("No products found. Run `npm run seed` first.");
  }

  let demoUser = await User.findOne({ email: DEMO_EMAIL });
  if (!demoUser) {
    demoUser = await User.create({
      name: "Demo History",
      email: DEMO_EMAIL,
      // Random password nobody knows: this account cannot be logged into.
      password: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12),
      role: "customer",
    });
  }

  const now = Date.now();
  const docs = [];

  for (let i = 0; i < count; i += 1) {
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = 1 + Math.floor(Math.random() * 2);
    const subtotal = product.price * quantity;
    const shippingFee = subtotal >= 1000 ? 0 : 50;

    // Placed 15-90 days ago, so every order is already delivered.
    const placedAt = new Date(now - randomBetween(15, 90) * DAY_MS);
    const durationDays = sampleDurationDays();
    const deliveredAt = new Date(placedAt.getTime() + durationDays * DAY_MS);

    const originalFrom = new Date(placedAt.getTime() + 3 * DAY_MS);
    const originalTo = new Date(placedAt.getTime() + 7 * DAY_MS);

    const estimateHistory: {
      from: Date;
      to: Date;
      reason: string;
      timestamp: Date;
      recordedBy: "system" | "admin";
    }[] = [
      {
        from: originalFrom,
        to: originalTo,
        reason: "Initial default estimate (simulated order)",
        timestamp: placedAt,
        recordedBy: "system",
      },
    ];
    let currentTo = originalTo;

    // Slow orders are often (not always) revised once, when the delay is noticed.
    if (durationDays > 7 && Math.random() < 0.6) {
      const revisedFrom = new Date(placedAt.getTime() + (durationDays - 1) * DAY_MS);
      const revisedTo = new Date(placedAt.getTime() + (durationDays + 1) * DAY_MS);
      estimateHistory.push({
        from: revisedFrom,
        to: revisedTo,
        reason: "Carrier delay (simulated order)",
        timestamp: new Date(placedAt.getTime() + 6 * DAY_MS),
        recordedBy: "admin",
      });
      currentTo = revisedTo;
    }

    const history = (status: string, message: string, offsetDays: number, by: string) => ({
      status,
      message,
      timestamp: new Date(placedAt.getTime() + offsetDays * DAY_MS),
      recordedBy: by,
    });

    docs.push({
      _id: new mongoose.Types.ObjectId(),
      user: demoUser._id,
      items: [
        {
          product: product._id,
          name: product.name,
          price: product.price,
          quantity,
          imageUrl: product.imageUrl,
        },
      ],
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      shippingAddress: {
        fullName: "Demo Customer",
        phone: "0000000000",
        addressLine: "Simulated address",
        city: "Demo City",
        state: "Demo State",
        postalCode: "000000",
        country: "India",
      },
      estimatedDelivery: { from: originalFrom, to: currentTo },
      estimateHistory,
      estimateSource: "default",
      estimateBasis: 0,
      paymentMethod: "Simulated",
      paymentStatus: "Paid",
      orderStatus: "Delivered",
      simulated: true,
      trackingHistory: [
        history("Placed", "Your order has been placed", 0, "system"),
        history("Confirmed", "The seller confirmed your order", 0.5, "admin"),
        history("Shipped", "Your order has been handed over for shipping", 1.5, "admin"),
        {
          status: "Delivered",
          message: "Your order was marked as delivered",
          timestamp: deliveredAt,
          recordedBy: "admin",
        },
      ],
      createdAt: placedAt,
      updatedAt: deliveredAt,
    });
  }

  // Raw insert so the back-dated createdAt/updatedAt are kept as given.
  await Order.collection.insertMany(docs);

  console.log(`Added ${docs.length} SIMULATED delivered orders (flagged simulated: true).`);
  console.log("Remove them any time with: npm run seed-history -- --clear");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
