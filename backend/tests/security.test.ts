import { describe, it, expect, afterAll, vi } from "vitest";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { newCompany, newEmployee, password, uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("signing in", () => {
  it("accepts the right password, refuses the wrong one, and a refresh token works only once", async () => {
    const co = await newCompany("sec1");
    expect((await request(app).post("/api/auth/login").send({ email: co.email, password: "wrong-password-123" })).status).toBe(401);
    const login = await request(app).post("/api/auth/login").send({ email: co.email, password });
    expect(login.status).toBe(200);
    const first = await request(app).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(first.status).toBe(200);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken })).status).toBe(401); // already used
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: first.body.refreshToken })).status).toBe(200);
  });

  it("does not reveal whether an email has an account", async () => {
    const co = await newCompany("sec2");
    const known = await request(app).post("/api/auth/forgot-password").send({ email: co.email });
    const unknown = await request(app).post("/api/auth/forgot-password").send({ email: uniqueEmail("nobody") });
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    const bad = await request(app).post("/api/auth/login").send({ email: uniqueEmail("nobody"), password });
    const wrong = await request(app).post("/api/auth/login").send({ email: co.email, password: "wrong-password-123" });
    expect(bad.body).toEqual(wrong.body);
  });

  it("slows down password guessing: too many tries in a row are refused", async () => {
    vi.resetModules();
    process.env.AUTH_LOGIN_RATE_LIMIT = "3";
    try {
      const { app: strict } = await import("../src/app");
      const email = uniqueEmail("sec3");
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await request(strict).post("/api/auth/login").send({ email, password: "guess-number-" + i })).status);
      expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
      expect(codes.slice(3)).toEqual([429, 429]);
    } finally {
      process.env.AUTH_LOGIN_RATE_LIMIT = "1000";
      vi.resetModules();
    }
  });
});

describe("the server keeps answering when something fails", () => {
  it("a database error inside an async route is answered with a 500, not left hanging", async () => {
    const spy = vi.spyOn(prisma.refreshToken, "updateMany").mockRejectedValueOnce(new Error("database is down"));
    const res = await request(app).post("/api/auth/logout").send({ refreshToken: "anything" }).timeout(5000);
    spy.mockRestore();
    expect(res.status).toBe(500);
  });

  it("a database failure is not described to the client (no SQL, file paths or host names in the answer)", async () => {
    const dbError = new Prisma.PrismaClientInitializationError("Invalid `prisma.user.findUnique()` invocation in /srv/app/auth.service.ts: Can't reach database server at db.internal:5432", "5.22.0");
    const spy = vi.spyOn(prisma.user, "findUnique").mockRejectedValueOnce(dbError);
    const res = await request(app).post("/api/auth/signup").send({ companyName: "Leak Test Co", adminEmail: uniqueEmail("leak"), adminPassword: password });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|auth\.service|db\.internal|5432/i);
  });

  it("our own business errors still reach the client with their message and status", async () => {
    const co = await newCompany("sec9");
    const dup = await request(app).post("/api/auth/signup").send({ companyName: "Dup Co", adminEmail: co.email, adminPassword: password });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("Email already in use");
  });

  it("sends the standard security headers", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("each company sees only its own people, and roles are enforced on the server", () => {
  it("another company cannot read or change my employees", async () => {
    const mine = await newCompany("sec4");
    const other = await newCompany("sec4o");
    const emp = await newEmployee(mine.companyId);
    const list = await request(app).get("/api/employees").set(other.auth);
    expect(JSON.stringify(list.body)).not.toContain(emp.id);
    expect((await request(app).get(`/api/employees/${emp.id}`).set(other.auth)).status).toBeGreaterThanOrEqual(400);
    const patch = await request(app).patch(`/api/employees/${emp.id}`).set(other.auth).send({ position: "hacked" });
    expect(patch.status).toBeGreaterThanOrEqual(400);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).position).not.toBe("hacked");
  });

  it("a plain employee cannot run payroll or see the platform settings", async () => {
    const co = await newCompany("sec5");
    const user = await prisma.user.create({ data: { companyId: co.companyId, email: uniqueEmail("emp"), passwordHash: "x", role: "EMPLOYEE" } });
    const { signAccessToken } = await import("../src/lib/jwt");
    const auth = { Authorization: `Bearer ${signAccessToken({ sub: user.id, companyId: co.companyId, role: "EMPLOYEE" })}` };
    expect((await request(app).get("/api/payroll-runs").set(auth)).status).toBe(403);
    expect((await request(app).post("/api/payroll-runs").set(auth).send({ periodStart: "2026-03-01", periodEnd: "2026-03-31" })).status).toBe(403);
    expect((await request(app).get("/api/settings").set(auth)).status).toBe(403);
    expect((await request(app).get("/api/admin/companies").set(auth)).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).get("/api/payroll-runs")).status).toBe(401);
  });
});
