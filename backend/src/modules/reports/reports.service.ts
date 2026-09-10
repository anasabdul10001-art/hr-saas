import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { scopedEmployeeWhere } from "../employees/employee.scope";
import { toCsv } from "./csv";

export async function generateAttendanceCsv(
  user: AuthenticatedUser,
  filters: { from?: string; to?: string }
): Promise<string> {
  const scope = await scopedEmployeeWhere(user);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      companyId: user.companyId!,
      employee: scope,
      checkIn: {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      },
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { checkIn: "desc" },
  });

  return toCsv(
    ["Employee", "Check-in", "Check-out", "Source", "Notes"],
    records.map((r) => [
      `${r.employee.firstName} ${r.employee.lastName}`,
      r.checkIn.toISOString(),
      r.checkOut ? r.checkOut.toISOString() : "",
      r.source,
      r.notes ?? "",
    ])
  );
}

export async function generatePayrollCsv(companyId: string, payrollRunId: string): Promise<string> {
  const run = await prisma.payrollRun.findFirst({
    where: { id: payrollRunId, companyId },
    include: { payslips: { include: { employee: { select: { firstName: true, lastName: true } } } } },
  });
  if (!run) throw new Error("Payroll run not found");

  return toCsv(
    ["Employee", "Gross Pay", "Total Deductions", "Net Pay"],
    run.payslips.map((p) => [
      `${p.employee.firstName} ${p.employee.lastName}`,
      (p.grossPay / 100).toFixed(2),
      (p.totalDeductions / 100).toFixed(2),
      (p.netPay / 100).toFixed(2),
    ])
  );
}
