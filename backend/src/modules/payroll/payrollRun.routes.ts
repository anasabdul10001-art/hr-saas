import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as payrollRunService from "./payrollRun.service";
import { findOwnEmployee } from "../employees/employee.scope";

export const payrollRunRouter = Router();

payrollRunRouter.use(requireAuth, requireCompanyContext);

payrollRunRouter.get("/payslips/me", async (req, res) => {
  const employee = await findOwnEmployee(req.user!);
  if (!employee) return res.status(404).json({ error: "No employee record linked to this account" });

  const payslips = await payrollRunService.listMyPayslips(employee.id);
  res.json(payslips);
});

payrollRunRouter.use(requireRole(UserRole.COMPANY_ADMIN, UserRole.HR));

payrollRunRouter.get("/", async (req, res) => {
  const runs = await payrollRunService.listPayrollRuns(req.user!.companyId!);
  res.json(runs);
});

const createSchema = z.object({ periodStart: z.string(), periodEnd: z.string() });

payrollRunRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const run = await payrollRunService.createPayrollRun(req.user!.companyId!, parsed.data);
    res.status(201).json(run);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

payrollRunRouter.get("/:id", async (req, res) => {
  try {
    const run = await payrollRunService.getPayrollRun(req.user!.companyId!, req.params.id);
    res.json(run);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

payrollRunRouter.post("/:id/process", async (req, res) => {
  try {
    const payslips = await payrollRunService.processPayrollRun(req.user!.companyId!, req.params.id);
    res.json(payslips);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

payrollRunRouter.post("/:id/mark-paid", async (req, res) => {
  try {
    const run = await payrollRunService.markPayrollRunPaid(req.user!.companyId!, req.params.id);
    res.json(run);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
