-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROGRAM_MANAGER', 'CAMPUS_MANAGER', 'FACULTY', 'STUDENT');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('REGULAR', 'VISITING');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SemesterStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkingSaturdayRule" AS ENUM ('ALL', 'NONE', 'SECOND_AND_FOURTH');

-- CreateEnum
CREATE TYPE "CalendarDayType" AS ENUM ('HOLIDAY', 'EVENT', 'EXTRA_WORKING_DAY', 'CAMPUS_CLOSED');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('SESSIONAL', 'MID_TERM', 'PUT', 'END_TERM', 'OTHER');

-- CreateEnum
CREATE TYPE "SubjectOfferingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FacultyAssignmentType" AS ENUM ('PRIMARY', 'CO_FACULTY', 'VISITING');

-- CreateEnum
CREATE TYPE "LessonPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ScheduledSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'IN_PROGRESS', 'SKIPPED', 'MERGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionLogStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'SKIPPED', 'MERGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('NOT_APPLICABLE', 'NOT_ASSIGNED', 'ASSIGNED', 'PARTIAL', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScheduleCalculationReason" AS ENUM ('INITIAL', 'CALENDAR_CHANGE', 'TIMETABLE_CHANGE', 'SESSION_CANCELLED', 'LESSON_PLAN_CHANGE', 'MANUAL_RECALCULATION');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('ON_TRACK', 'TIGHT', 'DANGER', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('FACULTY_MISSED_LOG', 'CAMPUS_MANAGER_ESCALATION');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'TELEGRAM', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('CAMPUSES', 'USERS', 'SEMESTERS', 'CALENDAR', 'BATCHES', 'SUBJECTS', 'TIMETABLE', 'LESSON_PLANS', 'FULL_SEMESTER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'VALIDATED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('FULL_DATA', 'CAMPUS_PROGRESS', 'SUBJECT_PROGRESS', 'VISITING_FACULTY_HONORARIUM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE', 'IMPORT', 'EXPORT', 'LOGIN', 'ROLE_CHANGE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32),
    "externalAuthId" VARCHAR(255),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "campusId" UUID,
    "scopeKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "employeeCode" VARCHAR(64) NOT NULL,
    "staffType" "StaffType" NOT NULL DEFAULT 'REGULAR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "studentCode" VARCHAR(64) NOT NULL,
    "batchId" UUID NOT NULL,
    "enrollmentStatus" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workingSaturdayRule" "WorkingSaturdayRule" NOT NULL DEFAULT 'NONE',
    "defaultOnTrackThreshold" DECIMAL(6,3) NOT NULL DEFAULT 1.15,
    "defaultTightThreshold" DECIMAL(6,3) NOT NULL DEFAULT 1.00,
    "status" "SemesterStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDayOverride" (
    "id" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "CalendarDayType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "teachingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamWindow" (
    "id" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "ExamType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "syllabusDeadline" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExamWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectOffering" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "targetFinishDate" DATE NOT NULL,
    "onTrackThreshold" DECIMAL(6,3),
    "tightThreshold" DECIMAL(6,3),
    "status" "SubjectOfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyAssignment" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "staffProfileId" UUID NOT NULL,
    "type" "FacultyAssignmentType" NOT NULL DEFAULT 'PRIMARY',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FacultyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "facultyAssignmentId" UUID,
    "weekday" INTEGER NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledSession" (
    "id" UUID NOT NULL,
    "sourceKey" VARCHAR(255) NOT NULL,
    "offeringId" UUID NOT NULL,
    "timetableEntryId" UUID,
    "facultyAssignmentId" UUID,
    "sessionDate" DATE NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ScheduledSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isExtraSession" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" TEXT,
    "mergedIntoSessionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduledSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "LessonPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "uploadedById" UUID NOT NULL,
    "approvedById" UUID,
    "fileName" VARCHAR(255),
    "storageKey" VARCHAR(512),
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "lessonPlanId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "plannedMinutes" INTEGER NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentCompletionPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "skipReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamScope" (
    "id" UUID NOT NULL,
    "examWindowId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicScheduleVersion" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" "ScheduleCalculationReason" NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicSchedule" (
    "id" UUID NOT NULL,
    "scheduleVersionId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "plannedStartDate" DATE NOT NULL,
    "plannedFinishDate" DATE NOT NULL,
    "allocatedMinutes" INTEGER NOT NULL,

    CONSTRAINT "TopicSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" UUID NOT NULL,
    "scheduledSessionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "SessionLogStatus" NOT NULL,
    "overallCompletionPercentage" DECIMAL(5,2),
    "coveredSummary" TEXT NOT NULL,
    "leftOverSummary" TEXT,
    "carryForwardTopicId" UUID,
    "classworkStatus" "WorkStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "homeworkStatus" "WorkStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "notes" TEXT,
    "loggedById" UUID NOT NULL,
    "loggedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTopicUpdate" (
    "id" UUID NOT NULL,
    "sessionLogId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "completionBeforePercentage" DECIMAL(5,2) NOT NULL,
    "completionAfterPercentage" DECIMAL(5,2) NOT NULL,
    "minutesUsed" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTopicUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressSnapshot" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "asOfDate" DATE NOT NULL,
    "calculationVersion" INTEGER NOT NULL,
    "hoursInScopeMinutes" DECIMAL(12,2) NOT NULL,
    "coveredMinutes" DECIMAL(12,2) NOT NULL,
    "remainingMinutes" DECIMAL(12,2) NOT NULL,
    "availableMinutes" DECIMAL(12,2) NOT NULL,
    "coveragePercentage" DECIMAL(7,4) NOT NULL,
    "bufferRatio" DECIMAL(10,4),
    "paceMinutes" DECIMAL(12,2) NOT NULL,
    "status" "ProgressStatus" NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissedLogAlert" (
    "id" UUID NOT NULL,
    "scheduledSessionId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "recipientUserId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "deduplicationKey" VARCHAR(255) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MissedLogAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "alertId" UUID,
    "recipientUserId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "providerMessageId" VARCHAR(255),
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'UPLOADED',
    "campusId" UUID,
    "uploadedById" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(512),
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successfulRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "columnName" VARCHAR(160),
    "submittedValue" TEXT,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" UUID NOT NULL,
    "type" "ExportType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PROCESSING',
    "requestedById" UUID NOT NULL,
    "storageKey" VARCHAR(512),
    "errorMessage" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "campusId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" VARCHAR(120) NOT NULL,
    "entityId" VARCHAR(120) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalAuthId_key" ON "User"("externalAuthId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "RoleAssignment_campusId_role_idx" ON "RoleAssignment"("campusId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_role_scopeKey_key" ON "RoleAssignment"("userId", "role", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_employeeCode_key" ON "StaffProfile"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_studentCode_key" ON "StudentProfile"("studentCode");

-- CreateIndex
CREATE INDEX "StudentProfile_batchId_enrollmentStatus_idx" ON "StudentProfile"("batchId", "enrollmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_code_key" ON "Campus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_name_key" ON "Campus"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Track_code_key" ON "Track"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Track_name_key" ON "Track"("name");

-- CreateIndex
CREATE INDEX "Semester_campusId_startDate_endDate_idx" ON "Semester"("campusId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_campusId_name_key" ON "Semester"("campusId", "name");

-- CreateIndex
CREATE INDEX "CalendarDayOverride_semesterId_type_date_idx" ON "CalendarDayOverride"("semesterId", "type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarDayOverride_semesterId_date_key" ON "CalendarDayOverride"("semesterId", "date");

-- CreateIndex
CREATE INDEX "ExamWindow_semesterId_startDate_idx" ON "ExamWindow"("semesterId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExamWindow_semesterId_name_key" ON "ExamWindow"("semesterId", "name");

-- CreateIndex
CREATE INDEX "Batch_trackId_semesterId_idx" ON "Batch"("trackId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_semesterId_code_key" ON "Batch"("semesterId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");

-- CreateIndex
CREATE INDEX "SubjectOffering_batchId_status_idx" ON "SubjectOffering"("batchId", "status");

-- CreateIndex
CREATE INDEX "SubjectOffering_targetFinishDate_idx" ON "SubjectOffering"("targetFinishDate");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectOffering_batchId_subjectId_key" ON "SubjectOffering"("batchId", "subjectId");

-- CreateIndex
CREATE INDEX "FacultyAssignment_staffProfileId_active_idx" ON "FacultyAssignment"("staffProfileId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyAssignment_offeringId_staffProfileId_startDate_key" ON "FacultyAssignment"("offeringId", "staffProfileId", "startDate");

-- CreateIndex
CREATE INDEX "TimetableEntry_weekday_active_idx" ON "TimetableEntry"("weekday", "active");

-- CreateIndex
CREATE INDEX "TimetableEntry_facultyAssignmentId_weekday_idx" ON "TimetableEntry"("facultyAssignmentId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_offeringId_weekday_startTime_effectiveFrom_key" ON "TimetableEntry"("offeringId", "weekday", "startTime", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledSession_sourceKey_key" ON "ScheduledSession"("sourceKey");

-- CreateIndex
CREATE INDEX "ScheduledSession_sessionDate_status_idx" ON "ScheduledSession"("sessionDate", "status");

-- CreateIndex
CREATE INDEX "ScheduledSession_facultyAssignmentId_sessionDate_idx" ON "ScheduledSession"("facultyAssignmentId", "sessionDate");

-- CreateIndex
CREATE INDEX "ScheduledSession_offeringId_sessionDate_idx" ON "ScheduledSession"("offeringId", "sessionDate");

-- CreateIndex
CREATE INDEX "LessonPlan_offeringId_status_idx" ON "LessonPlan"("offeringId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPlan_offeringId_version_key" ON "LessonPlan"("offeringId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_lessonPlanId_sequence_key" ON "Unit"("lessonPlanId", "sequence");

-- CreateIndex
CREATE INDEX "Topic_unitId_status_idx" ON "Topic"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_unitId_sequence_key" ON "Topic"("unitId", "sequence");

-- CreateIndex
CREATE INDEX "ExamScope_topicId_idx" ON "ExamScope"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamScope_examWindowId_topicId_key" ON "ExamScope"("examWindowId", "topicId");

-- CreateIndex
CREATE INDEX "TopicScheduleVersion_offeringId_calculatedAt_idx" ON "TopicScheduleVersion"("offeringId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TopicScheduleVersion_offeringId_version_key" ON "TopicScheduleVersion"("offeringId", "version");

-- CreateIndex
CREATE INDEX "TopicSchedule_topicId_plannedFinishDate_idx" ON "TopicSchedule"("topicId", "plannedFinishDate");

-- CreateIndex
CREATE UNIQUE INDEX "TopicSchedule_scheduleVersionId_topicId_key" ON "TopicSchedule"("scheduleVersionId", "topicId");

-- CreateIndex
CREATE INDEX "SessionLog_scheduledSessionId_loggedAt_idx" ON "SessionLog"("scheduledSessionId", "loggedAt");

-- CreateIndex
CREATE INDEX "SessionLog_loggedById_loggedAt_idx" ON "SessionLog"("loggedById", "loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionLog_scheduledSessionId_revision_key" ON "SessionLog"("scheduledSessionId", "revision");

-- CreateIndex
CREATE INDEX "SessionTopicUpdate_topicId_createdAt_idx" ON "SessionTopicUpdate"("topicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTopicUpdate_sessionLogId_topicId_key" ON "SessionTopicUpdate"("sessionLogId", "topicId");

-- CreateIndex
CREATE INDEX "ProgressSnapshot_offeringId_calculatedAt_idx" ON "ProgressSnapshot"("offeringId", "calculatedAt");

-- CreateIndex
CREATE INDEX "ProgressSnapshot_status_asOfDate_idx" ON "ProgressSnapshot"("status", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSnapshot_offeringId_asOfDate_calculationVersion_key" ON "ProgressSnapshot"("offeringId", "asOfDate", "calculationVersion");

-- CreateIndex
CREATE UNIQUE INDEX "MissedLogAlert_deduplicationKey_key" ON "MissedLogAlert"("deduplicationKey");

-- CreateIndex
CREATE INDEX "MissedLogAlert_status_dueAt_idx" ON "MissedLogAlert"("status", "dueAt");

-- CreateIndex
CREATE INDEX "MissedLogAlert_scheduledSessionId_type_idx" ON "MissedLogAlert"("scheduledSessionId", "type");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_scheduledAt_idx" ON "NotificationDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_alertId_recipientUserId_channel_attemp_key" ON "NotificationDelivery"("alertId", "recipientUserId", "channel", "attemptNumber");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_campusId_type_idx" ON "ImportJob"("campusId", "type");

-- CreateIndex
CREATE INDEX "ImportError_importJobId_rowNumber_idx" ON "ImportError"("importJobId", "rowNumber");

-- CreateIndex
CREATE INDEX "ExportJob_requestedById_createdAt_idx" ON "ExportJob"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_occurredAt_idx" ON "AuditEvent"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_campusId_occurredAt_idx" ON "AuditEvent"("campusId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_occurredAt_idx" ON "AuditEvent"("actorId", "occurredAt");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDayOverride" ADD CONSTRAINT "CalendarDayOverride_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamWindow" ADD CONSTRAINT "ExamWindow_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyAssignment" ADD CONSTRAINT "FacultyAssignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyAssignment" ADD CONSTRAINT "FacultyAssignment_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_facultyAssignmentId_fkey" FOREIGN KEY ("facultyAssignmentId") REFERENCES "FacultyAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_timetableEntryId_fkey" FOREIGN KEY ("timetableEntryId") REFERENCES "TimetableEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_facultyAssignmentId_fkey" FOREIGN KEY ("facultyAssignmentId") REFERENCES "FacultyAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_mergedIntoSessionId_fkey" FOREIGN KEY ("mergedIntoSessionId") REFERENCES "ScheduledSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamScope" ADD CONSTRAINT "ExamScope_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "ExamWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamScope" ADD CONSTRAINT "ExamScope_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicScheduleVersion" ADD CONSTRAINT "TopicScheduleVersion_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicSchedule" ADD CONSTRAINT "TopicSchedule_scheduleVersionId_fkey" FOREIGN KEY ("scheduleVersionId") REFERENCES "TopicScheduleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicSchedule" ADD CONSTRAINT "TopicSchedule_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_carryForwardTopicId_fkey" FOREIGN KEY ("carryForwardTopicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTopicUpdate" ADD CONSTRAINT "SessionTopicUpdate_sessionLogId_fkey" FOREIGN KEY ("sessionLogId") REFERENCES "SessionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTopicUpdate" ADD CONSTRAINT "SessionTopicUpdate_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissedLogAlert" ADD CONSTRAINT "MissedLogAlert_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissedLogAlert" ADD CONSTRAINT "MissedLogAlert_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "MissedLogAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express in schema.prisma.
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_scope_check" CHECK (
    (("role" IN ('ADMIN', 'PROGRAM_MANAGER')) AND "campusId" IS NULL AND "scopeKey" = 'GLOBAL')
    OR
    (("role" IN ('CAMPUS_MANAGER', 'FACULTY', 'STUDENT')) AND "campusId" IS NOT NULL AND "scopeKey" = "campusId"::text)
);

ALTER TABLE "Semester" ADD CONSTRAINT "Semester_date_range_check" CHECK ("endDate" >= "startDate");
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_threshold_order_check" CHECK (
    "defaultOnTrackThreshold" > 0
    AND "defaultTightThreshold" > 0
    AND "defaultOnTrackThreshold" >= "defaultTightThreshold"
);

ALTER TABLE "ExamWindow" ADD CONSTRAINT "ExamWindow_date_range_check" CHECK (
    "endDate" >= "startDate" AND "syllabusDeadline" <= "endDate"
);

ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_threshold_pair_check" CHECK (
    ("onTrackThreshold" IS NULL AND "tightThreshold" IS NULL)
    OR
    ("onTrackThreshold" > 0 AND "tightThreshold" > 0 AND "onTrackThreshold" >= "tightThreshold")
);

ALTER TABLE "FacultyAssignment" ADD CONSTRAINT "FacultyAssignment_date_range_check" CHECK (
    "endDate" IS NULL OR "endDate" >= "startDate"
);

ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7);
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_time_range_check" CHECK ("endTime" > "startTime");
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_effective_range_check" CHECK (
    "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"
);

ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_time_range_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_not_merged_into_self_check" CHECK (
    "mergedIntoSessionId" IS NULL OR "mergedIntoSessionId" <> "id"
);

ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_version_check" CHECK ("version" > 0);
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_planned_minutes_check" CHECK ("plannedMinutes" > 0);
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_completion_percentage_check" CHECK (
    "currentCompletionPercentage" BETWEEN 0 AND 100
);

ALTER TABLE "TopicScheduleVersion" ADD CONSTRAINT "TopicScheduleVersion_version_check" CHECK ("version" > 0);
ALTER TABLE "TopicSchedule" ADD CONSTRAINT "TopicSchedule_date_range_check" CHECK (
    "plannedFinishDate" >= "plannedStartDate"
);
ALTER TABLE "TopicSchedule" ADD CONSTRAINT "TopicSchedule_allocated_minutes_check" CHECK ("allocatedMinutes" > 0);

ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_revision_check" CHECK ("revision" > 0);
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_completion_percentage_check" CHECK (
    "overallCompletionPercentage" IS NULL OR "overallCompletionPercentage" BETWEEN 0 AND 100
);

ALTER TABLE "SessionTopicUpdate" ADD CONSTRAINT "SessionTopicUpdate_completion_before_check" CHECK (
    "completionBeforePercentage" BETWEEN 0 AND 100
);
ALTER TABLE "SessionTopicUpdate" ADD CONSTRAINT "SessionTopicUpdate_completion_after_check" CHECK (
    "completionAfterPercentage" BETWEEN 0 AND 100
);
ALTER TABLE "SessionTopicUpdate" ADD CONSTRAINT "SessionTopicUpdate_progress_direction_check" CHECK (
    "completionAfterPercentage" >= "completionBeforePercentage"
);
ALTER TABLE "SessionTopicUpdate" ADD CONSTRAINT "SessionTopicUpdate_minutes_used_check" CHECK (
    "minutesUsed" IS NULL OR "minutesUsed" >= 0
);

ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_version_check" CHECK ("calculationVersion" > 0);
ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_nonnegative_values_check" CHECK (
    "hoursInScopeMinutes" >= 0
    AND "coveredMinutes" >= 0
    AND "remainingMinutes" >= 0
    AND "availableMinutes" >= 0
    AND "paceMinutes" >= 0
    AND ("bufferRatio" IS NULL OR "bufferRatio" >= 0)
);
ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_coverage_percentage_check" CHECK (
    "coveragePercentage" BETWEEN 0 AND 100
);

ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_attempt_number_check" CHECK ("attemptNumber" > 0);
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_row_counts_check" CHECK (
    "totalRows" >= 0
    AND "successfulRows" >= 0
    AND "failedRows" >= 0
    AND "successfulRows" + "failedRows" <= "totalRows"
);
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_row_number_check" CHECK ("rowNumber" > 0);
