import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { verifyAccessToken } from "../../lib/jwt";
import * as planService from "./plan.service";

export const planRouter = Router();

// Public: powers the marketing site's pricing section as well as the in-app plan picker, so it
// deliberately doesn't require auth. Only the active catalog is exposed to anonymous callers —
// a logged-in Super Admin sees inactive plans too (for the admin dashboard's plan management).
planRouter.get("/", async (req, res) => {
  const authHeader = req.headers.authorization;
  let role: UserRole | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      role = verifyAccessToken(authHeader.slice("Bearer ".length)).role as UserRole;
    } catch {
      // Invalid/expired token on a public endpoint just falls back to the public view.
    }
  }
  const plans = role === UserRole.SUPER_ADMIN ? await planService.listAllPlans() : await planService.listActivePlans();
  res.json(plans);
});

const createSchema = z.object({
  name: z.string().min(1),
  priceMonthly: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  maxEmployees: z.number().int().min(1),
  features: z.record(z.boolean()),
});

planRouter.post("/", requireAuth, requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
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

planRouter.patch("/:id", requireAuth, requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const plan = await planService.updatePlan(req.params.id, parsed.data);
    res.json(plan);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});
