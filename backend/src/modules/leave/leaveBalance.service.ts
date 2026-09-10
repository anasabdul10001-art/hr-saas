import { prisma } from "../../lib/prisma";

// Lazily provisions a balance row the first time a given employee/leaveType/year combination
// is touched, seeded from the leave type's configured default — so HR never has to pre-create
// balances for every employee up front.
export async function getOrCreateBalance(employeeId: string, leaveTypeId: string, year: number) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
  if (existing) return existing;

  const leaveType = await prisma.leaveType.findUniqueOrThrow({ where: { id: leaveTypeId } });
  return prisma.leaveBalance.create({
    data: { employeeId, leaveTypeId, year, balanceDays: leaveType.defaultBalance },
  });
}

export async function listBalancesForEmployee(companyId: string, employeeId: string, year: number) {
  const leaveTypes = await prisma.leaveType.findMany({ where: { companyId } });
  return Promise.all(
    leaveTypes.map(async (leaveType) => {
      const balance = await getOrCreateBalance(employeeId, leaveType.id, year);
      return { leaveType, balanceDays: balance.balanceDays };
    })
  );
}

export async function adjustBalance(
  companyId: string,
  input: { employeeId: string; leaveTypeId: string; year: number; balanceDays: number }
) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
  if (!employee) throw new Error("Employee not found in this company");
  const leaveType = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, companyId } });
  if (!leaveType) throw new Error("Leave type not found in this company");

  return prisma.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, year: input.year } },
    create: { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, year: input.year, balanceDays: input.balanceDays },
    update: { balanceDays: input.balanceDays },
  });
}

export async function deductBalance(employeeId: string, leaveTypeId: string, year: number, days: number) {
  const balance = await getOrCreateBalance(employeeId, leaveTypeId, year);
  return prisma.leaveBalance.update({ where: { id: balance.id }, data: { balanceDays: balance.balanceDays - days } });
}

export async function restoreBalance(employeeId: string, leaveTypeId: string, year: number, days: number) {
  const balance = await getOrCreateBalance(employeeId, leaveTypeId, year);
  return prisma.leaveBalance.update({ where: { id: balance.id }, data: { balanceDays: balance.balanceDays + days } });
}
