import { ReportsService, reportScope } from './reports.service';
import { reportQuerySchema } from './reports.schemas';

const day = (value: string) => new Date(value);
const user = {
  id: 'teacher',
  staffProfileId: 'staff',
  roles: [{ role: 'FACULTY', campusId: 'campus' }],
} as any;
function offering(id = 'offering') {
  const topic = {
    id: 'topic',
    title: 'Arrays',
    sequence: 1,
    plannedMinutes: 240,
    status: 'IN_PROGRESS',
    currentCompletionPercentage: 50,
    examScopes: [{ examWindowId: 'exam' }],
  };
  const session = (
    id: string,
    date: string,
    status: string,
    logs: any[] = [],
  ) => ({
    id,
    sessionDate: day(date),
    startsAt: day(`${date}T03:30:00Z`),
    endsAt: day(`${date}T05:30:00Z`),
    status,
    cancellationReason: null,
    logs,
  });
  return {
    id,
    subjectId: 'subject',
    batchId: 'batch',
    academicTrack: 'MIRAI',
    targetFinishDate: day('2026-12-18'),
    onTrackThreshold: null,
    tightThreshold: null,
    subject: { id: 'subject', name: 'DSA', code: 'DSA' },
    batch: {
      id: 'batch',
      name: 'First Year A',
      code: 'A',
      semesterId: 'semester',
      semester: {
        id: 'semester',
        name: 'Semester 1',
        campusId: 'campus',
        defaultOnTrackThreshold: 1.15,
        defaultTightThreshold: 1,
        campus: {
          id: 'campus',
          name: 'HI-Tech',
          code: 'HT',
          timezone: 'Asia/Kolkata',
        },
      },
    },
    faculty: [
      {
        active: true,
        staffProfile: { user: { id: 'teacher', name: 'Teacher' } },
      },
    ],
    lessonPlans: [
      { status: 'ACTIVE', version: 1, units: [{ topics: [topic] }] },
    ],
    scheduleVersions: [
      { entries: [{ topicId: 'topic', plannedFinishDate: day('2026-10-20') }] },
    ],
    sessions: [
      session('logged', '2026-10-19', 'COMPLETED', [
        {
          id: 'log',
          status: 'COMPLETED',
          revision: 1,
          loggedById: 'teacher',
          loggedBy: { id: 'teacher', name: 'Teacher' },
          loggedAt: day('2026-10-19T06:00:00Z'),
          topicUpdates: [],
          notes: 'Recorded class',
        },
      ]),
      session('unlogged', '2026-10-20', 'SCHEDULED'),
      session('upcoming', '2026-10-22', 'SCHEDULED'),
    ],
  };
}
function setup() {
  const rows = [offering(), offering('other-offering')];
  const db = {
    campus: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'campus', name: 'HI-Tech', code: 'HT' }]),
    },
    subjectOffering: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        if (!args.include.sessions) return rows;
        const ids = args.where.AND[1].id.in;
        return rows.filter((o) => ids.includes(o.id));
      }),
    },
    examWindow: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'exam',
            semesterId: 'semester',
            name: 'Mid term',
            startDate: day('2026-11-01'),
            endDate: day('2026-11-02'),
            syllabusDeadline: day('2026-10-31'),
          },
        ]),
    },
    lessonPlan: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { db, service: new ReportsService(db as any) };
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(day('2026-10-21T10:00:00Z'));
});
afterEach(() => jest.useRealTimers());

it('returns identical subject figures with no lecture text or upload-history query', async () => {
  const { db, service } = setup();
  const query = reportQuerySchema.parse({ campusId: undefined });
  const compact = await service.read(user, query, true);
  expect(db.lessonPlan.findMany).not.toHaveBeenCalled();
  expect(
    db.subjectOffering.findMany.mock.calls[1][0].include.sessions.select.logs,
  ).toEqual({ take: 1, select: { id: true } });
  const full = await service.read(user, query);
  expect(compact.subjects).toEqual(full.subjects);
  expect(compact.summary).toEqual(full.summary);
  expect(compact.subjects[0]).toMatchObject({
    logged: 1,
    unlogged: 1,
    upcoming: 1,
    metrics: {
      hoursInScope: 4,
      coveredHours: 2,
      remainingHours: 2,
      availableHours: 2,
      bufferRatio: 1,
    },
  });
  expect(compact.delivery).toEqual([]);
  expect(full.delivery).toHaveLength(2);
  expect(compact.groups).toEqual([]);
});

it('applies authorization and an exact offering filter to summary queries', async () => {
  const { db, service } = setup();
  const q = { ...reportQuerySchema.parse({}), offeringId: 'offering' };
  const result = await service.read(user, q, true);
  expect(result.subjects.map((s) => s.id)).toEqual(['offering']);
  expect(db.subjectOffering.findMany.mock.calls[0][0].where.AND).toContainEqual(
    reportScope(user),
  );
  expect(db.subjectOffering.findMany.mock.calls[0][0].where.AND).toContainEqual(
    { batch: { semester: { campusId: 'campus' } } },
  );
  expect(db.subjectOffering.findMany.mock.calls[1][0].where.AND).toEqual([
    reportScope(user),
    { id: { in: ['offering'] } },
  ]);
  await expect(
    service.read(user, { ...q, campusId: 'other-campus' }, true),
  ).rejects.toThrow('assigned campus');
  await expect(
    service.read(
      { ...user, roles: [{ role: 'STUDENT', campusId: 'campus' }] },
      q,
      true,
    ),
  ).rejects.toThrow();
});
