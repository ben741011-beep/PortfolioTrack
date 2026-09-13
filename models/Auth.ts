import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

import clientPromise, { mongoClient } from "@/lib/mongodb";

const database = mongoClient.db();

export const auth = betterAuth({
  appName: "PortfolioTrack",
  database: mongodbAdapter(database, { client: mongoClient }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
  },
});

export async function getAuthDatabase() {
  const client = await clientPromise;
  return client.db();
}
