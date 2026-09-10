import { Router } from "express";
import { z } from "zod";
import { SalaryCalculationType, SalaryComponentType, UserRole } from "@prisma/client";
import { requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as salaryComponentService from "./salaryComponent.service";

export const salaryComponentRouter = Router();

salaryComponentRouter.use(requireAuth, requireCompanyContext, requireRole(UserRole.COMPANY_ADMIN, UserRole.HR));

salaryComponentRouter.get("/", async (req, res) => {
  const components = await salaryComponentService.listSalaryComponents(req.user!.companyId!);
  res.json(components);
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(SalaryComponentType),
  calculationType: z.nativeEnum(SalaryCalculationType).optional(),
});

salaryComponentRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const component = await salaryComponentService.createSalaryComponent(req.user!.companyId!, parsed.data);
  res.status(201).json(component);
});
