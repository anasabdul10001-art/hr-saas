import crypto from "crypto";
import { AccountingLink, AccountingLinkStatus, AccountingSyncState, AccountingSyncStatus, PayrollRunStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { decryptSecret, encryptSecret, secretBoxConfigured } from "../../lib/secretBox";

/** An error with a message that is safe to show the user, and the status to answer with. */
export class LinkError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 360]; // between tries; the last step repeats
const MAX_ATTEMPTS = 8; // after this many failed tries the job waits for a manual retry
const REQUEST_TIMEOUT_MS = 10_000;
const LOCK_MS = 60_000;

function baseUrl(): string | null {
  const url = (process.env.DALILACOM_API_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : null;
}

export function accountingLinkConfigured(): boolean {
  return baseUrl() !== null && secretBoxConfigured();
}

const sign = (secret: string, timestamp: string, rawBody: string) => crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");

type Reply = { status: number; code: string | null; body: unknown };

async function readReply(res: Response): Promise<Reply> {
  const body = await res.json().catch(() => null);
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return { status: res.status, code: typeof code === "string" ? code : null, body };
}

/** One call to Dalilacom, signed over the exact bytes sent (HMAC-SHA256 of "<unix seconds>.<body>"). */
async function postSigned(link: Pick<AccountingLink, "remoteLinkId" | "secretEnc">, path: "payroll" | "disconnect", payload: object): Promise<Reply> {
  const url = baseUrl();
  if (!url || !link.secretEnc) throw new Error("not configured");
  const raw = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${url}/integrations/hr/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-HR-Link-Id": link.remoteLinkId, "X-HR-Timestamp": timestamp, "X-HR-Signature": sign(decryptSecret(link.secretEnc), timestamp, raw) },
    body: raw,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return readReply(res);
}

// ---------------------------------------------------------------- what is sent

function advancePart(breakdown: unknown): number {
  const items = (breakdown as { advanceInstallments?: unknown } | null)?.advanceInstallments;
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum: number, i) => sum + (Number.isInteger((i as { amount?: unknown })?.amount) ? (i as { amount: number }).amount : 0), 0);
}

/**
 * What the run cost: what the employees were paid plus the advance installments held back from them. The advance
 * itself is not a cost (the money left the cash box earlier), but each held-back installment is part of the salary.
 * Only the total and the head count leave this system, never a name or a single salary.
 */
async function runTotals(companyId: string, runId: string) {
  const payslips = await prisma.payslip.findMany({ where: { payrollRunId: runId, payrollRun: { companyId } }, select: { netPay: true, breakdown: true } });
  return { totalCents: payslips.reduce((sum, p) => sum + p.netPay + advancePart(p.breakdown), 0), employeeCount: payslips.length };
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- queue

/** Tries a job in the background without holding up the request that caused it. */
function kick(jobId: string) {
  setImmediate(() => {
    attemptJob(jobId).catch((err) => console.error("accounting sync attempt failed", err));
  });
}

/**
 * Records that Dalilacom must be told this run is now paid (or no longer paid). One row per run keeps the latest
 * wish, with a revision that only grows. Does nothing when the company has no active link; taking back a payment
 * that was never sent has nothing to undo, so it queues nothing either.
 */
export async function enqueueRunState(companyId: string, runId: string, state: AccountingSyncState): Promise<string | null> {
  const link = await prisma.accountingLink.findFirst({ where: { companyId, status: AccountingLinkStatus.ACTIVE }, select: { id: true } });
  if (!link) return null;
  const where = { linkId_payrollRunId: { linkId: link.id, payrollRunId: runId } };
  if (state === AccountingSyncState.REVERTED && !(await prisma.accountingSyncJob.findUnique({ where, select: { id: true } }))) return null;
  const job = await prisma.accountingSyncJob.upsert({
    where,
    create: { companyId, linkId: link.id, payrollRunId: runId, desiredState: state, revision: 1 },
    update: { desiredState: state, revision: { increment: 1 }, status: AccountingSyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lockedUntil: null, lastError: null },
  });
  kick(job.id);
  return job.id;
}

/** Puts the paid runs from before the link on the queue (the owner asks for this; nothing is imported by itself). */
export async function backfillPaidRuns(companyId: string): Promise<number> {
  const link = await prisma.accountingLink.findFirst({ where: { companyId, status: AccountingLinkStatus.ACTIVE }, select: { id: true } });
  if (!link) throw new LinkError(409, "This company is not linked to accounting");
  const [runs, known] = await Promise.all([
    prisma.payrollRun.findMany({ where: { companyId, status: PayrollRunStatus.PAID }, select: { id: true } }),
    prisma.accountingSyncJob.findMany({ where: { linkId: link.id }, select: { payrollRunId: true } }),
  ]);
  const have = new Set(known.map((j) => j.payrollRunId));
  const missing = runs.filter((r) => !have.has(r.id));
  if (missing.length) {
    await prisma.accountingSyncJob.createMany({
      data: missing.map((r) => ({ companyId, linkId: link.id, payrollRunId: r.id, desiredState: AccountingSyncState.PAID, revision: 1 })),
      skipDuplicates: true,
    });
    setImmediate(() => processDueJobs().catch((err) => console.error("accounting sync failed", err)));
  }
  return missing.length;
}

export async function retryJob(companyId: string, runId: string) {
  const job = await prisma.accountingSyncJob.findFirst({ where: { companyId, payrollRunId: runId }, select: { id: true } });
  if (!job) throw new LinkError(404, "Nothing to send for this payroll run");
  await prisma.accountingSyncJob.update({ where: { id: job.id }, data: { status: AccountingSyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lockedUntil: null, lastError: null } });
  kick(job.id);
}

// ---------------------------------------------------------------- sending

/** One delivery attempt. Only one process can hold a job at a time; a newer wish made meanwhile is never overwritten. */
export async function attemptJob(jobId: string): Promise<void> {
  const now = new Date();
  const claimed = await prisma.accountingSyncJob.updateMany({
    where: { id: jobId, status: AccountingSyncStatus.PENDING, nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  if (claimed.count !== 1) return;
  const job = await prisma.accountingSyncJob.findUniqueOrThrow({ where: { id: jobId }, include: { link: true } });
  // every write below is guarded by the revision we read, so it applies only if nobody asked for a newer state meanwhile
  const settle = (data: object) => prisma.accountingSyncJob.updateMany({ where: { id: job.id, revision: job.revision }, data: { lockedUntil: null, ...data } });
  const fail = (error: string) => settle({ status: AccountingSyncStatus.FAILED, attempts: job.attempts + 1, lastError: error });

  if (job.link.status !== AccountingLinkStatus.ACTIVE || !job.link.secretEnc) return void (await fail("The link is not active"));
  const run = await prisma.payrollRun.findFirst({ where: { id: job.payrollRunId, companyId: job.companyId }, include: { company: { select: { currency: true } } } });
  if (!run) return void (await fail("Payroll run not found"));
  const currency = run.company.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return void (await fail("The company currency is not a 3-letter code"));

  const totals = job.desiredState === AccountingSyncState.PAID ? await runTotals(job.companyId, run.id) : { totalCents: 0, employeeCount: 0 };
  let reply: Reply;
  try {
    reply = await postSigned(job.link, "payroll", {
      runId: run.id, revision: job.revision, state: job.desiredState,
      periodStart: dateOnly(run.periodStart), periodEnd: dateOnly(run.periodEnd), currency, ...totals,
    });
  } catch {
    reply = { status: 0, code: "NETWORK", body: null };
  }

  if (reply.status === 200) {
    await settle({ status: AccountingSyncStatus.SYNCED, attempts: job.attempts + 1, lastError: null, syncedAt: new Date() });
    return;
  }
  if (reply.status === 410) {
    // the owner cancelled the link on the Dalilacom side: stop sending, forget the secret and what was waiting
    await prisma.$transaction([
      prisma.accountingLink.update({ where: { id: job.linkId }, data: { status: AccountingLinkStatus.REVOKED, secretEnc: null, revokedAt: new Date() } }),
      prisma.accountingSyncJob.deleteMany({ where: { linkId: job.linkId } }),
    ]);
    return;
  }
  const error = reply.status === 0 ? "Dalilacom could not be reached" : `Dalilacom answered ${reply.status}${reply.code ? ` ${reply.code}` : ""}`;
  // a refusal that repeating cannot fix (the message itself is wrong) is not retried; the rest is
  const retryable = reply.status === 0 || reply.status >= 500 || [401, 408, 409, 425, 429].includes(reply.status);
  const attempts = job.attempts + 1;
  if (!retryable || attempts >= MAX_ATTEMPTS) return void (await settle({ status: AccountingSyncStatus.FAILED, attempts, lastError: error }));
  const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  await settle({ attempts, lastError: error, nextAttemptAt: new Date(Date.now() + wait * 60_000) });
}

/** Sends everything that is due. The worker calls this every half minute, which is also what retries after a restart or a sleeping server. */
export async function processDueJobs(limit = 25): Promise<number> {
  const due = await prisma.accountingSyncJob.findMany({
    where: { status: AccountingSyncStatus.PENDING, nextAttemptAt: { lte: new Date() }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" }, take: limit, select: { id: true },
  });
  for (const job of due) await attemptJob(job.id).catch((err) => console.error("accounting sync attempt failed", err));
  return due.length;
}

export function startAccountingSyncWorker(intervalMs = 30_000) {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    processDueJobs().catch((err) => console.error("accounting sync failed", err)).finally(() => { busy = false; });
  }, intervalMs);
  timer.unref();
  return timer;
}

// ---------------------------------------------------------------- the link itself

export async function linkStatus(companyId: string) {
  const [link, counts] = await Promise.all([
    prisma.accountingLink.findUnique({ where: { companyId }, select: { status: true, connectedAt: true, revokedAt: true } }),
    prisma.accountingSyncJob.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
  ]);
  const count = (s: AccountingSyncStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return {
    configured: accountingLinkConfigured(),
    status: link?.status ?? "NONE",
    connectedAt: link?.connectedAt ?? null,
    revokedAt: link?.revokedAt ?? null,
    pending: count(AccountingSyncStatus.PENDING),
    failed: count(AccountingSyncStatus.FAILED),
  };
}

export function listSyncJobs(companyId: string) {
  return prisma.accountingSyncJob.findMany({
    where: { companyId },
    select: { payrollRunId: true, desiredState: true, status: true, attempts: true, lastError: true, nextAttemptAt: true, syncedAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Swaps the one-time code from the owner's Dalilacom account for a signing secret, and keeps the secret encrypted. */
export async function connectLink(companyId: string, companyName: string, code: string) {
  const url = baseUrl();
  if (!url || !secretBoxConfigured()) throw new LinkError(503, "The accounting link is not set up on this server");
  const existing = await prisma.accountingLink.findUnique({ where: { companyId } });
  if (existing?.status === AccountingLinkStatus.ACTIVE) throw new LinkError(409, "This company is already linked. Cancel the link first");

  let reply: Reply;
  try {
    const res = await fetch(`${url}/integrations/hr/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, companyName }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    reply = await readReply(res);
  } catch {
    throw new LinkError(502, "Could not reach Dalilacom. Try again in a moment");
  }
  if (reply.status === 400 && reply.code === "HR_LINK_CODE_INVALID") throw new LinkError(400, "The link code is wrong or has expired");
  const body = reply.body as { linkId?: unknown; secret?: unknown } | null;
  if (reply.status !== 201 || typeof body?.linkId !== "string" || typeof body?.secret !== "string") throw new LinkError(502, "Dalilacom did not accept the link");

  const data = { remoteLinkId: body.linkId, secretEnc: encryptSecret(body.secret), status: AccountingLinkStatus.ACTIVE, connectedAt: new Date(), revokedAt: null };
  if (existing) {
    // replacing a link that was cancelled on the other side: what waited under it is dropped
    await prisma.$transaction([prisma.accountingSyncJob.deleteMany({ where: { linkId: existing.id } }), prisma.accountingLink.update({ where: { id: existing.id }, data })]);
  } else {
    await prisma.accountingLink.create({ data: { companyId, ...data } });
  }
}

/** Cancels from this side: Dalilacom is told (best effort), then the secret and everything waiting are removed here. */
export async function disconnectLink(companyId: string): Promise<{ remoteNotified: boolean }> {
  const link = await prisma.accountingLink.findUnique({ where: { companyId } });
  if (!link) throw new LinkError(404, "This company is not linked to accounting");
  let remoteNotified = false;
  if (link.status === AccountingLinkStatus.ACTIVE && link.secretEnc) {
    try {
      const reply = await postSigned(link, "disconnect", {});
      remoteNotified = reply.status === 200 || reply.status === 410;
    } catch {
      /* the link is cancelled here either way; the owner can also cancel it on the Dalilacom side */
    }
  }
  await prisma.accountingLink.delete({ where: { id: link.id } }); // its jobs go with it
  return { remoteNotified };
}
