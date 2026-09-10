import { SalaryCalculationType, SalaryComponentType } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function listSalaryComponents(companyId: string) {
  return prisma.salaryComponent.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function createSalaryComponent(
  companyId: string,
  input: { name: string; type: SalaryComponentType; calculationType?: SalaryCalculationType }
) {
  return prisma.salaryComponent.create({
    data: { companyId, name: input.name, type: input.type, calculationType: input.calculationType ?? SalaryCalculationType.FIXED },
  });
}
