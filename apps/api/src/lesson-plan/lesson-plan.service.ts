import {
  AuditAction,
  ImportType,
  JobStatus,
  LessonPlanStatus,
  Prisma,
  SubjectOfferingStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { parseLessonPlanFile } from './lesson-plan.parser';
import {
  ExamScopeInput,
  UpdateTopicInput,
  UpdateUnitInput,
} from './lesson-plan.schemas';
import {
  ImportIssue,
  LessonPlanPreview,
  LessonPlanRow,
  UploadedImportFile,
} from './lesson-plan.types';

@Injectable()
export class LessonPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async listOfferings(user: AuthenticatedUser, campusId?: string) {
    const where = campusId
      ? {
          AND: [
            this.offeringScope(user),
            { batch: { semester: { campusId } } },
          ],
        }
      : this.offeringScope(user);
    const offerings = await this.prisma.subjectOffering.findMany({
      where,
      include: {
        subject: { select: { id: true, code: true, name: true } },
        batch: {
          select: {
            id: true,
            code: true,
            name: true,
            semester: {
              select: {
                id: true,
                name: true,
                campus: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        lessonPlans: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            units: {
              include: { topics: { select: { plannedMinutes: true } } },
            },
          },
        },
      },
      orderBy: [
        { batch: { semester: { campus: { name: 'asc' } } } },
        { batch: { code: 'asc' } },
        { subject: { code: 'asc' } },
      ],
    });
    return offerings.map((offering) => {
      const plan = offering.lessonPlans[0];
      const topics = plan?.units.flatMap((unit) => unit.topics) ?? [];
      return {
        id: offering.id,
        subject: offering.subject,
        batch: offering.batch,
        plan: plan
          ? {
              id: plan.id,
              version: plan.version,
              status: plan.status,
              units: plan.units.length,
              topics: topics.length,
              totalPlannedMinutes: topics.reduce(
                (total, topic) => total + topic.plannedMinutes,
                0,
              ),
            }
          : null,
      };
    });
  }

  async offering(offeringId: string, user: AuthenticatedUser) {
    await this.access.assertCanManageOffering(user, offeringId);
    const offering = await this.requireOffering(offeringId);
    return serializeOffering(offering);
  }

  async preview(
    offeringId: string,
    file: UploadedImportFile,
    user: AuthenticatedUser,
  ) {
    await this.access.assertCanManageOffering(user, offeringId);
    const offering = await this.requireOffering(offeringId);
    const preview = await parseLessonPlanFile(file);
    this.validateExamNames(preview, offering.batch.semester.examWindows);
    return publicPreview(preview);
  }

  async import(
    offeringId: string,
    file: UploadedImportFile,
    user: AuthenticatedUser,
  ) {
    await this.access.assertCanManageOffering(user, offeringId);
    const offering = await this.requireOffering(offeringId);
    const preview = await parseLessonPlanFile(file);
    this.validateExamNames(preview, offering.batch.semester.examWindows);
    if (!preview.valid) {
      throw new BadRequestException({
        message: 'Fix the lesson-plan file before importing it.',
        preview: publicPreview(preview),
      });
    }

    const created = await this.prisma.$transaction(
      async (transaction) => {
        const latest = await transaction.lessonPlan.aggregate({
          where: { offeringId },
          _max: { version: true },
        });
        const plan = await transaction.lessonPlan.create({
          data: {
            offeringId,
            version: (latest._max.version ?? 0) + 1,
            status: LessonPlanStatus.DRAFT,
            uploadedById: user.id,
            fileName: file.originalname.slice(0, 255),
            units: {
              create: groupUnits(preview.rows).map((unit) => ({
                sequence: unit.sequence,
                title: unit.title,
                description: unit.description,
                topics: {
                  create: unit.topics.map((topic) => ({
                    sequence: topic.topicSequence,
                    title: topic.topicTitle,
                    description: topic.topicDescription,
                    plannedMinutes: topic.plannedMinutes,
                  })),
                },
              })),
            },
          },
          include: { units: { include: { topics: true } } },
        });
        const examIds = new Map(
          offering.batch.semester.examWindows.map((exam) => [
            exam.name.toLocaleLowerCase('en-US'),
            exam.id,
          ]),
        );
        const topicIds = new Map(
          plan.units.flatMap((unit) =>
            unit.topics.map(
              (topic) =>
                [`${unit.sequence}:${topic.sequence}`, topic.id] as const,
            ),
          ),
        );
        const scopes = preview.rows.flatMap((row) =>
          row.examNames.map((name) => ({
            examWindowId: requiredMapValue(
              examIds,
              name.toLocaleLowerCase('en-US'),
            ),
            topicId: requiredMapValue(
              topicIds,
              `${row.unitSequence}:${row.topicSequence}`,
            ),
          })),
        );
        if (scopes.length) {
          await transaction.examScope.createMany({
            data: scopes,
            skipDuplicates: true,
          });
        }
        const job = await transaction.importJob.create({
          data: {
            type: ImportType.LESSON_PLANS,
            status: JobStatus.COMPLETED,
            uploadedById: user.id,
            fileName: file.originalname.slice(0, 255),
            totalRows: preview.counts.rows,
            successfulRows: preview.counts.rows,
            failedRows: 0,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: user.id,
            campusId: offering.batch.semester.campus.id,
            action: AuditAction.IMPORT,
            entityType: 'LessonPlan',
            entityId: plan.id,
            after: preview.counts,
            metadata: {
              offeringId,
              importJobId: job.id,
              fileName: file.originalname,
            },
          },
        });
        return plan;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    return {
      planId: created.id,
      version: created.version,
      preview: publicPreview(preview),
    };
  }

  async updateUnit(
    unitId: string,
    input: UpdateUnitInput,
    user: AuthenticatedUser,
  ) {
    const unit = await this.requireUnit(unitId);
    await this.access.assertCanManageOffering(user, unit.lessonPlan.offeringId);
    assertDraft(unit.lessonPlan.status);
    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: input,
    });
    await this.auditChange(
      user,
      unit.lessonPlan.offering.batch.semester.campusId,
      'Unit',
      unit.id,
      unit,
      updated,
    );
    return updated;
  }

  async updateTopic(
    topicId: string,
    input: UpdateTopicInput,
    user: AuthenticatedUser,
  ) {
    const topic = await this.requireTopic(topicId);
    await this.access.assertCanManageOffering(
      user,
      topic.unit.lessonPlan.offeringId,
    );
    assertDraft(topic.unit.lessonPlan.status);
    const updated = await this.prisma.topic.update({
      where: { id: topicId },
      data: input,
    });
    await this.auditChange(
      user,
      topic.unit.lessonPlan.offering.batch.semester.campusId,
      'Topic',
      topic.id,
      topic,
      updated,
    );
    return {
      ...updated,
      currentCompletionPercentage: Number(updated.currentCompletionPercentage),
    };
  }

  async setExamScope(
    planId: string,
    examWindowId: string,
    input: ExamScopeInput,
    user: AuthenticatedUser,
  ) {
    const plan = await this.requirePlan(planId);
    await this.access.assertCanManageOffering(user, plan.offeringId);
    assertDraft(plan.status);
    const exam = plan.offering.batch.semester.examWindows.find(
      (candidate) => candidate.id === examWindowId,
    );
    if (!exam) {
      throw new BadRequestException(
        'The exam window must belong to the lesson plan semester.',
      );
    }
    const topicIds = [...new Set(input.topicIds)];
    const matchingTopics = topicIds.length
      ? await this.prisma.topic.count({
          where: { id: { in: topicIds }, unit: { lessonPlanId: planId } },
        })
      : 0;
    if (matchingTopics !== topicIds.length) {
      throw new BadRequestException(
        'Every exam-scope topic must belong to this lesson plan.',
      );
    }
    const previous = await this.prisma.examScope.findMany({
      where: { examWindowId, topic: { unit: { lessonPlanId: planId } } },
      select: { topicId: true },
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.examScope.deleteMany({
        where: { examWindowId, topic: { unit: { lessonPlanId: planId } } },
      });
      if (topicIds.length) {
        await transaction.examScope.createMany({
          data: topicIds.map((topicId) => ({ examWindowId, topicId })),
        });
      }
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: plan.offering.batch.semester.campusId,
          action: AuditAction.UPDATE,
          entityType: 'ExamScope',
          entityId: examWindowId,
          before: { topicIds: previous.map((scope) => scope.topicId) },
          after: { topicIds },
          metadata: { planId, examName: exam.name },
        },
      });
    });
    return { examWindowId, topicIds };
  }

  async activate(planId: string, user: AuthenticatedUser) {
    const plan = await this.requirePlan(planId);
    await this.access.assertCanManageOffering(user, plan.offeringId);
    if (plan.status === LessonPlanStatus.ACTIVE)
      return { id: plan.id, status: plan.status };
    assertDraft(plan.status);
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.lessonPlan.updateMany({
        where: {
          offeringId: plan.offeringId,
          status: LessonPlanStatus.ACTIVE,
          id: { not: plan.id },
        },
        data: { status: LessonPlanStatus.SUPERSEDED },
      });
      const active = await transaction.lessonPlan.update({
        where: { id: plan.id },
        data: {
          status: LessonPlanStatus.ACTIVE,
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });
      await transaction.subjectOffering.update({
        where: { id: plan.offeringId },
        data: { status: SubjectOfferingStatus.ACTIVE },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: plan.offering.batch.semester.campusId,
          action: AuditAction.UPDATE,
          entityType: 'LessonPlan',
          entityId: plan.id,
          before: { status: plan.status },
          after: { status: LessonPlanStatus.ACTIVE },
          metadata: { offeringId: plan.offeringId, version: plan.version },
        },
      });
      return active;
    });
    return { id: updated.id, status: updated.status };
  }

  private offeringScope(
    user: AuthenticatedUser,
  ): Prisma.SubjectOfferingWhereInput {
    if (this.access.isGlobalManager(user)) return {};
    const campusIds = user.roles
      .filter((role) => role.role === UserRole.CAMPUS_MANAGER && role.campusId)
      .map((role) => role.campusId!);
    const scopes: Prisma.SubjectOfferingWhereInput[] = [];
    if (campusIds.length) {
      scopes.push({ batch: { semester: { campusId: { in: campusIds } } } });
    }
    if (
      user.staffProfileId &&
      user.roles.some((role) => role.role === UserRole.FACULTY)
    ) {
      scopes.push({
        faculty: {
          some: { staffProfileId: user.staffProfileId, active: true },
        },
      });
    }
    return scopes.length ? { OR: scopes } : { id: { in: [] } };
  }

  private async requireOffering(offeringId: string) {
    const offering = await this.prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        batch: {
          include: {
            semester: {
              include: {
                campus: { select: { id: true, code: true, name: true } },
                examWindows: { orderBy: { startDate: 'asc' } },
              },
            },
          },
        },
        lessonPlans: {
          orderBy: { version: 'desc' },
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } },
            approvedBy: { select: { id: true, name: true, email: true } },
            units: {
              orderBy: { sequence: 'asc' },
              include: {
                topics: {
                  orderBy: { sequence: 'asc' },
                  include: {
                    examScopes: {
                      include: {
                        examWindow: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!offering) throw new NotFoundException('Subject offering not found.');
    return offering;
  }

  private async requirePlan(planId: string) {
    const plan = await this.prisma.lessonPlan.findUnique({
      where: { id: planId },
      include: {
        offering: {
          include: {
            batch: {
              include: { semester: { include: { examWindows: true } } },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Lesson plan not found.');
    return plan;
  }

  private async requireUnit(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        lessonPlan: {
          include: {
            offering: { include: { batch: { include: { semester: true } } } },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Lesson-plan unit not found.');
    return unit;
  }

  private async requireTopic(topicId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        unit: {
          include: {
            lessonPlan: {
              include: {
                offering: {
                  include: { batch: { include: { semester: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!topic) throw new NotFoundException('Lesson-plan topic not found.');
    return topic;
  }

  private validateExamNames(
    preview: LessonPlanPreview,
    examWindows: Array<{ name: string }>,
  ) {
    const names = new Set(
      examWindows.map((exam) => exam.name.toLocaleLowerCase('en-US')),
    );
    for (const row of preview.rows) {
      for (const examName of row.examNames) {
        if (!names.has(examName.toLocaleLowerCase('en-US'))) {
          preview.issues.push({
            sheet: 'Lesson Plan',
            rowNumber: row.rowNumber,
            columnName: 'exam_names',
            submittedValue: examName,
            errorMessage: 'Exam name does not match this semester.',
          });
        }
      }
    }
    preview.valid = preview.rows.length > 0 && preview.issues.length === 0;
  }

  private auditChange(
    user: AuthenticatedUser,
    campusId: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    return this.prisma.auditEvent.create({
      data: {
        actorId: user.id,
        campusId,
        action: AuditAction.UPDATE,
        entityType,
        entityId,
        before: toJson(before),
        after: toJson(after),
      },
    });
  }
}

function groupUnits(rows: LessonPlanRow[]) {
  return [...new Set(rows.map((row) => row.unitSequence))].map((sequence) => {
    const topics = rows.filter((row) => row.unitSequence === sequence);
    const first = topics[0]!;
    return {
      sequence,
      title: first.unitTitle,
      description: first.unitDescription,
      topics,
    };
  });
}

function publicPreview(preview: LessonPlanPreview) {
  return {
    valid: preview.valid,
    fileName: preview.fileName,
    counts: preview.counts,
    issues: preview.issues,
  };
}

function serializeOffering(
  offering: Awaited<ReturnType<LessonPlanService['requireOffering']>>,
) {
  const plans = offering.lessonPlans.map((plan) => {
    const units = plan.units.map((unit) => ({
      id: unit.id,
      sequence: unit.sequence,
      title: unit.title,
      description: unit.description,
      topics: unit.topics.map((topic) => ({
        id: topic.id,
        sequence: topic.sequence,
        title: topic.title,
        description: topic.description,
        plannedMinutes: topic.plannedMinutes,
        status: topic.status,
        currentCompletionPercentage: Number(topic.currentCompletionPercentage),
        examScopes: topic.examScopes.map((scope) => scope.examWindow),
      })),
    }));
    const topics = units.flatMap((unit) => unit.topics);
    return {
      id: plan.id,
      version: plan.version,
      status: plan.status,
      fileName: plan.fileName,
      uploadedBy: plan.uploadedBy,
      approvedBy: plan.approvedBy,
      approvedAt: plan.approvedAt,
      createdAt: plan.createdAt,
      units,
      summary: {
        units: units.length,
        topics: topics.length,
        totalPlannedMinutes: topics.reduce(
          (total, topic) => total + topic.plannedMinutes,
          0,
        ),
      },
    };
  });
  return {
    id: offering.id,
    subject: offering.subject,
    batch: {
      id: offering.batch.id,
      code: offering.batch.code,
      name: offering.batch.name,
    },
    semester: {
      id: offering.batch.semester.id,
      name: offering.batch.semester.name,
      campus: offering.batch.semester.campus,
    },
    examWindows: offering.batch.semester.examWindows.map((exam) => ({
      id: exam.id,
      name: exam.name,
      type: exam.type,
      startDate: exam.startDate.toISOString().slice(0, 10),
      endDate: exam.endDate.toISOString().slice(0, 10),
      syllabusDeadline: exam.syllabusDeadline.toISOString().slice(0, 10),
    })),
    plans: plans.map(({ units: _units, ...plan }) => plan),
    plan: plans[0] ?? null,
  };
}

function assertDraft(status: LessonPlanStatus) {
  if (status !== LessonPlanStatus.DRAFT) {
    throw new ConflictException(
      'Only a draft lesson plan can be edited. Import a new version first.',
    );
  }
}

function requiredMapValue(map: Map<string, string>, key: string) {
  const value = map.get(key);
  if (!value) throw new Error(`Lesson-plan relationship is missing: ${key}`);
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type PublicLessonPlanPreview = Omit<LessonPlanPreview, 'rows'>;
export type LessonPlanImportIssue = ImportIssue;
