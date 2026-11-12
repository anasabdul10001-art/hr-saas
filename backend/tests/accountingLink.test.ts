import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { attemptJob, processDueJobs } from "../src/modules/accounting/accountingSync.service";
import { attendWholePeriod, newAdvance, newCompany, newEmployee, newRun, uniqueEmail } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});
afterEach(() => vi.restoreAllMocks());

// ---- a stand-in for the Dalilacom server: it checks every signature the way the real one does ----
type Call = { path: string; headers: Record<string, string>; raw: string; json: Record<string, unknown> };
type Answer = { status: number; body?: object } | "network";
const secrets = new Map<string, string>(); // link id -> the secret this stand-in handed out
let calls: Call[] = [];
function fakeDalilacom(answer?: (call: Call) => Answer | Promise<Answer>) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://dalilacom.test");
    const path = url.pathname.replace("/integrations/hr/", "");
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const raw = String(init?.body ?? "");
    const call: Call = { path, headers, raw, json: JSON.parse(raw) };
    calls.push(call);
    const reply = (status: number, body: object = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (path === "connect") {
      if (!String(call.json.code).startsWith("dlk_")) return reply(400, { error: { code: "HR_LINK_CODE_INVALID" } });
      const linkId = crypto.randomUUID();
      const secret = crypto.randomBytes(32).toString("hex");
      secrets.set(linkId, secret);
      return reply(201, { linkId, secret });
    }
    // everything else must be signed over "<timestamp>.<exact body>" with that link's secret, and be fresh
    const secret = secrets.get(headers["x-hr-link-id"]);
    const expected = secret ? crypto.createHmac("sha256", secret).update(`${headers["x-hr-timestamp"]}.${raw}`).digest("hex") : "";
    if (!secret || expected !== headers["x-hr-signature"] || Math.abs(Date.now() / 1000 - Number(headers["x-hr-timestamp"])) > 300) return reply(401, { error: { code: "HR_SIGNATURE_INVALID" } });
    const custom = answer ? await answer(call) : undefined;
    if (custom === "network") throw new TypeError("fetch failed");
    return custom ? reply(custom.status, custom.body) : reply(200, { applied: true });
  });
}

const code = () => `dlk_${crypto.randomBytes(24).toString("base64url")}`;
const connect = (co: { auth: object }) => request(app).post("/api/accounting-link/connect").set(co.auth).send({ code: code() });
const linkOf = (companyId: string) => prisma.accountingLink.findUniqueOrThrow({ where: { companyId } });
const jobOf = (companyId: string, runId: string) => prisma.accountingSyncJob.findFirst({ where: { companyId, payrollRunId: runId } });
const waitFor = (fn: () => Promise<void>) => vi.waitFor(fn, { timeout: 5000, interval: 25 });

/** A company with a paid-ready run: two employees, one with an advance installment held back from the pay. */
async function paidReadyRun(co: { companyId: string; auth: object }, process = true) {
  const a = await newEmployee(co.companyId, { baseSalary: 500000, firstName: "Salma" });
  const b = await newEmployee(co.companyId, { baseSalary: 300000, firstName: "Khaled" });
  await attendWholePeriod(co.companyId, a.id);
  await attendWholePeriod(co.companyId, b.id);
  await newAdvance(co.companyId, a.id, [20000]);
  const runId = await newRun(co.auth);
  if (process) expect((await request(app).post(`/api/payroll-runs/${runId}/process`).set(co.auth)).status).toBe(200);
  return runId;
}
const markPaid = (co: { auth: object }, runId: string) => request(app).post(`/api/payroll-runs/${runId}/mark-paid`).set(co.auth);
const revert = (auth: object, runId: string) => request(app).post(`/api/payroll-runs/${runId}/revert-paid`).set(auth);
async function hrUser(companyId: string) {
  const user = await prisma.user.create({ data: { companyId, email: uniqueEmail("hr"), passwordHash: "x", role: "HR" } });
  return { Authorization: `Bearer ${signAccessToken({ sub: user.id, companyId, role: "HR" })}` };
}
/** A linked company with a processed run, ready to be marked paid. */
async function linkedCompany(prefix: string) {
  fakeDalilacom();
  const co = await newCompany(prefix);
  expect((await connect(co)).status).toBe(201);
  return { ...co, runId: await paidReadyRun(co) };
}

describe("linking the company to accounting", () => {
  it("is for the company admin only, keeps the secret encrypted, and links once", async () => {
    fakeDalilacom();
    const co = await newCompany("lnk1");
    expect((await request(app).get("/api/accounting-link").set(co.auth)).body).toMatchObject({ status: "NONE", configured: true });
    const hr = await hrUser(co.companyId);
    expect((await request(app).post("/api/accounting-link/connect").set(hr).send({ code: code() })).status).toBe(403);
    expect((await request(app).post("/api/accounting-link/connect").send({ code: code() })).status).toBe(401);
    expect((await request(app).post("/api/accounting-link/connect").set(co.auth).send({ code: "short" })).status).toBe(400);
    expect((await request(app).post("/api/accounting-link/connect").set(co.auth).send({ code: "wrong_code_that_is_long_enough_xx" })).body.error).toBe("The link code is wrong or has expired");

    const res = await connect(co);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "ACTIVE", pending: 0, failed: 0 });
    const link = await linkOf(co.companyId);
    const secret = secrets.get(link.remoteLinkId)!;
    expect(link.secretEnc).toBeTruthy();
    expect(link.secretEnc).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(calls.at(-1)!.json.companyName).toBeTruthy();
    expect((await connect(co)).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { companyId: co.companyId, action: "accounting_link.connect" } })).toBe(1);
  });
});

describe("paying a run sends its total to accounting", () => {
  it("sends one signed message with totals only: salaries plus the held-back advance installment, no names", async () => {
    const co = await linkedCompany("snd1");
    calls = [];
    expect((await markPaid(co, co.runId)).status).toBe(200);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.status).toBe("SYNCED"));
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.path).toBe("payroll");
    expect(call.headers["x-hr-link-id"]).toBe((await linkOf(co.companyId)).remoteLinkId);
    expect(call.json).toEqual({ runId: co.runId, revision: 1, state: "PAID", periodStart: "2026-03-01", periodEnd: "2026-03-31", currency: "USD", totalCents: 800000, employeeCount: 2 });
    expect(call.raw).not.toMatch(/Salma|Khaled|firstName|netPay|grossPay/);
    expect(Number.isInteger(call.json.totalCents)).toBe(true);
    expect(await prisma.payslip.count({ where: { payrollRunId: co.runId } })).toBe(2);
    expect((await jobOf(co.companyId, co.runId))).toMatchObject({ status: "SYNCED", attempts: 1, lastError: null });
  });

  it("sends nothing when the company is not linked, and the payment still goes through", async () => {
    fakeDalilacom();
    const co = await newCompany("snd2");
    const runId = await paidReadyRun(co);
    expect((await markPaid(co, runId)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toHaveLength(0);
    expect(await prisma.accountingSyncJob.count({ where: { companyId: co.companyId } })).toBe(0);
  });

  it("keeps the message when Dalilacom is down and sends it again later with the same revision", async () => {
    const co = await linkedCompany("snd3");
    let down = true;
    fakeDalilacom(() => (down ? { status: 503 } : { status: 200 }));
    expect((await markPaid(co, co.runId)).status).toBe(200); // paying is never held up by accounting
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.attempts).toBe(1));
    let job = (await jobOf(co.companyId, co.runId))!;
    expect(job).toMatchObject({ status: "PENDING", lastError: "Dalilacom answered 503" });
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000); // waits before the next try
    expect((await request(app).get("/api/accounting-link/sync").set(co.auth)).body[0]).toMatchObject({ payrollRunId: co.runId, status: "PENDING", attempts: 1 });

    expect(await processDueJobs()).toBe(0); // not due yet
    down = false;
    await prisma.accountingSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date() } });
    await processDueJobs();
    job = (await jobOf(co.companyId, co.runId))!;
    expect(job).toMatchObject({ status: "SYNCED", attempts: 2, lastError: null });
    expect(calls.map((c) => c.json.revision)).toEqual([1, 1]);
  });

  it("treats a network failure like a down server, and gives up after too many tries until retried by hand", async () => {
    const co = await linkedCompany("snd4");
    fakeDalilacom(() => "network");
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.lastError).toBe("Dalilacom could not be reached"));
    const job = (await jobOf(co.companyId, co.runId))!;
    await prisma.accountingSyncJob.update({ where: { id: job.id }, data: { attempts: 7, nextAttemptAt: new Date() } });
    await attemptJob(job.id);
    expect(await jobOf(co.companyId, co.runId)).toMatchObject({ status: "FAILED", attempts: 8 });
    expect(await processDueJobs()).toBe(0);
    expect((await request(app).get("/api/accounting-link").set(co.auth)).body).toMatchObject({ failed: 1, pending: 0 });

    fakeDalilacom();
    expect((await request(app).post(`/api/accounting-link/runs/${co.runId}/retry`).set(co.auth)).status).toBe(200);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.status).toBe("SYNCED"));
  });

  it("does not repeat a message Dalilacom refused as wrong", async () => {
    const co = await linkedCompany("snd5");
    fakeDalilacom(() => ({ status: 400, body: { error: { code: "VALIDATION_ERROR" } } }));
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.status).toBe("FAILED"));
    expect((await jobOf(co.companyId, co.runId))!.lastError).toBe("Dalilacom answered 400 VALIDATION_ERROR");
    expect(calls).toHaveLength(1);
  });

  it("two workers never send the same job at the same moment", async () => {
    const co = await linkedCompany("snd6");
    fakeDalilacom(() => ({ status: 503 }));
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.attempts).toBe(1));
    const job = (await jobOf(co.companyId, co.runId))!;
    await prisma.accountingSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date() } });
    calls = [];
    await Promise.all([attemptJob(job.id), attemptJob(job.id), attemptJob(job.id)]);
    expect(calls).toHaveLength(1);
  });
});

describe("taking a payment back", () => {
  it("is for the company admin only, and withdraws the cost with a newer revision", async () => {
    const co = await linkedCompany("rev1");
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.status).toBe("SYNCED"));
    expect((await revert(await hrUser(co.companyId), co.runId)).status).toBe(403);
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: co.runId } })).status).toBe("PAID");

    calls = [];
    const res = await revert(co.auth, co.runId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PROCESSED");
    await waitFor(async () => expect(await jobOf(co.companyId, co.runId)).toMatchObject({ status: "SYNCED", desiredState: "REVERTED", revision: 2 }));
    expect(calls[0].json).toMatchObject({ runId: co.runId, revision: 2, state: "REVERTED", totalCents: 0, employeeCount: 0 });
    expect(await prisma.auditLog.count({ where: { companyId: co.companyId, action: "payroll.revert_paid" } })).toBe(1);

    expect((await revert(co.auth, co.runId)).status).toBe(400); // no longer paid
    // paying again books it again, with the next revision
    calls = [];
    await markPaid(co, co.runId);
    await waitFor(async () => expect(calls).toHaveLength(1));
    expect(calls[0].json).toMatchObject({ state: "PAID", revision: 3, totalCents: 800000 });
  });

  it("only one of two simultaneous reverts takes effect", async () => {
    const co = await linkedCompany("rev2");
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.status).toBe("SYNCED"));
    const results = await Promise.all([revert(co.auth, co.runId), revert(co.auth, co.runId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await jobOf(co.companyId, co.runId))!.revision).toBe(2);
  });

  it("queues nothing for a run that was never sent (it was paid before the link)", async () => {
    fakeDalilacom();
    const co = await newCompany("rev3");
    const runId = await paidReadyRun(co);
    await markPaid(co, runId);
    expect((await connect(co)).status).toBe(201);
    calls = [];
    expect((await revert(co.auth, runId)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toHaveLength(0);
    expect(await prisma.accountingSyncJob.count({ where: { companyId: co.companyId } })).toBe(0);
  });

  it("a payment taken back while the first message is still on its way is not lost", async () => {
    const co = await linkedCompany("rev4");
    fakeDalilacom(() => ({ status: 503 }));
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.attempts).toBe(1));
    const job = (await jobOf(co.companyId, co.runId))!;
    await prisma.accountingSyncJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date() } });
    // while this send is in flight the admin takes the payment back
    fakeDalilacom(async () => {
      await revert(co.auth, co.runId);
      return { status: 200 };
    });
    await attemptJob(job.id);
    const after = (await jobOf(co.companyId, co.runId))!;
    expect(after).toMatchObject({ desiredState: "REVERTED", revision: 2 });
    expect(after.status).toBe("PENDING"); // the old "sent" result did not close the newer wish
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.status).toBe("SYNCED"));
    expect(calls.map((c) => c.json.state)).toEqual(["PAID", "REVERTED"]);
  });
});

describe("paid runs from before the link", () => {
  it("are sent only when the admin asks, once", async () => {
    fakeDalilacom();
    const co = await newCompany("bfl1");
    const runId = await paidReadyRun(co);
    await markPaid(co, runId);
    expect((await connect(co)).status).toBe(201);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.filter((c) => c.path === "payroll")).toHaveLength(0); // nothing is imported by itself

    expect((await request(app).post("/api/accounting-link/backfill").set(await hrUser(co.companyId))).status).toBe(403);
    expect((await request(app).post("/api/accounting-link/backfill").set(co.auth)).body).toEqual({ queued: 1 });
    await waitFor(async () => expect((await jobOf(co.companyId, runId))!.status).toBe("SYNCED"));
    expect(calls.at(-1)!.json).toMatchObject({ runId, state: "PAID", totalCents: 800000 });
    expect((await request(app).post("/api/accounting-link/backfill").set(co.auth)).body).toEqual({ queued: 0 });
  });

  it("needs a link", async () => {
    const co = await newCompany("bfl2");
    expect((await request(app).post("/api/accounting-link/backfill").set(co.auth)).status).toBe(409);
  });
});

describe("cancelling the link", () => {
  it("from this side tells Dalilacom, forgets the secret and what was waiting, and later payments send nothing", async () => {
    const co = await linkedCompany("cnc1");
    fakeDalilacom(() => ({ status: 503 }));
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await jobOf(co.companyId, co.runId))!.attempts).toBe(1));
    fakeDalilacom();
    expect((await request(app).delete("/api/accounting-link").set(await hrUser(co.companyId))).status).toBe(403);
    const res = await request(app).delete("/api/accounting-link").set(co.auth);
    expect(res.body).toEqual({ remoteNotified: true });
    expect(calls.map((c) => c.path)).toEqual(["disconnect"]);
    expect(await prisma.accountingLink.count({ where: { companyId: co.companyId } })).toBe(0);
    expect(await prisma.accountingSyncJob.count({ where: { companyId: co.companyId } })).toBe(0);
    expect((await request(app).get("/api/accounting-link").set(co.auth)).body.status).toBe("NONE");
    expect((await request(app).delete("/api/accounting-link").set(co.auth)).status).toBe(404);
  });

  it("works even when Dalilacom cannot be reached", async () => {
    const co = await linkedCompany("cnc2");
    fakeDalilacom(() => "network");
    expect((await request(app).delete("/api/accounting-link").set(co.auth)).body).toEqual({ remoteNotified: false });
    expect(await prisma.accountingLink.count({ where: { companyId: co.companyId } })).toBe(0);
  });

  it("from the Dalilacom side is noticed at the next send: sending stops and the admin can link again", async () => {
    const co = await linkedCompany("cnc3");
    fakeDalilacom(() => ({ status: 410, body: { error: { code: "HR_LINK_GONE" } } }));
    await markPaid(co, co.runId);
    await waitFor(async () => expect((await linkOf(co.companyId)).status).toBe("REVOKED"));
    const link = await linkOf(co.companyId);
    expect(link.secretEnc).toBeNull();
    expect(await prisma.accountingSyncJob.count({ where: { companyId: co.companyId } })).toBe(0);
    expect((await request(app).get("/api/accounting-link").set(co.auth)).body.status).toBe("REVOKED");

    fakeDalilacom();
    const run2 = await paidReadyRun(co);
    await markPaid(co, run2);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toHaveLength(0);
    expect((await connect(co)).status).toBe(201);
    expect((await request(app).get("/api/accounting-link").set(co.auth)).body.status).toBe("ACTIVE");
    expect((await linkOf(co.companyId)).remoteLinkId).not.toBe(link.remoteLinkId);
  });
});

describe("companies stay apart", () => {
  it("each sends under its own link and secret, and cannot see or retry the other's deliveries", async () => {
    const a = await linkedCompany("iso1");
    const b = await linkedCompany("iso2");
    calls = [];
    await markPaid(a, a.runId);
    await markPaid(b, b.runId);
    await waitFor(async () => expect(calls).toHaveLength(2));
    const linkA = (await linkOf(a.companyId)).remoteLinkId;
    const linkB = (await linkOf(b.companyId)).remoteLinkId;
    expect(linkA).not.toBe(linkB);
    expect(calls.find((c) => c.json.runId === a.runId)!.headers["x-hr-link-id"]).toBe(linkA);
    expect(calls.find((c) => c.json.runId === b.runId)!.headers["x-hr-link-id"]).toBe(linkB);

    const seenByB = (await request(app).get("/api/accounting-link/sync").set(b.auth)).body;
    expect(seenByB.map((j: { payrollRunId: string }) => j.payrollRunId)).toEqual([b.runId]);
    expect((await request(app).post(`/api/accounting-link/runs/${a.runId}/retry`).set(b.auth)).status).toBe(404);
    expect((await revert(b.auth, a.runId)).status).toBe(400); // "Payroll run not found", like every other payroll route
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: a.runId } })).status).toBe("PAID");
    // cancelling B's link leaves A's alone
    await request(app).delete("/api/accounting-link").set(b.auth);
    expect((await linkOf(a.companyId)).status).toBe("ACTIVE");
    expect((await request(app).get("/api/accounting-link").set(a.auth)).body.status).toBe("ACTIVE");
  });
});
