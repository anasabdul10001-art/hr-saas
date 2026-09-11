import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as settingsService from "./settings.service";

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole(UserRole.SUPER_ADMIN));

settingsRouter.get("/", async (_req, res) => {
  const settings = await settingsService.getSettings();
  res.json(settings);
});

const updateSchema = z.object({
  stripeSecretKey: z.string().min(1).optional(),
  stripeWebhookSecret: z.string().min(1).optional(),
});

settingsRouter.patch("/", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const settings = await settingsService.updateSettings(parsed.data);
  res.json(settings);
});
