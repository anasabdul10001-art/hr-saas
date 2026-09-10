import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as attendanceService from "./attendance.service";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

attendanceRouter.post("/check-in", async (req, res) => {
  try {
    const record = await attendanceService.checkIn(req.user!);
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

attendanceRouter.post("/check-out", async (req, res) => {
  try {
    const record = await attendanceService.checkOut(req.user!);
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const rangeQuerySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

attendanceRouter.get("/me", async (req, res) => {
  const parsed = rangeQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const records = await attendanceService.listMyAttendance(req.user!, parsed.data);
    res.json(records);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const listQuerySchema = rangeQuerySchema.extend({ employeeId: z.string().optional() });

attendanceRouter.get(
  "/",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER),
  async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const records = await attendanceService.listAttendance(req.user!, parsed.data);
    res.json(records);
  }
);

const manualCreateSchema = z.object({
  employeeId: z.string(),
  checkIn: z.string(),
  checkOut: z.string().optional(),
  notes: z.string().optional(),
});

attendanceRouter.post("/manual", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = manualCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const record = await attendanceService.createManualRecord(req.user!.companyId!, req.user!, parsed.data);
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const updateSchema = z.object({
  checkIn: z.string().optional(),
  checkOut: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

attendanceRouter.patch("/:id", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const record = await attendanceService.updateAttendanceRecord(req.user!.companyId!, req.user!, req.params.id, parsed.data);
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
