import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";

// Resolves the Employee record linked to a logged-in user (Managers/Employees always have one;
// Company Admin/HR may or may not).
export async function findOwnEmployee(user: AuthenticatedUser) {
  return prisma.employee.findUnique({ where: { userId: user.id } });
}

// Builds the Prisma `where` clause that scopes an employee-list/detail query to what this
// user's role is allowed to see. This is the single place tenant + role visibility rules live,
// so every employee-reading endpoint must go through it rather than filtering ad hoc.
export async function scopedEmployeeWhere(user: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
  const companyId = user.companyId!;

  if (user.role === UserRole.COMPANY_ADMIN || user.role === UserRole.HR) {
    return { companyId };
  }

  const self = await findOwnEmployee(user);
  if (!self) return { companyId, id: "__none__" }; // no linked employee record => sees nobody

  if (user.role === UserRole.MANAGER) {
    return {
      companyId,
      OR: [{ id: self.id }, { managerId: self.id }, { department: { managerId: self.id } }],
    };
  }

  // EMPLOYEE: self only
  return { companyId, id: self.id };
}
