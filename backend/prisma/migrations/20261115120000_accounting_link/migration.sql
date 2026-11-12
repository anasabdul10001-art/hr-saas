-- Link to the owner's bookkeeping in Dalilacom: payroll totals are sent there when a run is paid.
CREATE TYPE "AccountingLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "AccountingSyncState" AS ENUM ('PAID', 'REVERTED');
CREATE TYPE "AccountingSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

CREATE TABLE "AccountingLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "remoteLinkId" TEXT NOT NULL,
    "secretEnc" TEXT,
    "status" "AccountingLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingSyncJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "desiredState" "AccountingSyncState" NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "AccountingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingLink_companyId_key" ON "AccountingLink"("companyId");
CREATE UNIQUE INDEX "AccountingSyncJob_linkId_payrollRunId_key" ON "AccountingSyncJob"("linkId", "payrollRunId");
CREATE INDEX "AccountingSyncJob_status_nextAttemptAt_idx" ON "AccountingSyncJob"("status", "nextAttemptAt");
CREATE INDEX "AccountingSyncJob_companyId_idx" ON "AccountingSyncJob"("companyId");

ALTER TABLE "AccountingLink" ADD CONSTRAINT "AccountingLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AccountingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
