import { AccountingSyncState, AdvanceInstallment, AdvanceStatus, EmploymentStatus, LeaveRequestStatus, PayrollRunStatus, Prisma, SalaryComponentType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { notify } from "../notification/notification.service";
import { enqueueRunState } from "../accounting/accountingSync.service";

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

type PayslipDraft = {
  employeeId: string;
  userId: string | null;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  breakdown: Prisma.InputJsonValue;
  installmentIds: string[];
  advanceIds: string[];
};

// Works out every payslip first (reads only), then writes them all in ONE transaction that also claims the
// run (DRAFT -> PROCESSED). So a failure half-way leaves nothing behind, and two requests at the same moment
// cannot both process the run: the second finds it already claimed and is refused.
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

  const drafts: PayslipDraft[] = [];

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

    // A working day with no check-in and no paid leave is unpaid. That includes the days before the hire date,
    // which is what pro-rates the first month of someone who joined mid-period.
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

    const grossPay = baseSalary + componentEarnings;

    // Advance installments that have come due by this pay period, for advances already through final approval,
    // oldest first. Pay never goes below zero: an installment is taken only while what is left of the pay can
    // cover it; one that does not fit stays unpaid and is taken in a later run.
    const dueInstallments: AdvanceInstallment[] = await prisma.advanceInstallment.findMany({
      where: {
        isPaid: false,
        dueDate: { lte: endOfDayUTC(run.periodEnd) },
        advance: { employeeId: employee.id, status: AdvanceStatus.APPROVED },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    let room = Math.max(0, grossPay - componentDeductions - unpaidDeduction);
    const taken: AdvanceInstallment[] = [];
    const postponed: AdvanceInstallment[] = [];
    for (const installment of dueInstallments) {
      if (installment.amount <= room) {
        taken.push(installment);
        room -= installment.amount;
      } else postponed.push(installment);
    }
    const advanceDeduction = taken.reduce((sum, i) => sum + i.amount, 0);

    // Fixed deductions and unpaid days can already exceed the pay: the payslip then shows zero net, with the rest as a shortfall.
    const rawDeductions = componentDeductions + unpaidDeduction + advanceDeduction;
    const netPay = Math.max(0, grossPay - rawDeductions);
    const totalDeductions = grossPay - netPay;

    drafts.push({
      employeeId: employee.id,
      userId: employee.userId,
      grossPay,
      totalDeductions,
      netPay,
      breakdown: {
        baseSalary,
        components: breakdownComponents,
        unpaidAbsence: { workingDays: workingDays.length, unpaidDays, dailyRate: Math.round(dailyRate), deduction: unpaidDeduction },
        advanceInstallments: taken.map((i) => ({ id: i.id, advanceId: i.advanceId, amount: i.amount })),
        postponedInstallments: postponed.map((i) => ({ id: i.id, advanceId: i.advanceId, amount: i.amount })),
        shortfall: Math.max(0, rawDeductions - grossPay),
      },
      installmentIds: taken.map((i) => i.id),
      advanceIds: [...new Set(taken.map((i) => i.advanceId))],
    });
  }

  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.payrollRun.updateMany({
        where: { id: run.id, companyId, status: PayrollRunStatus.DRAFT },
        data: { status: PayrollRunStatus.PROCESSED, runAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("Only a draft payroll run can be processed");

      for (const draft of drafts) {
        await tx.payslip.create({
          data: {
            payrollRunId: run.id,
            employeeId: draft.employeeId,
            grossPay: draft.grossPay,
            totalDeductions: draft.totalDeductions,
            netPay: draft.netPay,
            breakdown: draft.breakdown,
          },
        });

        if (draft.installmentIds.length > 0) {
          const marked = await tx.advanceInstallment.updateMany({
            where: { id: { in: draft.installmentIds }, isPaid: false },
            data: { isPaid: true, paidInPayrollRunId: run.id },
          });
          if (marked.count !== draft.installmentIds.length) throw new Error("An advance installment was already deducted by another payroll run");

          for (const advanceId of draft.advanceIds) {
            const remaining = await tx.advanceInstallment.count({ where: { advanceId, isPaid: false } });
            if (remaining === 0) await tx.salaryAdvance.update({ where: { id: advanceId }, data: { status: AdvanceStatus.REPAID } });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          companyId,
          userId: actingUserId,
          action: "payroll.run",
          entityType: "PayrollRun",
          entityId: run.id,
          metadata: {
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            employeeCount: drafts.length,
            totalNetPay: drafts.reduce((sum, d) => sum + d.netPay, 0),
          },
        },
      });
    },
    { timeout: 120000, maxWait: 30000 }
  );

  // Notifications go out only once everything is saved; a failed notification must not undo a finished run.
  for (const draft of drafts) {
    if (draft.userId) {
      await notify(draft.userId, "payroll.payslip_ready", "Your payslip is ready", `Net pay: ${(draft.netPay / 100).toFixed(2)}`).catch((err) => console.error("payslip notification failed", err));
    }
  }

  return prisma.payslip.findMany({ where: { payrollRunId: run.id } });
}

export async function markPayrollRunPaid(companyId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== PayrollRunStatus.PROCESSED) throw new Error("Only a processed payroll run can be marked paid");
  const paid = await prisma.payrollRun.update({ where: { id: run.id }, data: { status: PayrollRunStatus.PAID } });
  // a linked company's payroll cost is sent to its bookkeeping; a failure here never undoes the payment (the owner can send it again)
  await enqueueRunState(companyId, run.id, AccountingSyncState.PAID).catch((err) => console.error("could not queue the accounting sync", err));
  return paid;
}

/** Takes a payment back (PAID -> PROCESSED), e.g. when "paid" was pressed by mistake. The cost sent to accounting is withdrawn too. */
export async function revertPayrollRunPaid(companyId: string, runId: string, actingUserId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new Error("Payroll run not found");
  // taken only while it is still paid at this very moment, so two requests cannot both revert it
  const claimed = await prisma.payrollRun.updateMany({ where: { id: run.id, companyId, status: PayrollRunStatus.PAID }, data: { status: PayrollRunStatus.PROCESSED } });
  if (claimed.count !== 1) throw new Error("Only a paid payroll run can be reverted");
  await prisma.auditLog.create({ data: { companyId, userId: actingUserId, action: "payroll.revert_paid", entityType: "PayrollRun", entityId: run.id } });
  await enqueueRunState(companyId, run.id, AccountingSyncState.REVERTED).catch((err) => console.error("could not queue the accounting sync", err));
  return prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
}

export async function listMyPayslips(employeeId: string) {
  return prisma.payslip.findMany({
    where: { employeeId },
    include: { payrollRun: { select: { periodStart: true, periodEnd: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
}
