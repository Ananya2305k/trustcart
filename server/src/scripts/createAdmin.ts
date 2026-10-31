/**
 * Creates an admin account, or promotes an existing user.
 *
 *   npm run create-admin -- admin@example.com "StrongPassword123" "Admin Name"
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";

dotenv.config();

async function main() {
  const [email, password, name = "TrustCart Admin"] = process.argv.slice(2);

  if (!email || !password) {
    throw new Error(
      'Usage: npm run create-admin -- <email> <password> ["Full Name"]'
    );
  }
  if (password.length < 8 || password.length > 72) {
    throw new Error("Password must be between 8 and 72 characters");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from the .env file");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const normalized = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalized });

  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log(`Existing user ${normalized} is now an admin.`);
  } else {
    await User.create({
      name,
      email: normalized,
      password: await bcrypt.hash(password, 12),
      role: "admin",
    });
    console.log(`Admin account ${normalized} created.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
