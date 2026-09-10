import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as leaveBalanceService from "./leaveBalance.service";
import { findOwnEmployee, scopedEmployeeWhere } from "../employees/employee.scope";
import { prisma } from "../../lib/prisma";

export const leaveBalanceRouter = Router();

leaveBalanceRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

const yearQuerySchema = z.object({ year: z.coerce.number().int().optional() });

leaveBalanceRouter.get("/me", async (req, res) => {
  const parsed = yearQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await findOwnEmployee(req.user!);
  if (!employee) return res.status(404).json({ error: "No employee record linked to this account" });

  const year = parsed.data.year ?? new Date().getFullYear();
  const balances = await leaveBalanceService.listBalancesForEmployee(req.user!.companyId!, employee.id, year);
  res.json(balances);
});

const employeeQuerySchema = yearQuerySchema.extend({ employeeId: z.string() });

leaveBalanceRouter.get(
  "/",
  requireRole(UserRole.COMPANY_ADMIN, UserRole.HR, UserRole.MANAGER),
  async (req, res) => {
    const parsed = employeeQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const scope = await scopedEmployeeWhere(req.user!);
    const employee = await prisma.employee.findFirst({ where: { AND: [scope, { id: parsed.data.employeeId }] } });
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const year = parsed.data.year ?? new Date().getFullYear();
    const balances = await leaveBalanceService.listBalancesForEmployee(req.user!.companyId!, employee.id, year);
    res.json(balances);
  }
);

const adjustSchema = z.object({
  employeeId: z.string(),
  leaveTypeId: z.string(),
  year: z.number().int(),
  balanceDays: z.number(),
});

leaveBalanceRouter.post("/adjust", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const balance = await leaveBalanceService.adjustBalance(req.user!.companyId!, parsed.data);
    res.json(balance);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
