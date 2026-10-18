CREATE TABLE "SubjectTeacher" (
  "id" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "campusId" UUID NOT NULL,
  "staffProfileId" UUID NOT NULL,
  CONSTRAINT "SubjectTeacher_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubjectTeacher_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubjectTeacher_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubjectTeacher_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubjectTeacher_subjectId_campusId_key" ON "SubjectTeacher"("subjectId", "campusId");
CREATE INDEX "SubjectTeacher_staffProfileId_idx" ON "SubjectTeacher"("staffProfileId");
