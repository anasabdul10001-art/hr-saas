import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as employeeSalaryService from "./employeeSalary.service";

export const employeeSalaryRouter = Router();

employeeSalaryRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

employeeSalaryRouter.get("/:employeeId", async (req, res) => {
  try {
    const structure = await employeeSalaryService.getSalaryStructure(req.user!, req.params.employeeId);
    res.json(structure);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

const baseSalarySchema = z.object({ baseSalary: z.number().int().min(0) });

employeeSalaryRouter.put(
  "/:employeeId/base-salary",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR),
  async (req, res) => {
    const parsed = baseSalarySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const employee = await employeeSalaryService.setBaseSalary(req.user!.companyId!, req.params.employeeId, parsed.data.baseSalary);
      res.json(employee);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

const componentSchema = z.object({
  salaryComponentId: z.string(),
  fixedAmount: z.number().int().optional(),
  percentage: z.number().optional(),
});

employeeSalaryRouter.put(
  "/:employeeId/components",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR),
  async (req, res) => {
    const parsed = componentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const component = await employeeSalaryService.upsertComponent(req.user!.companyId!, {
        employeeId: req.params.employeeId,
        ...parsed.data,
      });
      res.json(component);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

employeeSalaryRouter.delete(
  "/:employeeId/components/:salaryComponentId",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR),
  async (req, res) => {
    try {
      await employeeSalaryService.removeComponent(req.user!.companyId!, req.params.employeeId, req.params.salaryComponentId);
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);
