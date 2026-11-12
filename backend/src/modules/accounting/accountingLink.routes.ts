import { Router, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import * as sync from "./accountingSync.service";

export const accountingLinkRouter = Router();
accountingLinkRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

// the link code is a secret: guessing it is slowed down (tests raise the limit through the environment)
const codeLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.ACCOUNTING_LINK_RATE_LIMIT) || 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts, please try again later" } });

function fail(res: Response, err: unknown) {
  if (err instanceof sync.LinkError) return res.status(err.status).json({ error: err.message });
  throw err; // anything else is a bug or a database failure: the global handler logs it and answers a plain 500
}

const audit = (req: { user?: { id: string; companyId: string | null } }, action: string, metadata?: object) =>
  prisma.auditLog.create({ data: { companyId: req.user!.companyId, userId: req.user!.id, action, entityType: "AccountingLink", entityId: req.user!.companyId!, metadata } });

const viewers = requireRole(UserRole.COMPANY_ADMIN, UserRole.HR);

accountingLinkRouter.get("/", viewers, async (req, res) => {
  res.json(await sync.linkStatus(req.user!.companyId!));
});

// the state of every run's delivery, so the payroll page can show it next to the run
accountingLinkRouter.get("/sync", viewers, async (req, res) => {
  res.json(await sync.listSyncJobs(req.user!.companyId!));
});

accountingLinkRouter.post("/runs/:runId/retry", viewers, async (req, res) => {
  try {
    await sync.retryJob(req.user!.companyId!, req.params.runId);
    res.json({ queued: true });
  } catch (err) {
    fail(res, err);
  }
});

// linking, cancelling and sending past runs change the owner's books: the company admin only
accountingLinkRouter.post("/connect", requireRole(UserRole.COMPANY_ADMIN), codeLimit, async (req, res) => {
  const parsed = z.object({ code: z.string().trim().min(20).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: req.user!.companyId! }, select: { name: true } });
    await sync.connectLink(req.user!.companyId!, company.name, parsed.data.code);
    await audit(req, "accounting_link.connect");
    res.status(201).json(await sync.linkStatus(req.user!.companyId!));
  } catch (err) {
    fail(res, err);
  }
});

accountingLinkRouter.delete("/", requireRole(UserRole.COMPANY_ADMIN), async (req, res) => {
  try {
    const result = await sync.disconnectLink(req.user!.companyId!);
    await audit(req, "accounting_link.disconnect", result);
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

accountingLinkRouter.post("/backfill", requireRole(UserRole.COMPANY_ADMIN), async (req, res) => {
  try {
    const queued = await sync.backfillPaidRuns(req.user!.companyId!);
    await audit(req, "accounting_link.backfill", { queued });
    res.json({ queued });
  } catch (err) {
    fail(res, err);
  }
});
