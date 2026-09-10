import { Router } from "express";
import { z } from "zod";
import { LeaveRequestStatus, UserRole } from "@prisma/client";
import { requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as leaveRequestService from "./leaveRequest.service";

export const leaveRequestRouter = Router();

leaveRequestRouter.use(requireAuth, requireCompanyContext);

const createSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

leaveRequestRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const request = await leaveRequestService.createLeaveRequest(req.user!, parsed.data);
    res.status(201).json(request);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

leaveRequestRouter.get("/me", async (req, res) => {
  try {
    const requests = await leaveRequestService.listMyLeaveRequests(req.user!);
    res.json(requests);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const listQuerySchema = z.object({ status: z.nativeEnum(LeaveRequestStatus).optional() });

leaveRequestRouter.get(
  "/",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER),
  async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const requests = await leaveRequestService.listLeaveRequests(req.user!, parsed.data);
    res.json(requests);
  }
);

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().optional(),
});

leaveRequestRouter.post(
  "/:id/decide",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER),
  async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const request = await leaveRequestService.decide(req.user!, req.params.id, parsed.data.decision, parsed.data.reason);
      res.json(request);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

leaveRequestRouter.post("/:id/cancel", async (req, res) => {
  try {
    const request = await leaveRequestService.cancelLeaveRequest(req.user!, req.params.id);
    res.json(request);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
