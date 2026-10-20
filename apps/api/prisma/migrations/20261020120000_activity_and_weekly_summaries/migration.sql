-- CreateTable
CREATE TABLE "ActivityRead" (
    "userId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityRead_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateTable
CREATE TABLE "WeeklySummary" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "offeringIds" UUID[],
    "accessKey" VARCHAR(64) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "mode" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMPTZ(3),
    "emailStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "emailSentAt" TIMESTAMPTZ(3),
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WeeklySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklySummary_status_leaseUntil_idx" ON "WeeklySummary"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "WeeklySummary_userId_weekStart_idx" ON "WeeklySummary"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySummary_userId_campusId_weekStart_key" ON "WeeklySummary"("userId", "campusId", "weekStart");

-- AddForeignKey
ALTER TABLE "ActivityRead" ADD CONSTRAINT "ActivityRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySummary" ADD CONSTRAINT "WeeklySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
