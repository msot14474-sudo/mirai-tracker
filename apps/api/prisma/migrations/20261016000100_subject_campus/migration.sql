ALTER TABLE "Subject" ADD COLUMN "campusId" UUID;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Subject_campusId_idx" ON "Subject"("campusId");
ALTER TABLE "ExportJob" ADD COLUMN "campusId" UUID;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
