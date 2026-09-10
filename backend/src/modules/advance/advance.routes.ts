import { Router } from "express";
import { z } from "zod";
import { AdvanceStatus, UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as advanceService from "./advance.service";

export const advanceRouter = Router();

advanceRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

const createSchema = z.object({
  amount: z.number().int().positive(),
  installmentsCount: z.number().int().min(1).max(24),
  reason: z.string().optional(),
});

advanceRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const advance = await advanceService.createAdvanceRequest(req.user!, parsed.data);
    res.status(201).json(advance);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

advanceRouter.get("/me", async (req, res) => {
  try {
    const advances = await advanceService.listMyAdvances(req.user!);
    res.json(advances);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const listQuerySchema = z.object({ status: z.nativeEnum(AdvanceStatus).optional() });

advanceRouter.get("/", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const advances = await advanceService.listAdvances(req.user!, parsed.data);
  res.json(advances);
});

const decisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });

advanceRouter.post(
  "/:id/decide",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER),
  async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const advance = await advanceService.decide(req.user!, req.params.id, parsed.data.decision);
      res.json(advance);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);
