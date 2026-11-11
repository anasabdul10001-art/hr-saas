import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { attendWholePeriod, newCompany, uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

type Role = "HR" | "MANAGER" | "EMPLOYEE";
/** Creates an employee with a login through the API (as an admin would), and signs in as them with the temporary password. */
async function hire(co: { auth: object }, role: Role, extra: Record<string, unknown> = {}) {
  const email = uniqueEmail(role.toLowerCase());
  const created = await request(app).post("/api/employees").set(co.auth).send({ firstName: role, lastName: "Person", hireDate: "2024-01-01", invite: { email, role }, ...extra });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect(created.body.tempPassword).toBeTruthy();
  const login = await request(app).post("/api/auth/login").send({ email, password: created.body.tempPassword });
  expect(login.status).toBe(200);
  return { id: created.body.employee.id as string, auth: { Authorization: `Bearer ${login.body.accessToken}` } };
}

describe("employees and departments", () => {
  it("an admin creates a department and an employee in it; validation errors are 400", async () => {
    const co = await newCompany("fl1");
    const dept = await request(app).post("/api/departments").set(co.auth).send({ name: "Sales" });
    expect(dept.status).toBe(201);
    const emp = await hire(co, "EMPLOYEE", { departmentId: dept.body.id, position: "Rep" });
    const got = await request(app).get(`/api/employees/${emp.id}`).set(co.auth);
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ position: "Rep", departmentId: dept.body.id });
    expect((await request(app).post("/api/employees").set(co.auth).send({ firstName: "", lastName: "x", hireDate: "2024-01-01" })).status).toBe(400);
    expect((await request(app).post("/api/departments").set(co.auth).send({ name: "" })).status).toBe(400);
    expect((await request(app).patch(`/api/employees/${emp.id}`).set(co.auth).send({ employmentStatus: "NOT-A-STATUS" })).status).toBe(400);
  });
});

describe("attendance", () => {
  it("an employee checks in and out once at a time, and sees their own records", async () => {
    const co = await newCompany("fl2");
    const emp = await hire(co, "EMPLOYEE");
    expect((await request(app).post("/api/attendance/check-in").set(emp.auth)).status).toBeLessThan(300);
    expect((await request(app).post("/api/attendance/check-in").set(emp.auth)).status).toBeGreaterThanOrEqual(400); // already in
    expect((await request(app).post("/api/attendance/check-out").set(emp.auth)).status).toBeLessThan(300);
    const mine = await request(app).get("/api/attendance/me").set(emp.auth);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].checkOut).toBeTruthy();
  });

  it("HR adds and corrects a record by hand; an employee cannot", async () => {
    const co = await newCompany("fl3");
    const emp = await hire(co, "EMPLOYEE");
    const manual = await request(app).post("/api/attendance/manual").set(co.auth).send({ employeeId: emp.id, checkIn: "2026-03-02T08:00:00.000Z", checkOut: "2026-03-02T16:00:00.000Z", notes: "forgot" });
    expect(manual.status).toBe(201);
    const fixed = await request(app).patch(`/api/attendance/${manual.body.id}`).set(co.auth).send({ notes: "fixed" });
    expect(fixed.status).toBe(200);
    expect(fixed.body.notes).toBe("fixed");
    expect((await request(app).post("/api/attendance/manual").set(emp.auth).send({ employeeId: emp.id, checkIn: "2026-03-03T08:00:00.000Z" })).status).toBe(403);
  });
});

describe("leave: request, approvals, balance", () => {
  it("a request goes employee -> manager -> HR and the balance drops only when it is fully approved", async () => {
    const co = await newCompany("fl4");
    const manager = await hire(co, "MANAGER");
    const emp = await hire(co, "EMPLOYEE", { managerId: manager.id });
    const type = await request(app).post("/api/leave-types").set(co.auth).send({ name: "Annual", defaultBalance: 10, isPaid: true });
    expect(type.status).toBe(201);
    const year = 2026;
    expect((await request(app).post("/api/leave-balances/adjust").set(co.auth).send({ employeeId: emp.id, leaveTypeId: type.body.id, year, balanceDays: 10 })).status).toBeLessThan(300);

    const asked = await request(app).post("/api/leave-requests").set(emp.auth).send({ leaveTypeId: type.body.id, startDate: "2026-03-09", endDate: "2026-03-11", reason: "rest" });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    expect(asked.body.status).toBe("PENDING_MANAGER");
    expect((await request(app).post(`/api/leave-requests/${asked.body.id}/decide`).set(emp.auth).send({ decision: "APPROVE" })).status).toBe(403); // not their own to approve

    const byManager = await request(app).post(`/api/leave-requests/${asked.body.id}/decide`).set(manager.auth).send({ decision: "APPROVE" });
    expect(byManager.status, JSON.stringify(byManager.body)).toBe(200);
    expect(byManager.body.status).toBe("PENDING_HR");
    const byHr = await request(app).post(`/api/leave-requests/${asked.body.id}/decide`).set(co.auth).send({ decision: "APPROVE" });
    expect(byHr.status).toBe(200);
    expect(byHr.body.status).toBe("APPROVED");

    const balance = await request(app).get("/api/leave-balances/me").query({ year }).set(emp.auth);
    expect(balance.status).toBe(200);
    expect(JSON.stringify(balance.body)).toMatch(/7/); // 10 days minus the 3 taken
  });

  it("refuses an end date before the start, and lets an employee cancel their own pending request", async () => {
    const co = await newCompany("fl5");
    const emp = await hire(co, "EMPLOYEE");
    const type = await request(app).post("/api/leave-types").set(co.auth).send({ name: "Sick", defaultBalance: 5 });
    expect((await request(app).post("/api/leave-requests").set(emp.auth).send({ leaveTypeId: type.body.id, startDate: "2026-03-12", endDate: "2026-03-10" })).status).toBe(400);
    const ok = await request(app).post("/api/leave-requests").set(emp.auth).send({ leaveTypeId: type.body.id, startDate: "2026-03-10", endDate: "2026-03-10" });
    expect(ok.status).toBe(201);
    expect((await request(app).post(`/api/leave-requests/${ok.body.id}/cancel`).set(emp.auth)).status).toBe(200);
  });
});

describe("salary advances: request, approval, automatic payroll deduction", () => {
  it("an approved advance is split into installments and the first one is deducted by the next payroll run", async () => {
    const co = await newCompany("fl6");
    const manager = await hire(co, "MANAGER");
    const emp = await hire(co, "EMPLOYEE", { managerId: manager.id });
    await prisma.employee.update({ where: { id: emp.id }, data: { baseSalary: 400000 } });
    await attendWholePeriod(co.companyId, emp.id);
    const asked = await request(app).post("/api/advances").set(emp.auth).send({ amount: 90000, installmentsCount: 3, reason: "rent" });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    expect((await request(app).post("/api/advances").set(emp.auth).send({ amount: 100, installmentsCount: 0 })).status).toBe(400);
    expect((await request(app).post(`/api/advances/${asked.body.id}/decide`).set(manager.auth).send({ decision: "APPROVE" })).status).toBe(200);
    const final = await request(app).post(`/api/advances/${asked.body.id}/decide`).set(co.auth).send({ decision: "APPROVE" });
    expect(final.status).toBe(200);
    expect(final.body.status).toBe("APPROVED");
    const installments = await prisma.advanceInstallment.findMany({ where: { advanceId: asked.body.id }, orderBy: { dueDate: "asc" } });
    expect(installments.map((i) => i.amount)).toEqual([30000, 30000, 30000]);
    // make the first installment due inside the payroll period, then run payroll
    await prisma.advanceInstallment.update({ where: { id: installments[0].id }, data: { dueDate: new Date("2026-03-20T00:00:00Z") } });
    await prisma.advanceInstallment.updateMany({ where: { id: { in: [installments[1].id, installments[2].id] } }, data: { dueDate: new Date("2026-06-20T00:00:00Z") } });
    const run = await request(app).post("/api/payroll-runs").set(co.auth).send({ periodStart: "2026-03-01", periodEnd: "2026-03-31" });
    const processed = await request(app).post(`/api/payroll-runs/${run.body.id}/process`).set(co.auth);
    expect(processed.status).toBe(200);
    expect(processed.body.find((p: { employeeId: string }) => p.employeeId === emp.id).netPay).toBe(370000);
    expect((await prisma.advanceInstallment.findUniqueOrThrow({ where: { id: installments[0].id } })).isPaid).toBe(true);
    expect((await prisma.advanceInstallment.findUniqueOrThrow({ where: { id: installments[1].id } })).isPaid).toBe(false);
  });
});

describe("dashboards, reports, notifications, profile", () => {
  it("they load for the right roles", async () => {
    const co = await newCompany("fl7");
    const emp = await hire(co, "EMPLOYEE");
    for (const path of ["/api/dashboard", "/api/notifications", "/api/profile"]) {
      const res = await request(app).get(path).set(emp.auth);
      expect(res.status, path).toBeLessThan(500);
    }
    const profile = await request(app).get("/api/profile").set(co.auth);
    expect(profile.status).toBe(200);
    expect((await request(app).get("/api/plans")).status).toBeLessThan(500);
    const dash = await request(app).get("/api/dashboard").set(co.auth);
    expect(dash.status).toBe(200);
  });

  it("billing answers an unknown plan with a plain 404, not a database error", async () => {
    const co = await newCompany("fl8");
    const res = await request(app).post("/api/billing/checkout").set(co.auth).send({ planId: "does-not-exist" });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma/i);
  });
});
