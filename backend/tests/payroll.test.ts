import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { attendWholePeriod, newAdvance, newCompany, newEmployee, newRun } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

const process = (auth: object, runId: string) => request(app).post(`/api/payroll-runs/${runId}/process`).set(auth);

describe("processing a payroll run", () => {
  it("makes one payslip per active employee and marks the run processed", async () => {
    const co = await newCompany("pay1");
    await newEmployee(co.companyId, { baseSalary: 300000 });
    await newEmployee(co.companyId, { baseSalary: 200000 });
    const terminated = await newEmployee(co.companyId);
    await prisma.employee.update({ where: { id: terminated.id }, data: { employmentStatus: "TERMINATED" } });
    const runId = await newRun(co.auth);
    const res = await process(co.auth, runId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("PROCESSED");
    expect(await prisma.payslip.count({ where: { payrollRunId: runId } })).toBe(2);
  });

  it("running it twice, even at the same moment, never doubles the payslips or the advance deductions", async () => {
    const co = await newCompany("pay2");
    const emp = await newEmployee(co.companyId, { baseSalary: 500000 });
    await attendWholePeriod(co.companyId, emp.id);
    await newAdvance(co.companyId, emp.id, [20000]);
    const runId = await newRun(co.auth);
    const results = await Promise.all([process(co.auth, runId), process(co.auth, runId), process(co.auth, runId)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.payslip.count({ where: { payrollRunId: runId } })).toBe(1);
    expect(await prisma.advanceInstallment.count({ where: { paidInPayrollRunId: runId } })).toBe(1);
    expect((await process(co.auth, runId)).status).toBe(400); // and a later try is refused too
  });

  it("deducts a due advance installment once and closes the advance when its last one is paid", async () => {
    const co = await newCompany("pay3");
    const emp = await newEmployee(co.companyId, { baseSalary: 500000 });
    await attendWholePeriod(co.companyId, emp.id);
    const advance = await newAdvance(co.companyId, emp.id, [20000, 20000]);
    const runId = await newRun(co.auth);
    const res = await process(co.auth, runId);
    expect(res.status).toBe(200);
    expect(res.body[0].totalDeductions).toBeGreaterThanOrEqual(40000);
    expect((await prisma.salaryAdvance.findUniqueOrThrow({ where: { id: advance.id } })).status).toBe("REPAID");
  });

  it("never produces a negative net pay: an advance installment that does not fit waits for the next run", async () => {
    const co = await newCompany("pay4");
    const emp = await newEmployee(co.companyId, { baseSalary: 100000 });
    await attendWholePeriod(co.companyId, emp.id);
    const advance = await newAdvance(co.companyId, emp.id, [30000, 150000]);
    const runId = await newRun(co.auth);
    const res = await process(co.auth, runId);
    expect(res.status).toBe(200);
    const slip = res.body[0];
    expect(slip.netPay).toBeGreaterThanOrEqual(0);
    const unpaid = await prisma.advanceInstallment.findMany({ where: { advanceId: advance.id, isPaid: false } });
    expect(unpaid.map((i) => i.amount)).toEqual([150000]); // the one that did not fit stays due
    expect((await prisma.salaryAdvance.findUniqueOrThrow({ where: { id: advance.id } })).status).toBe("APPROVED");
  });

  it("an employee hired mid-period is paid only for the days since the hire", async () => {
    const co = await newCompany("pay5");
    const emp = await newEmployee(co.companyId, { baseSalary: 310000, hireDate: new Date("2026-03-16T00:00:00Z") });
    await prisma.attendanceRecord.createMany({ data: ["2026-03-16", "2026-03-17", "2026-03-18"].map((d) => ({ employeeId: emp.id, companyId: co.companyId, checkIn: new Date(`${d}T08:00:00Z`) })) as never });
    const runId = await newRun(co.auth);
    const res = await process(co.auth, runId);
    expect(res.status).toBe(200);
    expect(res.body[0].netPay).toBeLessThan(310000);
    expect(res.body[0].netPay).toBeGreaterThan(0);
  });

  it("another company cannot see, process or pay my payroll run", async () => {
    const mine = await newCompany("pay6");
    const other = await newCompany("pay6o");
    await newEmployee(mine.companyId);
    const runId = await newRun(mine.auth);
    expect((await request(app).get(`/api/payroll-runs/${runId}`).set(other.auth)).status).toBe(404);
    expect((await process(other.auth, runId)).status).toBe(400);
    expect((await request(app).post(`/api/payroll-runs/${runId}/mark-paid`).set(other.auth)).status).toBe(400);
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("DRAFT");
  });

  it("a failure half-way leaves nothing behind: the run stays a draft and can be processed again", async () => {
    const co = await newCompany("pay7");
    const a = await newEmployee(co.companyId, { baseSalary: 200000 });
    const b = await newEmployee(co.companyId, { baseSalary: 200000 });
    await attendWholePeriod(co.companyId, a.id);
    await attendWholePeriod(co.companyId, b.id);
    const runId = await newRun(co.auth);
    // an installment another run already took (it is gone by the time this run writes) makes the write fail after the first payslip
    const real = prisma.advanceInstallment.findMany.bind(prisma.advanceInstallment);
    const spy = vi.spyOn(prisma.advanceInstallment, "findMany").mockImplementation(((args: { where?: { advance?: { employeeId?: string } } }) =>
      args?.where?.advance?.employeeId === b.id ? Promise.resolve([{ id: "taken-elsewhere", advanceId: "gone", amount: 100, dueDate: new Date("2026-03-10T00:00:00Z"), isPaid: false, paidInPayrollRunId: null }]) : real(args as never)) as never);
    const failed = await process(co.auth, runId);
    spy.mockRestore();
    expect(failed.status).toBe(400);
    expect(await prisma.payslip.count({ where: { payrollRunId: runId } })).toBe(0);
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("DRAFT");
    const again = await process(co.auth, runId);
    expect(again.status).toBe(200);
    expect(again.body).toHaveLength(2);
  });
});
