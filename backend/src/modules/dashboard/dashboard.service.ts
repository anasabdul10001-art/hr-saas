import { AdvanceStatus, EmploymentStatus, LeaveRequestStatus, PayrollRunStatus, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { findOwnEmployee, scopedEmployeeWhere } from "../employees/employee.scope";
import { listBalancesForEmployee } from "../leave/leaveBalance.service";

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function endOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

const PENDING_LEAVE: LeaveRequestStatus[] = [LeaveRequestStatus.PENDING_MANAGER, LeaveRequestStatus.PENDING_HR];
const PENDING_ADVANCE: AdvanceStatus[] = [AdvanceStatus.PENDING_MANAGER, AdvanceStatus.PENDING_HR];

async function companyDashboard(companyId: string) {
  const todayStart = startOfTodayUTC();
  const todayEnd = endOfTodayUTC();

  const [totalEmployees, presentToday, onLeaveToday, pendingLeave, pendingAdvances, lastRun] = await Promise.all([
    prisma.employee.count({ where: { companyId, employmentStatus: EmploymentStatus.ACTIVE } }),
    prisma.attendanceRecord
      .findMany({ where: { companyId, checkIn: { gte: todayStart, lte: todayEnd } }, select: { employeeId: true }, distinct: ["employeeId"] })
      .then((r) => r.length),
    prisma.leaveRequest
      .findMany({
        where: { companyId, status: LeaveRequestStatus.APPROVED, startDate: { lte: todayEnd }, endDate: { gte: todayStart } },
        select: { employeeId: true },
        distinct: ["employeeId"],
      })
      .then((r) => r.length),
    prisma.leaveRequest.count({ where: { companyId, status: { in: PENDING_LEAVE } } }),
    prisma.salaryAdvance.count({ where: { companyId, status: { in: PENDING_ADVANCE } } }),
    prisma.payrollRun.findFirst({
      where: { companyId, status: { in: [PayrollRunStatus.PROCESSED, PayrollRunStatus.PAID] } },
      orderBy: { periodEnd: "desc" },
      include: { payslips: true },
    }),
  ]);

  return {
    role: "company" as const,
    totalEmployees,
    presentToday,
    onLeaveToday,
    pendingLeaveApprovals: pendingLeave,
    pendingAdvanceApprovals: pendingAdvances,
    lastPayrollRun: lastRun
      ? {
          periodStart: lastRun.periodStart,
          periodEnd: lastRun.periodEnd,
          status: lastRun.status,
          totalNetPay: lastRun.payslips.reduce((sum, p) => sum + p.netPay, 0),
        }
      : null,
  };
}

async function managerDashboard(user: AuthenticatedUser) {
  const scope = await scopedEmployeeWhere(user);
  const todayStart = startOfTodayUTC();
  const todayEnd = endOfTodayUTC();

  const [teamSize, presentToday, onLeaveToday, pendingLeave, pendingAdvances] = await Promise.all([
    prisma.employee.count({ where: scope }),
    prisma.attendanceRecord
      .findMany({ where: { checkIn: { gte: todayStart, lte: todayEnd }, employee: scope }, select: { employeeId: true }, distinct: ["employeeId"] })
      .then((r) => r.length),
    prisma.leaveRequest
      .findMany({
        where: { status: LeaveRequestStatus.APPROVED, startDate: { lte: todayEnd }, endDate: { gte: todayStart }, employee: scope },
        select: { employeeId: true },
        distinct: ["employeeId"],
      })
      .then((r) => r.length),
    prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING_MANAGER, employee: scope } }),
    prisma.salaryAdvance.count({ where: { status: AdvanceStatus.PENDING_MANAGER, employee: scope } }),
  ]);

  return {
    role: "manager" as const,
    teamSize,
    presentToday,
    onLeaveToday,
    pendingLeaveApprovals: pendingLeave,
    pendingAdvanceApprovals: pendingAdvances,
  };
}

async function employeeDashboard(user: AuthenticatedUser) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [attendanceDaysThisMonth, balances, pendingLeave, pendingAdvances, lastPayslip] = await Promise.all([
    prisma.attendanceRecord
      .findMany({ where: { employeeId: employee.id, checkIn: { gte: monthStart } }, select: { checkIn: true } })
      .then((records) => new Set(records.map((r) => r.checkIn.toISOString().slice(0, 10))).size),
    listBalancesForEmployee(user.companyId!, employee.id, new Date().getFullYear()),
    prisma.leaveRequest.count({ where: { employeeId: employee.id, status: { in: PENDING_LEAVE } } }),
    prisma.salaryAdvance.count({ where: { employeeId: employee.id, status: { in: PENDING_ADVANCE } } }),
    prisma.payslip.findFirst({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" }, include: { payrollRun: true } }),
  ]);

  return {
    role: "employee" as const,
    attendanceDaysThisMonth,
    leaveBalances: balances.map((b) => ({ leaveType: b.leaveType.name, balanceDays: b.balanceDays })),
    myPendingRequests: pendingLeave + pendingAdvances,
    lastPayslip: lastPayslip
      ? { periodStart: lastPayslip.payrollRun.periodStart, periodEnd: lastPayslip.payrollRun.periodEnd, netPay: lastPayslip.netPay }
      : null,
  };
}

export async function getDashboard(user: AuthenticatedUser) {
  if (user.role === UserRole.COMPANY_ADMIN || user.role === UserRole.HR) return companyDashboard(user.companyId!);
  if (user.role === UserRole.MANAGER) return managerDashboard(user);
  return employeeDashboard(user);
}
