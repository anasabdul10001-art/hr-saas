import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as reportsService from "./reports.service";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

const attendanceQuerySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

reportsRouter.get(
  "/attendance.csv",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER),
  async (req, res) => {
    const parsed = attendanceQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const csv = await reportsService.generateAttendanceCsv(req.user!, parsed.data);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="attendance.csv"`);
    res.send(csv);
  }
);

reportsRouter.get(
  "/payroll/:runId.csv",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR),
  async (req, res) => {
    try {
      const csv = await reportsService.generatePayrollCsv(req.user!.companyId!, req.params.runId);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="payroll-${req.params.runId}.csv"`);
      res.send(csv);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  }
);
