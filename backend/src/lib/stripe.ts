import Stripe from "stripe";

let client: Stripe | null = null;
let attempted = false;

// Lazily constructed so the app can boot and every non-billing feature works even before
// Stripe keys are configured — only the billing endpoints themselves need this.
export function getStripe(): Stripe {
  if (!attempted) {
    attempted = true;
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) client = new Stripe(key);
  }
  if (!client) throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY in backend/.env");
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
