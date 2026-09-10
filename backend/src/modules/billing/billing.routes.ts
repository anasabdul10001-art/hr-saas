import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import Stripe from "stripe";
import { requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import { env } from "../../config/env";
import * as billingService from "./billing.service";

export const billingRouter = Router();

billingRouter.use(requireAuth, requireCompanyContext);

billingRouter.get("/subscription", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  try {
    const subscription = await billingService.getCompanySubscription(req.user!.companyId!);
    res.json(subscription);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

const checkoutSchema = z.object({ planId: z.string() });

billingRouter.post("/checkout", requireRole(UserRole.COMPANY_ADMIN), async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await billingService.createCheckoutSession(req.user!.companyId!, parsed.data.planId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

billingRouter.post("/portal", requireRole(UserRole.COMPANY_ADMIN), async (req, res) => {
  try {
    const url = await billingService.createPortalSession(req.user!.companyId!);
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Mounted separately in index.ts with a raw-body parser (Stripe signature verification needs
// the exact bytes Stripe sent, not the JSON-reparsed body) and without auth — Stripe calls this
// directly, authenticated only by the signature.
export const billingWebhookRouter = Router();

billingWebhookRouter.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || !env.stripeWebhookSecret) {
    return res.status(400).json({ error: "Missing Stripe signature or webhook secret not configured" });
  }

  let event: Stripe.Event;
  try {
    // Signature verification is pure local HMAC — it needs the webhook secret, not an API key,
    // so this deliberately doesn't go through getStripe()'s "is Stripe configured" guard.
    event = Stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
  }

  try {
    await billingService.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handling error:", err);
    res.status(500).json({ error: "Failed to process webhook event" });
  }
});
