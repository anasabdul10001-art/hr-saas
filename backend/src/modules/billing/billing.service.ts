import Stripe from "stripe";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getStripe } from "../../lib/stripe";
import { env } from "../../config/env";

export async function getCompanySubscription(companyId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { companyId },
    include: { plan: true, invoices: { orderBy: { issuedAt: "desc" }, take: 12 } },
  });
  if (!subscription) throw new Error("This company has no subscription record");
  return subscription;
}

async function ensureStripeCustomer(companyId: string): Promise<string> {
  const subscription = await getCompanySubscription(companyId);
  if (subscription.stripeCustomerId) return subscription.stripeCustomerId;

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const stripe = getStripe();
  const customer = await stripe.customers.create({ name: company.name, metadata: { companyId } });

  await prisma.subscription.update({ where: { companyId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export async function createCheckoutSession(companyId: string, planId: string) {
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: planId } });

  // A Free plan needs no payment — switch immediately instead of going through Stripe.
  if (plan.priceMonthly === 0) {
    await prisma.subscription.update({
      where: { companyId },
      data: { planId: plan.id, status: SubscriptionStatus.ACTIVE },
    });
    return { free: true as const };
  }

  const customerId = await ensureStripeCustomer(companyId);
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: plan.currency,
          unit_amount: plan.priceMonthly,
          recurring: { interval: "month" },
          product_data: { name: `${plan.name} plan` },
        },
        quantity: 1,
      },
    ],
    metadata: { companyId, planId },
    success_url: `${env.frontendUrl}/billing?checkout=success`,
    cancel_url: `${env.frontendUrl}/billing?checkout=canceled`,
  });

  return { free: false as const, url: session.url };
}

export async function createPortalSession(companyId: string) {
  const subscription = await getCompanySubscription(companyId);
  if (!subscription.stripeCustomerId) throw new Error("No Stripe customer on file yet — subscribe to a paid plan first");

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${env.frontendUrl}/billing`,
  });
  return portal.url;
}

// Stripe v22 moved the subscription reference off the top-level `invoice.subscription` field
// (removed) to `invoice.parent.subscription_details.subscription`.
function getInvoiceStripeSubscriptionId(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

async function findSubscriptionByStripeId(stripeSubscriptionId: string) {
  const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId } });
  if (!subscription) throw new Error(`No local subscription found for Stripe subscription ${stripeSubscriptionId}`);
  return subscription;
}

export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;
      const planId = session.metadata?.planId;
      if (!companyId || !planId) break;

      await prisma.subscription.update({
        where: { companyId },
        data: {
          planId,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
        },
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId = getInvoiceStripeSubscriptionId(invoice);
      if (!stripeSubscriptionId) break;

      const subscription = await findSubscriptionByStripeId(stripeSubscriptionId);
      const periodEnd = invoice.lines.data[0]?.period?.end;

      await prisma.$transaction([
        prisma.invoice.create({
          data: {
            subscriptionId: subscription.id,
            stripeInvoiceId: invoice.id,
            amountDue: invoice.amount_due,
            amountPaid: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status ?? "paid",
            issuedAt: new Date(invoice.created * 1000),
          },
        }),
        prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
          },
        }),
      ]);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId = getInvoiceStripeSubscriptionId(invoice);
      if (!stripeSubscriptionId) break;

      const subscription = await findSubscriptionByStripeId(stripeSubscriptionId);
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.PAST_DUE } });
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const subscription = await findSubscriptionByStripeId(stripeSubscription.id);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
      });
      break;
    }

    default:
      break;
  }
}
