import Stripe from "stripe";
import { prisma } from "./prisma";

let cachedClient: Stripe | null = null;
let cachedKey: string | null = null;

async function resolveSecretKey(): Promise<string | null> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  return settings?.stripeSecretKey || process.env.STRIPE_SECRET_KEY || null;
}

export async function resolveWebhookSecret(): Promise<string | null> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  return settings?.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || null;
}

// Checks the Super Admin-managed setting first (see modules/settings), falling back to
// backend/.env so a from-scratch checkout still works without touching the dashboard. Cached by
// key value so a settings update takes effect on the very next call, not just the next restart.
export async function getStripe(): Promise<Stripe> {
  const key = await resolveSecretKey();
  if (!key) throw new Error("Stripe is not configured — set it from the Super Admin dashboard or backend/.env");

  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Stripe(key);
    cachedKey = key;
  }
  return cachedClient;
}

export async function isStripeConfigured(): Promise<boolean> {
  return Boolean(await resolveSecretKey());
}

// Called after the Super Admin updates the stored key so the next getStripe() picks it up
// immediately instead of serving the previous client from cache.
export function invalidateStripeCache() {
  cachedClient = null;
  cachedKey = null;
}
