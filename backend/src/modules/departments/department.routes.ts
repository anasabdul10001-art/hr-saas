import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as departmentService from "./department.service";

export const departmentRouter = Router();

departmentRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

departmentRouter.get("/", async (req, res) => {
  const departments = await departmentService.listDepartments(req.user!.companyId!);
  res.json(departments);
});

const createSchema = z.object({ name: z.string().min(1), managerId: z.string().optional() });

departmentRouter.post("/", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const department = await departmentService.createDepartment(req.user!.companyId!, parsed.data);
    res.status(201).json(department);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const updateSchema = z.object({ name: z.string().min(1).optional(), managerId: z.string().nullable().optional() });

departmentRouter.patch("/:id", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const department = await departmentService.updateDepartment(req.user!.companyId!, req.params.id, parsed.data);
    res.json(department);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

departmentRouter.delete("/:id", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  try {
    await departmentService.deleteDepartment(req.user!.companyId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
