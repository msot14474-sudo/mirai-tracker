CREATE TABLE "LectureReview" (
  "id" UUID NOT NULL,
  "studentProfileId" UUID NOT NULL,
  "scheduledSessionId" UUID NOT NULL,
  "understood" BOOLEAN NOT NULL,
  "unclearTopics" VARCHAR(2000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LectureReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LectureReview_explanation_check" CHECK (("understood" = TRUE AND "unclearTopics" IS NULL) OR ("understood" = FALSE AND "unclearTopics" IS NOT NULL AND length(btrim("unclearTopics")) > 0)),
  CONSTRAINT "LectureReview_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LectureReview_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LectureReview_studentProfileId_scheduledSessionId_key" ON "LectureReview"("studentProfileId", "scheduledSessionId");
CREATE INDEX "LectureReview_scheduledSessionId_idx" ON "LectureReview"("scheduledSessionId");
