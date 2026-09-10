import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { scopedEmployeeWhere } from "./employee.scope";

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, url-safe
}

export type CreateEmployeeInput = {
  firstName: string;
  lastName: string;
  departmentId?: string;
  managerId?: string;
  position?: string;
  hireDate: string;
  invite?: { email: string; role: typeof UserRole.HR | typeof UserRole.MANAGER | typeof UserRole.EMPLOYEE };
};

export async function createEmployee(companyId: string, input: CreateEmployeeInput) {
  if (input.departmentId) await assertBelongsToCompany("department", companyId, input.departmentId);
  if (input.managerId) await assertBelongsToCompany("employee", companyId, input.managerId);
  await assertUnderEmployeeLimit(companyId);

  return prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    let tempPassword: string | undefined;

    if (input.invite) {
      const existing = await tx.user.findUnique({ where: { email: input.invite.email } });
      if (existing) throw new Error("Email already in use");

      tempPassword = generateTempPassword();
      const user = await tx.user.create({
        data: {
          companyId,
          email: input.invite.email,
          passwordHash: await bcrypt.hash(tempPassword, 12),
          role: input.invite.role,
        },
      });
      userId = user.id;
    }

    const employee = await tx.employee.create({
      data: {
        companyId,
        userId,
        firstName: input.firstName,
        lastName: input.lastName,
        departmentId: input.departmentId,
        managerId: input.managerId,
        position: input.position,
        hireDate: new Date(input.hireDate),
      },
    });

    return { employee, tempPassword };
  });
}

export async function listEmployees(
  user: AuthenticatedUser,
  filters: { departmentId?: string; status?: "ACTIVE" | "ON_LEAVE" | "TERMINATED" }
) {
  const where = await scopedEmployeeWhere(user);
  return prisma.employee.findMany({
    where: {
      ...where,
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.status ? { employmentStatus: filters.status } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { email: true, role: true, isActive: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
}

export async function getEmployee(user: AuthenticatedUser, employeeId: string) {
  const where = await scopedEmployeeWhere(user);
  // AND (not spread): `where` may itself contain an `id` key (EMPLOYEE/MANAGER self-scoping),
  // and `{ ...where, id: employeeId }` would silently let the requested id clobber that
  // restriction and leak out-of-scope records.
  const employee = await prisma.employee.findFirst({
    where: { AND: [where, { id: employeeId }] },
    include: {
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
      directReports: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { email: true, role: true, isActive: true } },
    },
  });
  if (!employee) throw new Error("Employee not found");
  return employee;
}

export async function updateEmployee(
  companyId: string,
  employeeId: string,
  input: Partial<{
    firstName: string;
    lastName: string;
    departmentId: string | null;
    managerId: string | null;
    position: string | null;
    employmentStatus: "ACTIVE" | "ON_LEAVE" | "TERMINATED";
  }>,
  actingUserId: string
) {
  const existing = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!existing) throw new Error("employee not found in this company");
  if (input.departmentId) await assertBelongsToCompany("department", companyId, input.departmentId);
  if (input.managerId) {
    if (input.managerId === employeeId) throw new Error("An employee cannot be their own manager");
    await assertBelongsToCompany("employee", companyId, input.managerId);
  }

  const updated = await prisma.employee.update({ where: { id: employeeId }, data: input });

  if (input.employmentStatus && input.employmentStatus !== existing.employmentStatus) {
    await prisma.auditLog.create({
      data: {
        companyId,
        userId: actingUserId,
        action: "employee.status_change",
        entityType: "Employee",
        entityId: employeeId,
        metadata: { from: existing.employmentStatus, to: input.employmentStatus },
      },
    });
  }

  return updated;
}

async function assertBelongsToCompany(kind: "employee" | "department", companyId: string, id: string) {
  const record =
    kind === "employee"
      ? await prisma.employee.findFirst({ where: { id, companyId } })
      : await prisma.department.findFirst({ where: { id, companyId } });
  if (!record) throw new Error(`${kind} not found in this company`);
}

async function assertUnderEmployeeLimit(companyId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { companyId }, include: { plan: true } });
  if (!subscription) return; // no subscription record (e.g. seed hasn't run) — don't block on it

  const currentCount = await prisma.employee.count({ where: { companyId } });
  if (currentCount >= subscription.plan.maxEmployees) {
    throw new Error(
      `Employee limit reached for the ${subscription.plan.name} plan (${subscription.plan.maxEmployees}). Upgrade to add more employees.`
    );
  }
}
