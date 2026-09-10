import { prisma } from "../../lib/prisma";

export async function listLeaveTypes(companyId: string) {
  return prisma.leaveType.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function createLeaveType(companyId: string, input: { name: string; defaultBalance: number; isPaid?: boolean }) {
  return prisma.leaveType.create({
    data: { companyId, name: input.name, defaultBalance: input.defaultBalance, isPaid: input.isPaid ?? true },
  });
}

export async function updateLeaveType(
  companyId: string,
  id: string,
  input: Partial<{ name: string; defaultBalance: number; isPaid: boolean }>
) {
  const existing = await prisma.leaveType.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error("Leave type not found");
  return prisma.leaveType.update({ where: { id }, data: input });
}
