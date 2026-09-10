import { LeaveRequestStatus, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { findOwnEmployee, scopedEmployeeWhere } from "../employees/employee.scope";
import { deductBalance, getOrCreateBalance } from "./leaveBalance.service";

function inclusiveDayCount(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

export async function createLeaveRequest(
  user: AuthenticatedUser,
  input: { leaveTypeId: string; startDate: string; endDate: string; reason?: string }
) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const leaveType = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, companyId: user.companyId! } });
  if (!leaveType) throw new Error("Leave type not found");

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (endDate < startDate) throw new Error("End date must be on or after start date");

  const requestedDays = inclusiveDayCount(startDate, endDate);
  const year = startDate.getFullYear();
  const balance = await getOrCreateBalance(employee.id, leaveType.id, year);
  if (balance.balanceDays < requestedDays) {
    throw new Error(`Insufficient leave balance: ${balance.balanceDays} day(s) left, ${requestedDays} requested`);
  }

  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: [LeaveRequestStatus.PENDING_MANAGER, LeaveRequestStatus.PENDING_HR, LeaveRequestStatus.APPROVED] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) throw new Error("This overlaps an existing leave request");

  const initialStatus = employee.managerId ? LeaveRequestStatus.PENDING_MANAGER : LeaveRequestStatus.PENDING_HR;

  return prisma.leaveRequest.create({
    data: {
      companyId: user.companyId!,
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      startDate,
      endDate,
      reason: input.reason,
      status: initialStatus,
    },
  });
}

export async function listMyLeaveRequests(user: AuthenticatedUser) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  return prisma.leaveRequest.findMany({
    where: { employeeId: employee.id },
    include: { leaveType: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listLeaveRequests(user: AuthenticatedUser, filters: { status?: LeaveRequestStatus }) {
  const employeeScope = await scopedEmployeeWhere(user);

  return prisma.leaveRequest.findMany({
    where: {
      companyId: user.companyId!,
      employee: employeeScope,
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: { leaveType: true, employee: { select: { id: true, firstName: true, lastName: true, managerId: true } } },
    orderBy: { createdAt: "desc" },
  });
}

// Single decision endpoint: figures out from the request's current status whether this is the
// manager stage or the HR stage, and checks the caller is allowed to act on that specific stage.
export async function decide(
  user: AuthenticatedUser,
  requestId: string,
  decision: "APPROVE" | "REJECT",
  reason?: string
) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id: requestId, companyId: user.companyId! },
    include: { employee: true },
  });
  if (!request) throw new Error("Leave request not found");

  if (request.status === LeaveRequestStatus.PENDING_MANAGER) {
    const actingEmployee = await findOwnEmployee(user);
    const isAssignedManager = user.role === UserRole.MANAGER && actingEmployee?.id === request.employee.managerId;
    const isAdmin = user.role === UserRole.COMPANY_ADMIN;
    if (!isAssignedManager && !isAdmin) throw new Error("Only this employee's manager can act on this request");

    if (decision === "REJECT") {
      return prisma.leaveRequest.update({
        where: { id: request.id },
        data: { status: LeaveRequestStatus.REJECTED, rejectionReason: reason },
      });
    }
    return prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: LeaveRequestStatus.PENDING_HR, managerApprovedBy: user.id, managerApprovedAt: new Date() },
    });
  }

  if (request.status === LeaveRequestStatus.PENDING_HR) {
    if (user.role !== UserRole.HR && user.role !== UserRole.COMPANY_ADMIN) {
      throw new Error("Only HR or a Company Admin can give final approval");
    }

    if (decision === "REJECT") {
      return prisma.leaveRequest.update({
        where: { id: request.id },
        data: { status: LeaveRequestStatus.REJECTED, rejectionReason: reason },
      });
    }

    const year = request.startDate.getFullYear();
    const days = inclusiveDayCount(request.startDate, request.endDate);
    await deductBalance(request.employeeId, request.leaveTypeId, year, days);

    return prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: LeaveRequestStatus.APPROVED, hrApprovedBy: user.id, hrApprovedAt: new Date() },
    });
  }

  throw new Error("This request is not pending a decision");
}

export async function cancelLeaveRequest(user: AuthenticatedUser, requestId: string) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, employeeId: employee.id } });
  if (!request) throw new Error("Leave request not found");
  const pendingStatuses: LeaveRequestStatus[] = [LeaveRequestStatus.PENDING_MANAGER, LeaveRequestStatus.PENDING_HR];
  if (!pendingStatuses.includes(request.status)) {
    throw new Error("Only a pending request can be canceled");
  }

  return prisma.leaveRequest.update({ where: { id: request.id }, data: { status: LeaveRequestStatus.CANCELED } });
}
