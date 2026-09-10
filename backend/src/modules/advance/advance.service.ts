import { AdvanceStatus, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { findOwnEmployee, scopedEmployeeWhere } from "../employees/employee.scope";

const OPEN_STATUSES: AdvanceStatus[] = [AdvanceStatus.PENDING_MANAGER, AdvanceStatus.PENDING_HR, AdvanceStatus.APPROVED];

export async function createAdvanceRequest(
  user: AuthenticatedUser,
  input: { amount: number; installmentsCount: number; reason?: string }
) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const existingOpen = await prisma.salaryAdvance.findFirst({
    where: { employeeId: employee.id, status: { in: OPEN_STATUSES } },
  });
  if (existingOpen) throw new Error("You already have an advance that is pending or still being repaid");

  const initialStatus = employee.managerId ? AdvanceStatus.PENDING_MANAGER : AdvanceStatus.PENDING_HR;

  return prisma.salaryAdvance.create({
    data: {
      companyId: user.companyId!,
      employeeId: employee.id,
      amount: input.amount,
      installmentsCount: input.installmentsCount,
      reason: input.reason,
      status: initialStatus,
    },
  });
}

function withBalance(advance: { amount: number; installments: { amount: number; isPaid: boolean }[] }) {
  const paidAmount = advance.installments.filter((i) => i.isPaid).reduce((sum, i) => sum + i.amount, 0);
  return { ...advance, paidAmount, remainingAmount: advance.amount - paidAmount };
}

export async function listMyAdvances(user: AuthenticatedUser) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const advances = await prisma.salaryAdvance.findMany({
    where: { employeeId: employee.id },
    include: { installments: { orderBy: { dueDate: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return advances.map(withBalance);
}

export async function listAdvances(user: AuthenticatedUser, filters: { status?: AdvanceStatus }) {
  const employeeScope = await scopedEmployeeWhere(user);

  const advances = await prisma.salaryAdvance.findMany({
    where: {
      companyId: user.companyId!,
      employee: employeeScope,
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: {
      installments: { orderBy: { dueDate: "asc" } },
      employee: { select: { id: true, firstName: true, lastName: true, managerId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return advances.map(withBalance);
}

function generateInstallments(advanceId: string, totalAmount: number, count: number, startDate: Date) {
  const base = Math.floor(totalAmount / count);
  const remainder = totalAmount - base * count;

  return Array.from({ length: count }, (_, i) => {
    const dueDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i + 1, startDate.getUTCDate()));
    const amount = i === count - 1 ? base + remainder : base;
    return { advanceId, amount, dueDate };
  });
}

export async function decide(user: AuthenticatedUser, advanceId: string, decision: "APPROVE" | "REJECT") {
  const advance = await prisma.salaryAdvance.findFirst({
    where: { id: advanceId, companyId: user.companyId! },
    include: { employee: true },
  });
  if (!advance) throw new Error("Advance request not found");

  if (advance.status === AdvanceStatus.PENDING_MANAGER) {
    const actingEmployee = await findOwnEmployee(user);
    const isAssignedManager = user.role === UserRole.MANAGER && actingEmployee?.id === advance.employee.managerId;
    const isAdmin = user.role === UserRole.COMPANY_ADMIN;
    if (!isAssignedManager && !isAdmin) throw new Error("Only this employee's manager can act on this request");

    if (decision === "REJECT") {
      return prisma.salaryAdvance.update({ where: { id: advance.id }, data: { status: AdvanceStatus.REJECTED } });
    }
    return prisma.salaryAdvance.update({ where: { id: advance.id }, data: { status: AdvanceStatus.PENDING_HR } });
  }

  if (advance.status === AdvanceStatus.PENDING_HR) {
    if (user.role !== UserRole.HR && user.role !== UserRole.COMPANY_ADMIN) {
      throw new Error("Only HR or a Company Admin can give final approval");
    }

    if (decision === "REJECT") {
      return prisma.salaryAdvance.update({ where: { id: advance.id }, data: { status: AdvanceStatus.REJECTED } });
    }

    const installments = generateInstallments(advance.id, advance.amount, advance.installmentsCount, new Date());
    await prisma.$transaction([
      prisma.advanceInstallment.createMany({ data: installments }),
      prisma.salaryAdvance.update({ where: { id: advance.id }, data: { status: AdvanceStatus.APPROVED } }),
    ]);
    return prisma.salaryAdvance.findUniqueOrThrow({ where: { id: advance.id }, include: { installments: true } });
  }

  throw new Error("This request is not pending a decision");
}
