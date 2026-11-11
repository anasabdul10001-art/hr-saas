import crypto from "crypto";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

export const password = "correct-horse-battery-staple";
export const uniqueEmail = (prefix: string) => `${prefix}-${crypto.randomUUID()}@example.test`;

/** A new company with its admin, signed in. */
export async function newCompany(prefix = "co") {
  const email = uniqueEmail(prefix);
  const res = await request(app).post("/api/auth/signup").send({ companyName: `${prefix} ${crypto.randomUUID().slice(0, 6)}`, adminEmail: email, adminPassword: password });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { companyId: res.body.company.id as string, auth: { Authorization: `Bearer ${res.body.accessToken}` }, email };
}

export async function newEmployee(companyId: string, data: { baseSalary?: number; hireDate?: Date; firstName?: string } = {}) {
  return prisma.employee.create({
    data: { companyId, firstName: data.firstName ?? "Test", lastName: crypto.randomUUID().slice(0, 5), hireDate: data.hireDate ?? new Date("2020-01-01T00:00:00Z"), baseSalary: data.baseSalary ?? 100000 },
  });
}

/** An approved advance whose installments are all due before the given date. */
export async function newAdvance(companyId: string, employeeId: string, installmentAmounts: number[], dueDate = new Date("2026-03-15T00:00:00Z")) {
  return prisma.salaryAdvance.create({
    data: {
      companyId, employeeId, amount: installmentAmounts.reduce((a, b) => a + b, 0), installmentsCount: installmentAmounts.length, status: "APPROVED",
      installments: { create: installmentAmounts.map((amount) => ({ amount, dueDate })) },
    },
    include: { installments: true },
  });
}

export async function newRun(auth: object, periodStart = "2026-03-01", periodEnd = "2026-03-31") {
  const res = await request(app).post("/api/payroll-runs").set(auth).send({ periodStart, periodEnd });
  if (res.status !== 201) throw new Error(`run failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

/** A check-in on every Monday-to-Friday of March 2026 (the default working days), so nobody is counted absent. */
export async function attendWholePeriod(companyId: string, employeeId: string, from = "2026-03-01", to = "2026-03-31") {
  const rows = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) rows.push({ companyId, employeeId, checkIn: new Date(d.getTime() + 8 * 3600000) });
  }
  await prisma.attendanceRecord.createMany({ data: rows });
}
