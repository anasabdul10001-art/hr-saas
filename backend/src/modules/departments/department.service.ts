import { prisma } from "../../lib/prisma";

export async function listDepartments(companyId: string) {
  return prisma.department.findMany({
    where: { companyId },
    include: { manager: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createDepartment(companyId: string, input: { name: string; managerId?: string }) {
  if (input.managerId) await assertManagerBelongsToCompany(companyId, input.managerId);
  return prisma.department.create({ data: { companyId, name: input.name, managerId: input.managerId } });
}

export async function updateDepartment(companyId: string, id: string, input: { name?: string; managerId?: string | null }) {
  await assertDepartmentBelongsToCompany(companyId, id);
  if (input.managerId) await assertManagerBelongsToCompany(companyId, input.managerId);
  return prisma.department.update({ where: { id }, data: input });
}

export async function deleteDepartment(companyId: string, id: string) {
  await assertDepartmentBelongsToCompany(companyId, id);
  const employeeCount = await prisma.employee.count({ where: { departmentId: id } });
  if (employeeCount > 0) throw new Error("Cannot delete a department that still has employees assigned");
  await prisma.department.delete({ where: { id } });
}

async function assertDepartmentBelongsToCompany(companyId: string, id: string) {
  const department = await prisma.department.findFirst({ where: { id, companyId } });
  if (!department) throw new Error("Department not found");
  return department;
}

async function assertManagerBelongsToCompany(companyId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new Error("Manager must be an employee of this company");
}
