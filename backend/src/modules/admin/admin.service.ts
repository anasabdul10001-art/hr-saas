import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function listCompanies() {
  const companies = await prisma.company.findMany({
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    isSuspended: c.isSuspended,
    createdAt: c.createdAt,
    employeeCount: c._count.employees,
    subscription: c.subscription
      ? { status: c.subscription.status, plan: c.subscription.plan.name, priceMonthly: c.subscription.plan.priceMonthly }
      : null,
  }));
}

export async function getCompanyDetail(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      subscription: { include: { plan: true, invoices: { orderBy: { issuedAt: "desc" }, take: 24 } } },
      _count: { select: { employees: true } },
    },
  });
  if (!company) throw new Error("Company not found");
  return company;
}

export async function updateCompanySubscription(
  companyId: string,
  input: Partial<{ planId: string; status: SubscriptionStatus; trialEndsAt: string | null }>
) {
  const subscription = await prisma.subscription.findUnique({ where: { companyId } });
  if (!subscription) throw new Error("This company has no subscription record");

  return prisma.subscription.update({
    where: { companyId },
    data: {
      planId: input.planId,
      status: input.status,
      trialEndsAt: input.trialEndsAt === undefined ? undefined : input.trialEndsAt ? new Date(input.trialEndsAt) : null,
    },
  });
}

export async function setCompanySuspended(companyId: string, isSuspended: boolean) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");
  return prisma.company.update({ where: { id: companyId }, data: { isSuspended } });
}

export async function getRevenueOverview() {
  const subscriptions = await prisma.subscription.findMany({ include: { plan: true } });

  const countsByStatus: Record<string, number> = {};
  let mrr = 0;
  for (const sub of subscriptions) {
    countsByStatus[sub.status] = (countsByStatus[sub.status] ?? 0) + 1;
    if (sub.status === SubscriptionStatus.ACTIVE) mrr += sub.plan.priceMonthly;
  }

  const pastDue = await prisma.subscription.findMany({
    where: { status: SubscriptionStatus.PAST_DUE },
    include: { company: { select: { id: true, name: true } }, plan: true },
  });

  // Simple month-bucketed revenue trend from actual paid invoices (last 12 months of data, if any).
  const invoices = await prisma.invoice.findMany({
    where: { status: "paid" },
    orderBy: { issuedAt: "asc" },
  });
  const trend = new Map<string, number>();
  for (const inv of invoices) {
    const key = `${inv.issuedAt.getUTCFullYear()}-${String(inv.issuedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    trend.set(key, (trend.get(key) ?? 0) + inv.amountPaid);
  }

  return {
    mrr,
    arr: mrr * 12,
    countsByStatus,
    pastDueAccounts: pastDue.map((s) => ({ companyId: s.company.id, companyName: s.company.name, plan: s.plan.name })),
    revenueTrend: Array.from(trend.entries()).map(([month, amount]) => ({ month, amount })),
  };
}
