-- CreateTable
CREATE TABLE "VisitingFacultyRate" (
    "id" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "staffProfileId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "ratePerClass" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitingFacultyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitingFacultyLedger" (
    "id" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "staffProfileId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "reference" VARCHAR(200),
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitingFacultyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemesterDataImport" (
    "id" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "uploadedById" UUID NOT NULL,
    "fileNames" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemesterDataImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitingFacultyRate_campusId_staffProfileId_effectiveFrom_key" ON "VisitingFacultyRate"("campusId", "staffProfileId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "VisitingFacultyLedger_semesterId_staffProfileId_date_idx" ON "VisitingFacultyLedger"("semesterId", "staffProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "VisitingFacultyLedger_semesterId_reference_key" ON "VisitingFacultyLedger"("semesterId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterDataImport_semesterId_fingerprint_key" ON "SemesterDataImport"("semesterId", "fingerprint");

-- AddForeignKey
ALTER TABLE "VisitingFacultyRate" ADD CONSTRAINT "VisitingFacultyRate_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitingFacultyRate" ADD CONSTRAINT "VisitingFacultyRate_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitingFacultyLedger" ADD CONSTRAINT "VisitingFacultyLedger_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitingFacultyLedger" ADD CONSTRAINT "VisitingFacultyLedger_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemesterDataImport" ADD CONSTRAINT "SemesterDataImport_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "VisitingFacultyRate" ADD CONSTRAINT "VisitingFacultyRate_amount_check" CHECK ("ratePerClass" >= 0 AND "ratePerClass" <= 1000000);
ALTER TABLE "VisitingFacultyLedger" ADD CONSTRAINT "VisitingFacultyLedger_amount_check" CHECK ("amount" > 0 AND "amount" <= 1000000);
ALTER TABLE "VisitingFacultyLedger" ADD CONSTRAINT "VisitingFacultyLedger_kind_check" CHECK ("kind" IN ('EXPENSE', 'PAYMENT'));
