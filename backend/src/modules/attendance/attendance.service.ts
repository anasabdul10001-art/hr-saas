import { AttendanceSource, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { findOwnEmployee, scopedEmployeeWhere } from "../employees/employee.scope";

function dateRangeFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(from);
  if (to) filter.lte = new Date(to);
  return filter;
}

export async function checkIn(user: AuthenticatedUser) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const openRecord = await prisma.attendanceRecord.findFirst({
    where: { employeeId: employee.id, checkOut: null },
  });
  if (openRecord) throw new Error("Already checked in — check out first");

  return prisma.attendanceRecord.create({
    data: { companyId: employee.companyId, employeeId: employee.id, checkIn: new Date(), source: AttendanceSource.WEB },
  });
}

export async function checkOut(user: AuthenticatedUser) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  const openRecord = await prisma.attendanceRecord.findFirst({
    where: { employeeId: employee.id, checkOut: null },
    orderBy: { checkIn: "desc" },
  });
  if (!openRecord) throw new Error("No active check-in found");

  return prisma.attendanceRecord.update({ where: { id: openRecord.id }, data: { checkOut: new Date() } });
}

export async function listMyAttendance(user: AuthenticatedUser, filters: { from?: string; to?: string }) {
  const employee = await findOwnEmployee(user);
  if (!employee) throw new Error("No employee record linked to this account");

  return prisma.attendanceRecord.findMany({
    where: { employeeId: employee.id, checkIn: dateRangeFilter(filters.from, filters.to) },
    orderBy: { checkIn: "desc" },
  });
}

export async function listAttendance(
  user: AuthenticatedUser,
  filters: { employeeId?: string; from?: string; to?: string }
) {
  const employeeScope = await scopedEmployeeWhere(user);

  return prisma.attendanceRecord.findMany({
    where: {
      companyId: user.companyId!,
      // AND (not spread): employeeScope may itself carry an `id` key for self-scoped roles,
      // and spreading it alongside a requested employeeId would let the latter silently win —
      // see the same fix in employee.service.ts's getEmployee.
      employee: filters.employeeId ? { AND: [employeeScope, { id: filters.employeeId }] } : employeeScope,
      checkIn: dateRangeFilter(filters.from, filters.to),
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { checkIn: "desc" },
  });
}

export async function createManualRecord(
  companyId: string,
  actingUser: AuthenticatedUser,
  input: { employeeId: string; checkIn: string; checkOut?: string; notes?: string }
) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
  if (!employee) throw new Error("Employee not found in this company");

  const record = await prisma.attendanceRecord.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      checkIn: new Date(input.checkIn),
      checkOut: input.checkOut ? new Date(input.checkOut) : undefined,
      source: AttendanceSource.MANUAL,
      editedById: actingUser.id,
      notes: input.notes,
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId,
      userId: actingUser.id,
      action: "attendance.manual_create",
      entityType: "AttendanceRecord",
      entityId: record.id,
      metadata: { employeeId: input.employeeId, checkIn: input.checkIn, checkOut: input.checkOut ?? null },
    },
  });

  return record;
}

export async function updateAttendanceRecord(
  companyId: string,
  actingUser: AuthenticatedUser,
  recordId: string,
  input: { checkIn?: string; checkOut?: string | null; notes?: string | null }
) {
  const existing = await prisma.attendanceRecord.findFirst({ where: { id: recordId, companyId } });
  if (!existing) throw new Error("Attendance record not found");

  const record = await prisma.attendanceRecord.update({
    where: { id: recordId },
    data: {
      checkIn: input.checkIn ? new Date(input.checkIn) : undefined,
      checkOut: input.checkOut === undefined ? undefined : input.checkOut ? new Date(input.checkOut) : null,
      notes: input.notes === undefined ? undefined : input.notes,
      editedById: actingUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId,
      userId: actingUser.id,
      action: "attendance.manual_edit",
      entityType: "AttendanceRecord",
      entityId: record.id,
      metadata: { before: existing, changes: input },
    },
  });

  return record;
}
