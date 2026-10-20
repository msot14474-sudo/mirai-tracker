import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  isoDateSchema,
  uuidSchema,
} from '../academic-calendar/academic-calendar.schemas';
import {
  formatIsoDate,
  parseIsoDate,
} from '../academic-calendar/calendar-engine';

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(1_000_000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    'Use at most two decimal places.',
  );
export const visitingRateSchema = z.object({
  staffProfileId: uuidSchema,
  effectiveFrom: isoDateSchema,
  ratePerClass: money,
});
export const visitingLedgerSchema = z.object({
  staffProfileId: uuidSchema,
  date: isoDateSchema,
  kind: z.enum(['EXPENSE', 'PAYMENT']),
  category: z.string().trim().min(1).max(80),
  amount: money.refine((v) => v > 0, 'Enter a positive amount.'),
  notes: z.string().trim().max(2000).default(''),
  requestId: uuidSchema.optional(),
});
export const rupees = (v: number) =>
  Math.round((v + Number.EPSILON) * 100) / 100;
export function classRate(
  rates: { effectiveFrom: Date; ratePerClass: unknown }[],
  date: Date,
) {
  const rate = rates
    .filter((r) => r.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  return rate ? Number(rate.ratePerClass) : null;
}

@Injectable()
export class VisitingFacultyService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async semester(id: string, user: AuthenticatedUser) {
    const semester = await this.db.semester.findUnique({
      where: { id },
      include: { campus: true },
    });
    if (!semester) throw new NotFoundException('Semester not found.');
    this.access.assertCanManageCampus(user, semester.campusId);
    return semester;
  }

  private async faculty(
    semesterId: string,
    staffProfileId: string,
    user: AuthenticatedUser,
  ) {
    const semester = await this.semester(semesterId, user);
    const staff = await this.db.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        OR: [
          {
            staffType: 'VISITING',
            user: {
              roleAssignments: {
                some: { campusId: semester.campusId, role: 'FACULTY' },
              },
            },
          },
          {
            facultyAssignments: {
              some: { type: 'VISITING', offering: { batch: { semesterId } } },
            },
          },
          {
            staffType: 'VISITING',
            facultyAssignments: {
              some: { offering: { batch: { semesterId } } },
            },
          },
        ],
      },
    });
    if (!staff)
      throw new BadRequestException(
        'Choose a visiting faculty member assigned to this campus.',
      );
    return semester;
  }

  async saveRate(
    semesterId: string,
    data: z.infer<typeof visitingRateSchema>,
    user: AuthenticatedUser,
  ) {
    const semester = await this.faculty(semesterId, data.staffProfileId, user);
    const effectiveFrom = parseIsoDate(data.effectiveFrom);
    return this.db.$transaction(async (tx) => {
      const key = {
        campusId: semester.campusId,
        staffProfileId: data.staffProfileId,
        effectiveFrom,
      };
      const before = await tx.visitingFacultyRate.findUnique({
        where: { campusId_staffProfileId_effectiveFrom: key },
      });
      const saved = await tx.visitingFacultyRate.upsert({
        where: { campusId_staffProfileId_effectiveFrom: key },
        create: { ...key, ratePerClass: data.ratePerClass },
        update: { ratePerClass: data.ratePerClass },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: semester.campusId,
          action: before ? 'UPDATE' : 'CREATE',
          entityType: 'VisitingFacultyRate',
          entityId: saved.id,
          before: before ? JSON.parse(JSON.stringify(before)) : Prisma.JsonNull,
          after: data,
        },
      });
      return saved;
    });
  }

  async addLedger(
    semesterId: string,
    data: z.infer<typeof visitingLedgerSchema>,
    user: AuthenticatedUser,
  ) {
    const semester = await this.faculty(semesterId, data.staffProfileId, user);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: semester.campus.timezone,
    }).format(new Date());
    if (data.date > today)
      throw new BadRequestException(
        'Record expenses and payments on their actual date, not a future date.',
      );
    const saved = await this.db.$transaction(async (tx) => {
      const { requestId, ...fields } = data;
      const reference = requestId ? `manual:${requestId}` : null;
      if (reference) {
        const existing = await tx.visitingFacultyLedger.findUnique({
          where: { semesterId_reference: { semesterId, reference } },
        });
        if (existing) {
          if (
            existing.staffProfileId !== fields.staffProfileId ||
            Number(existing.amount) !== fields.amount ||
            existing.kind !== fields.kind ||
            formatIsoDate(existing.date) !== fields.date ||
            existing.notes !== fields.notes ||
            existing.category !== fields.category ||
            existing.voided
          )
            throw new BadRequestException(
              'This request was already saved with different details. Open a new entry.',
            );
          return existing;
        }
      }
      const row = await tx.visitingFacultyLedger.create({
        data: {
          ...fields,
          reference,
          date: parseIsoDate(data.date),
          semesterId,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: semester.campusId,
          action: 'CREATE',
          entityType: 'VisitingFacultyLedger',
          entityId: row.id,
          after: data,
        },
      });
      return row;
    });
    return saved;
  }

  async voidLedger(semesterId: string, id: string, user: AuthenticatedUser) {
    const semester = await this.semester(semesterId, user);
    return this.db.$transaction(async (tx) => {
      const row = await tx.visitingFacultyLedger.findFirst({
        where: { id, semesterId },
      });
      if (!row) throw new NotFoundException('Expense or payment not found.');
      await tx.visitingFacultyLedger.update({
        where: { id },
        data: { voided: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: semester.campusId,
          action: 'UPDATE',
          entityType: 'VisitingFacultyLedger',
          entityId: id,
          after: { voided: true },
        },
      });
      return { voided: true };
    });
  }

  async dashboard(semesterId: string, user: AuthenticatedUser, month?: string) {
    const semester = await this.semester(semesterId, user);
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException('Use YYYY-MM for month.');
    const range = month
      ? {
          gte: parseIsoDate(`${month}-01`),
          lt: new Date(
            Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
          ),
        }
      : undefined;
    const [staff, sessions, ledger] = await Promise.all([
      this.db.staffProfile.findMany({
        where: {
          OR: [
            {
              staffType: 'VISITING',
              user: {
                roleAssignments: {
                  some: { campusId: semester.campusId, role: 'FACULTY' },
                },
              },
            },
            {
              facultyAssignments: {
                some: {
                  offering: { batch: { semesterId } },
                  OR: [
                    { type: 'VISITING' },
                    { staffProfile: { staffType: 'VISITING' } },
                  ],
                },
              },
            },
            { visitingLedger: { some: { semesterId } } },
          ],
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          visitingRates: {
            where: { campusId: semester.campusId },
            orderBy: { effectiveFrom: 'asc' },
          },
          facultyAssignments: {
            where: { offering: { batch: { semesterId } } },
            include: { offering: { include: { subject: true, batch: true } } },
          },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      this.db.scheduledSession.findMany({
        where: {
          offering: { batch: { semesterId } },
          ...(range ? { sessionDate: range } : {}),
        },
        include: {
          facultyAssignment: true,
          offering: { include: { subject: true, batch: true, faculty: true } },
          logs: {
            orderBy: { revision: 'desc' },
            take: 1,
            include: {
              loggedBy: {
                select: {
                  staffProfile: { select: { id: true } },
                  roleAssignments: { select: { role: true } },
                },
              },
            },
          },
        },
        orderBy: [{ sessionDate: 'desc' }, { startsAt: 'desc' }],
      }),
      this.db.visitingFacultyLedger.findMany({
        where: { semesterId, voided: false, ...(range ? { date: range } : {}) },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const byId = new Map(staff.map((s) => [s.id, s]));
    const classes: Array<{
      id: string;
      staffProfileId: string;
      facultyName: string;
      date: string;
      startsAt: string;
      endsAt: string;
      subject: string;
      subjectCode: string;
      batch: string;
      status: string;
      logged: boolean;
      taken: boolean;
      minutes: number;
      rate: number | null;
      amount: number | null;
    }> = [];
    let unresolvedClasses = 0;
    for (const session of sessions) {
      const log = session.logs[0];
      const author = log?.loggedBy.roleAssignments.some(
        (r) => r.role === 'FACULTY',
      )
        ? log.loggedBy.staffProfile?.id
        : undefined;
      const validAssignments = session.offering.faculty.filter(
        (f) =>
          f.startDate <= session.sessionDate &&
          (!f.endDate || f.endDate >= session.sessionDate),
      );
      const candidates = validAssignments.filter((f) =>
        byId.has(f.staffProfileId),
      );
      // The actual faculty logger wins. Manager imports use the session's explicit assignment.
      const facultyId =
        author ??
        session.facultyAssignment?.staffProfileId ??
        (validAssignments.length === 1
          ? validAssignments[0]?.staffProfileId
          : undefined);
      if (!facultyId || !byId.has(facultyId)) {
        if (!facultyId && candidates.length) unresolvedClasses++;
        continue;
      }
      const teacher = byId.get(facultyId)!;
      const taken =
        !!log &&
        ['COMPLETED', 'IN_PROGRESS'].includes(log.status) &&
        session.endsAt <= new Date();
      const rate = classRate(teacher.visitingRates, session.sessionDate);
      classes.push({
        id: session.id,
        staffProfileId: facultyId,
        facultyName: teacher.user.name,
        date: formatIsoDate(session.sessionDate),
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        subject: session.offering.subject.name,
        subjectCode: session.offering.subject.code,
        batch: session.offering.batch.name,
        status: log?.status ?? session.status,
        logged: !!log,
        taken,
        minutes: Math.max(
          0,
          Math.round(
            (session.endsAt.getTime() - session.startsAt.getTime()) / 60000,
          ),
        ),
        rate,
        amount: taken ? rate : 0,
      });
    }
    const faculty = staff.map((s) => {
      const taught = classes.filter(
        (c) => c.staffProfileId === s.id && c.taken,
      );
      const entries = ledger.filter((l) => l.staffProfileId === s.id);
      const honorarium = rupees(
        taught.reduce((n, c) => n + (c.amount ?? 0), 0),
      );
      const expenses = rupees(
        entries
          .filter((e) => e.kind === 'EXPENSE')
          .reduce((n, e) => n + Number(e.amount), 0),
      );
      const paid = rupees(
        entries
          .filter((e) => e.kind === 'PAYMENT')
          .reduce((n, e) => n + Number(e.amount), 0),
      );
      return {
        id: s.id,
        name: s.user.name,
        email: s.user.email,
        employeeCode: s.employeeCode,
        active: s.active,
        subjects: s.facultyAssignments.map((a) => ({
          name: a.offering.subject.name,
          code: a.offering.subject.code,
          batch: a.offering.batch.name,
          active: a.active,
        })),
        rates: s.visitingRates.map((r) => ({
          effectiveFrom: formatIsoDate(r.effectiveFrom),
          ratePerClass: Number(r.ratePerClass),
        })),
        scheduledClasses: classes.filter((c) => c.staffProfileId === s.id)
          .length,
        takenClasses: taught.length,
        teachingHours: rupees(taught.reduce((n, c) => n + c.minutes, 0) / 60),
        unpricedClasses: taught.filter((c) => c.rate === null).length,
        honorarium,
        expenses,
        paid,
        totalCost: rupees(honorarium + expenses),
        balance: rupees(honorarium + expenses - paid),
      };
    });
    const sum = (
      key:
        | 'takenClasses'
        | 'teachingHours'
        | 'unpricedClasses'
        | 'honorarium'
        | 'expenses'
        | 'paid'
        | 'totalCost'
        | 'balance',
    ) => rupees(faculty.reduce((n, f) => n + f[key], 0));
    return {
      semester: {
        id: semester.id,
        name: semester.name,
        campus: semester.campus.name,
        timezone: semester.campus.timezone,
      },
      currency: 'INR',
      month: month ?? null,
      generatedAt: new Date().toISOString(),
      unresolvedClasses,
      summary: {
        faculty: faculty.length,
        takenClasses: sum('takenClasses'),
        teachingHours: sum('teachingHours'),
        unpricedClasses: sum('unpricedClasses'),
        honorarium: sum('honorarium'),
        expenses: sum('expenses'),
        paid: sum('paid'),
        totalCost: sum('totalCost'),
        balance: sum('balance'),
      },
      faculty,
      classes,
      ledger: ledger.map((l) => ({
        ...l,
        date: formatIsoDate(l.date),
        amount: Number(l.amount),
      })),
    };
  }
}
