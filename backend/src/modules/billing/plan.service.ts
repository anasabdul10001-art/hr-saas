import { prisma } from "../../lib/prisma";

export async function listActivePlans() {
  return prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } });
}

export async function listAllPlans() {
  return prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } });
}

export async function createPlan(input: {
  name: string;
  priceMonthly: number;
  currency?: string;
  maxEmployees: number;
  features: Record<string, boolean>;
}) {
  return prisma.subscriptionPlan.create({ data: input });
}

export async function updatePlan(
  id: string,
  input: Partial<{ name: string; priceMonthly: number; maxEmployees: number; features: Record<string, boolean>; isActive: boolean }>
) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!existing) throw new Error("Plan not found");
  return prisma.subscriptionPlan.update({ where: { id }, data: input });
}
