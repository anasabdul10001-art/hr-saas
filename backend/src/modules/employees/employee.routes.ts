import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { blockSuspendedCompany, requireAuth, requireCompanyContext, requireRole } from "../../middleware/auth";
import * as employeeService from "./employee.service";
import { findOwnEmployee } from "./employee.scope";

export const employeeRouter = Router();

employeeRouter.use(requireAuth, requireCompanyContext, blockSuspendedCompany);

employeeRouter.get("/me", async (req, res) => {
  const employee = await findOwnEmployee(req.user!);
  if (!employee) return res.status(404).json({ error: "No employee record linked to this account" });
  res.json(employee);
});

const listQuerySchema = z.object({
  departmentId: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
});

employeeRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employees = await employeeService.listEmployees(req.user!, parsed.data);
  res.json(employees);
});

employeeRouter.get("/:id", async (req, res) => {
  try {
    const employee = await employeeService.getEmployee(req.user!, req.params.id);
    res.json(employee);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  position: z.string().optional(),
  hireDate: z.string(),
  invite: z
    .object({
      email: z.string().email(),
      role: z.enum([UserRole.HR, UserRole.MANAGER, UserRole.EMPLOYEE]),
    })
    .optional(),
});

employeeRouter.post("/", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { employee, tempPassword } = await employeeService.createEmployee(req.user!.companyId!, parsed.data);
    // tempPassword is returned directly for now (no email sending yet) — in production this
    // would be delivered via an invite email instead of the API response.
    res.status(201).json({ employee, tempPassword });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
});

employeeRouter.patch("/:id", requireRole(UserRole.COMPANY_ADMIN, UserRole.HR), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const employee = await employeeService.updateEmployee(req.user!.companyId!, req.params.id, parsed.data, req.user!.id);
    res.json(employee);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
