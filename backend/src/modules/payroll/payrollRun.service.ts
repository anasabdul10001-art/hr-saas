import { AdvanceStatus, EmploymentStatus, LeaveRequestStatus, PayrollRunStatus, SalaryComponentType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { notify } from "../notification/notification.service";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function workingDaySet(workingDays: unknown): Set<string> {
  const days = Array.isArray(workingDays) ? (workingDays as string[]) : ["mon", "tue", "wed", "thu", "fri"];
  return new Set(days.map((d) => d.toLowerCase()));
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// periodEnd is stored as a calendar date at UTC midnight; attendance checkIn timestamps carry a
// real time-of-day, so a plain `lte: periodEnd` would exclude every check-in on the last day of
// the period except one at exactly midnight. Push the bound to the end of that day instead.
function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function enumerateWorkingDays(start: Date, end: Date, daySet: Set<string>): Date[] {
  const days: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    if (daySet.has(DAY_KEYS[cursor.getUTCDay()])) days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function createPayrollRun(companyId: string, input: { periodStart: string; periodEnd: string }) {
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (periodEnd < periodStart) throw new Error("periodEnd must be on or after periodStart");

  return prisma.payrollRun.create({ data: { companyId, periodStart, periodEnd } });
}

export async function listPayrollRuns(companyId: string) {
  return prisma.payrollRun.findMany({ where: { companyId }, orderBy: { periodStart: "desc" } });
}

export async function getPayrollRun(companyId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
    include: { payslips: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  if (!run) throw new Error("Payroll run not found");
  return run;
}

export async function processPayrollRun(companyId: string, runId: string, actingUserId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== PayrollRunStatus.DRAFT) throw new Error("Only a draft payroll run can be processed");

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const daySet = workingDaySet(company.workingDays);
  const workingDays = enumerateWorkingDays(run.periodStart, run.periodEnd, daySet);

  const employees = await prisma.employee.findMany({
    where: { companyId, employmentStatus: EmploymentStatus.ACTIVE, hireDate: { lte: run.periodEnd } },
    include: { salaryStructure: { include: { salaryComponent: true } } },
  });

  const payslips = [];

  for (const employee of employees) {
    const baseSalary = employee.baseSalary ?? 0;

    const attendanceDays = new Set(
      (
        await prisma.attendanceRecord.findMany({
          where: { employeeId: employee.id, checkIn: { gte: run.periodStart, lte: endOfDayUTC(run.periodEnd) } },
          select: { checkIn: true },
        })
      ).map((r) => dateKey(r.checkIn))
    );

    const approvedLeave = await prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: run.periodEnd },
        endDate: { gte: run.periodStart },
      },
      include: { leaveType: true },
    });

    function paidLeaveCovers(day: Date): boolean {
      return approvedLeave.some((l) => l.leaveType.isPaid && day >= l.startDate && day <= l.endDate);
    }

    let unpaidDays = 0;
    for (const day of workingDays) {
      if (attendanceDays.has(dateKey(day))) continue;
      if (paidLeaveCovers(day)) continue;
      unpaidDays += 1;
    }

    const dailyRate = workingDays.length > 0 ? baseSalary / workingDays.length : 0;
    const unpaidDeduction = Math.round(dailyRate * unpaidDays);

    let componentEarnings = 0;
    let componentDeductions = 0;
    const breakdownComponents: Array<{ name: string; type: SalaryComponentType; amount: number }> = [];

    for (const esc of employee.salaryStructure) {
      const amount =
        esc.salaryComponent.calculationType === "PERCENTAGE_OF_BASE"
          ? Math.round(((esc.percentage ?? 0) / 100) * baseSalary)
          : esc.fixedAmount ?? 0;

      breakdownComponents.push({ name: esc.salaryComponent.name, type: esc.salaryComponent.type, amount });
      if (esc.salaryComponent.type === SalaryComponentType.EARNING) componentEarnings += amount;
      else componentDeductions += amount;
    }

    // Advance installments that have come due by this pay period, for advances already through
    // final approval — deducted automatically, same as unpaid-absence days.
    const dueInstallments = await prisma.advanceInstallment.findMany({
      where: {
        isPaid: false,
        dueDate: { lte: endOfDayUTC(run.periodEnd) },
        advance: { employeeId: employee.id, status: AdvanceStatus.APPROVED },
      },
    });
    const advanceDeduction = dueInstallments.reduce((sum, i) => sum + i.amount, 0);

    const grossPay = baseSalary + componentEarnings;
    const totalDeductions = componentDeductions + unpaidDeduction + advanceDeduction;
    const netPay = grossPay - totalDeductions;

    const payslip = await prisma.$transaction(async (tx) => {
      const created = await tx.payslip.create({
        data: {
          payrollRunId: run.id,
          employeeId: employee.id,
          grossPay,
          totalDeductions,
          netPay,
          breakdown: {
            baseSalary,
            components: breakdownComponents,
            unpaidAbsence: { workingDays: workingDays.length, unpaidDays, dailyRate: Math.round(dailyRate), deduction: unpaidDeduction },
            advanceInstallments: dueInstallments.map((i) => ({ id: i.id, advanceId: i.advanceId, amount: i.amount })),
          },
        },
      });

      if (dueInstallments.length > 0) {
        await tx.advanceInstallment.updateMany({
          where: { id: { in: dueInstallments.map((i) => i.id) } },
          data: { isPaid: true, paidInPayrollRunId: run.id },
        });

        const advanceIds = [...new Set(dueInstallments.map((i) => i.advanceId))];
        for (const advanceId of advanceIds) {
          const remaining = await tx.advanceInstallment.count({ where: { advanceId, isPaid: false } });
          if (remaining === 0) {
            await tx.salaryAdvance.update({ where: { id: advanceId }, data: { status: AdvanceStatus.REPAID } });
          }
        }
      }

      return created;
    });
    payslips.push(payslip);

    if (employee.userId) {
      await notify(
        employee.userId,
        "payroll.payslip_ready",
        "Your payslip is ready",
        `Net pay: ${(netPay / 100).toFixed(2)}`
      );
    }
  }

  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: PayrollRunStatus.PROCESSED, runAt: new Date() } });

  await prisma.auditLog.create({
    data: {
      companyId,
      userId: actingUserId,
      action: "payroll.run",
      entityType: "PayrollRun",
      entityId: run.id,
      metadata: {
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        employeeCount: payslips.length,
        totalNetPay: payslips.reduce((sum, p) => sum + p.netPay, 0),
      },
    },
  });

  return payslips;
}

export async function markPayrollRunPaid(companyId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== PayrollRunStatus.PROCESSED) throw new Error("Only a processed payroll run can be marked paid");
  return prisma.payrollRun.update({ where: { id: run.id }, data: { status: PayrollRunStatus.PAID } });
}

export async function listMyPayslips(employeeId: string) {
  return prisma.payslip.findMany({
    where: { employeeId },
    include: { payrollRun: { select: { periodStart: true, periodEnd: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
}
