import { Router } from "express";
import { z } from "zod";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as adminService from "./admin.service";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(UserRole.SUPER_ADMIN));

adminRouter.get("/companies", async (_req, res) => {
  const companies = await adminService.listCompanies();
  res.json(companies);
});

adminRouter.get("/companies/:id", async (req, res) => {
  try {
    const company = await adminService.getCompanyDetail(req.params.id);
    res.json(company);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

const subscriptionUpdateSchema = z.object({
  planId: z.string().optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  trialEndsAt: z.string().nullable().optional(),
});

adminRouter.patch("/companies/:id/subscription", async (req, res) => {
  const parsed = subscriptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const subscription = await adminService.updateCompanySubscription(req.params.id, parsed.data);
    res.json(subscription);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const suspendSchema = z.object({ isSuspended: z.boolean() });

adminRouter.patch("/companies/:id/suspension", async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const company = await adminService.setCompanySuspended(req.params.id, parsed.data.isSuspended);
    res.json(company);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

adminRouter.get("/revenue", async (_req, res) => {
  const overview = await adminService.getRevenueOverview();
  res.json(overview);
});
