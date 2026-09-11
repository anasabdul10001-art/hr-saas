import { prisma } from "../../lib/prisma";
import { invalidateStripeCache } from "../../lib/stripe";

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

export async function getSettings() {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  return {
    stripeSecretKeySet: Boolean(settings?.stripeSecretKey || process.env.STRIPE_SECRET_KEY),
    stripeSecretKeyMasked: mask(settings?.stripeSecretKey) ?? (process.env.STRIPE_SECRET_KEY ? "(from .env)" : null),
    stripeWebhookSecretSet: Boolean(settings?.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET),
    stripeWebhookSecretMasked: mask(settings?.stripeWebhookSecret) ?? (process.env.STRIPE_WEBHOOK_SECRET ? "(from .env)" : null),
  };
}

export async function updateSettings(input: { stripeSecretKey?: string; stripeWebhookSecret?: string }) {
  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...input },
    update: input,
  });
  invalidateStripeCache();
  return getSettings();
}
