import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as leaveTypeService from "./leaveType.service";

export const leaveTypeRouter = Router();

leaveTypeRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

leaveTypeRouter.get("/", async (req, res) => {
  const leaveTypes = await leaveTypeService.listLeaveTypes(req.user!.companyId!);
  res.json(leaveTypes);
});

const createSchema = z.object({
  name: z.string().min(1),
  defaultBalance: z.number().int().min(0),
  isPaid: z.boolean().optional(),
});

leaveTypeRouter.post("/", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const leaveType = await leaveTypeService.createLeaveType(req.user!.companyId!, parsed.data);
  res.status(201).json(leaveType);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  defaultBalance: z.number().int().min(0).optional(),
  isPaid: z.boolean().optional(),
});

leaveTypeRouter.patch("/:id", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const leaveType = await leaveTypeService.updateLeaveType(req.user!.companyId!, req.params.id, parsed.data);
    res.json(leaveType);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
