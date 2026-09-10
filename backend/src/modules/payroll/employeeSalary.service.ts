import { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AuthenticatedUser } from "../../middleware/auth";
import { findOwnEmployee } from "../employees/employee.scope";

// Salary/compensation data is more sensitive than general HR profile data, so it does not use
// the general scopedEmployeeWhere() visibility rule (which lets a Manager see their team) —
// only Company Admin, HR, or the employee viewing their own record may see it.
async function assertCanViewSalary(user: AuthenticatedUser, employeeId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId! } });
  if (!employee) throw new Error("Employee not found");

  if (user.role === UserRole.COMPANY_ADMIN || user.role === UserRole.HR) return employee;

  const self = await findOwnEmployee(user);
  if (self?.id === employee.id) return employee;

  throw new Error("Employee not found");
}

export async function getSalaryStructure(user: AuthenticatedUser, employeeId: string) {
  const employee = await assertCanViewSalary(user, employeeId);
  const components = await prisma.employeeSalaryComponent.findMany({
    where: { employeeId },
    include: { salaryComponent: true },
  });
  return { baseSalary: employee.baseSalary, components };
}

export async function setBaseSalary(companyId: string, employeeId: string, baseSalary: number) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new Error("Employee not found in this company");
  return prisma.employee.update({ where: { id: employeeId }, data: { baseSalary } });
}

export async function upsertComponent(
  companyId: string,
  input: { employeeId: string; salaryComponentId: string; fixedAmount?: number; percentage?: number }
) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } });
  if (!employee) throw new Error("Employee not found in this company");
  const component = await prisma.salaryComponent.findFirst({ where: { id: input.salaryComponentId, companyId } });
  if (!component) throw new Error("Salary component not found in this company");

  if (component.calculationType === "FIXED" && input.fixedAmount === undefined) {
    throw new Error("fixedAmount is required for a FIXED component");
  }
  if (component.calculationType === "PERCENTAGE_OF_BASE" && input.percentage === undefined) {
    throw new Error("percentage is required for a PERCENTAGE_OF_BASE component");
  }

  return prisma.employeeSalaryComponent.upsert({
    where: { employeeId_salaryComponentId: { employeeId: input.employeeId, salaryComponentId: input.salaryComponentId } },
    create: {
      employeeId: input.employeeId,
      salaryComponentId: input.salaryComponentId,
      fixedAmount: input.fixedAmount,
      percentage: input.percentage,
    },
    update: { fixedAmount: input.fixedAmount, percentage: input.percentage },
  });
}

export async function removeComponent(companyId: string, employeeId: string, salaryComponentId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new Error("Employee not found in this company");
  await prisma.employeeSalaryComponent.deleteMany({ where: { employeeId, salaryComponentId } });
}
