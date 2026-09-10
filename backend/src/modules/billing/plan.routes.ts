import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as planService from "./plan.service";

export const planRouter = Router();

planRouter.use(requireAuth);

// Any authenticated user (e.g. a Company Admin picking a plan) can see the active catalog.
planRouter.get("/", async (req, res) => {
  const plans = req.user!.role === UserRole.SUPER_ADMIN ? await planService.listAllPlans() : await planService.listActivePlans();
  res.json(plans);
});

const createSchema = z.object({
  name: z.string().min(1),
  priceMonthly: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  maxEmployees: z.number().int().min(1),
  features: z.record(z.boolean()),
});

planRouter.post("/", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const plan = await planService.createPlan(parsed.data);
  res.status(201).json(plan);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  priceMonthly: z.number().int().min(0).optional(),
  maxEmployees: z.number().int().min(1).optional(),
  features: z.record(z.boolean()).optional(),
  isActive: z.boolean().optional(),
});

planRouter.patch("/:id", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const plan = await planService.updatePlan(req.params.id, parsed.data);
    res.json(plan);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
