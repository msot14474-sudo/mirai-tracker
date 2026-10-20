-- A batch can contain subjects from both tracks. Keep every offering ID and its teaching history.
CREATE TYPE "AcademicTrack" AS ENUM ('MIRAI', 'UNIVERSITY');
ALTER TABLE "SubjectOffering" ADD COLUMN "academicTrack" "AcademicTrack";
UPDATE "SubjectOffering" o SET "academicTrack" = CASE
  WHEN regexp_replace(lower(t.code), '[ _-]', '', 'g') IN ('university', 'universitytrack')
    OR regexp_replace(lower(t.name), '[ _-]', '', 'g') IN ('university', 'universitytrack') THEN 'UNIVERSITY'::"AcademicTrack"
  WHEN regexp_replace(lower(t.code), '[ _-]', '', 'g') IN ('mirai', 'miraitrack')
    OR regexp_replace(lower(t.name), '[ _-]', '', 'g') IN ('mirai', 'miraitrack') THEN 'MIRAI'::"AcademicTrack"
  -- User confirmed First Year A's existing Computer Science label belongs to Mirai.
  WHEN regexp_replace(lower(b.name), '[ _-]', '', 'g') = 'firstyeara'
    AND (upper(t.code) IN ('CS', 'CSE') OR lower(t.name) = 'computer science') THEN 'MIRAI'::"AcademicTrack"
  ELSE NULL END
FROM "Batch" b JOIN "Track" t ON t.id = b."trackId" WHERE o."batchId" = b.id;
-- Unrecognized legacy values stay unassigned for explicit correction, never guessed.
ALTER TABLE "SubjectOffering" ALTER COLUMN "academicTrack" SET DEFAULT 'MIRAI';
CREATE INDEX "SubjectOffering_academicTrack_batchId_idx" ON "SubjectOffering"("academicTrack", "batchId");
