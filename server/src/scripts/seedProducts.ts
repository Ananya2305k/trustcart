import dotenv from "dotenv";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";

dotenv.config();

const sampleProducts = [
  { name: "Wireless Headphones", description: "Comfortable wireless headphones for everyday listening.", price: 1499, category: "Electronics", stock: 25 },
  { name: "Bluetooth Speaker", description: "Compact speaker with clear sound and 10 hours of playback.", price: 1199, category: "Electronics", stock: 20 },
  { name: "Power Bank 10000mAh", description: "Slim power bank with fast charging for phones and earbuds.", price: 999, category: "Electronics", stock: 30 },
  { name: "Classic Backpack", description: "A lightweight backpack for college and daily travel.", price: 899, category: "Accessories", stock: 18 },
  { name: "Canvas Wallet", description: "Durable canvas wallet with card slots and a coin pocket.", price: 349, category: "Accessories", stock: 35 },
  { name: "Stainless Steel Bottle", description: "Reusable bottle designed for everyday hydration.", price: 399, category: "Home & Living", stock: 40 },
  { name: "Desk Lamp", description: "A compact desk lamp for study and work.", price: 699, category: "Home & Living", stock: 12 },
  { name: "Ceramic Coffee Set", description: "Minimal ceramic mugs, set of two.", price: 1299, category: "Home & Living", stock: 15 },
  { name: "Notebook Pack", description: "Pack of three ruled notebooks with sturdy covers.", price: 249, category: "Stationery", stock: 60 },
  { name: "Gel Pen Set", description: "Smooth-writing gel pens in assorted colours.", price: 179, category: "Stationery", stock: 80 },
];

async function seedProducts() {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is missing from the .env file");
    }

    await mongoose.connect(uri);

    // Upsert by name: running the seed again never resets stock or
    // removes products that carts and orders already reference.
    const result = await Product.bulkWrite(
      sampleProducts.map((product) => ({
        updateOne: {
          filter: { name: product.name },
          update: { $setOnInsert: { ...product, imageUrl: "", isActive: true } },
          upsert: true,
        },
      }))
    );

    console.log(
      `Seed complete: ${result.upsertedCount} added, ${
        sampleProducts.length - result.upsertedCount
      } already existed.`
    );
  } catch (error) {
    console.error("Failed to seed products:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedProducts();
