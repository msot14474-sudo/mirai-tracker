import { reportQuerySchema } from './reports.schemas';
import { reportScope } from './reports.service';
import { ReportsController } from './reports.controller';
import { REQUIRED_ROLES_KEY } from '../auth/auth.constants';

describe('report permissions and filters', () => {
  it('rejects invalid dates and reversed ranges and never accepts arbitrary status strings', () => {
    for (const input of [
      { from: '2026-02-30' },
      { from: '2026-10-20', to: '2026-10-19' },
      { deliveryStatus: 'ANYTHING' },
      { campusId: 'bad-id' },
    ])
      expect(reportQuerySchema.safeParse(input).success).toBe(false);
    expect(reportQuerySchema.parse({})).toEqual({
      tab: 'course',
      deliveryStatus: 'TAUGHT',
    });
  });
  it('permits reporting roles on both endpoints but excludes students', () => {
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, ReportsController)).toEqual([
      'ADMIN',
      'PROGRAM_MANAGER',
      'CAMPUS_MANAGER',
      'FACULTY',
    ]);
    expect(() =>
      reportScope({ roles: [{ role: 'STUDENT', campusId: 'a' }] } as any),
    ).toThrow();
    expect(() =>
      reportScope({
        roles: [{ role: 'CAMPUS_MANAGER', campusId: null }],
      } as any),
    ).toThrow();
  });
});

it('requires the faculty campus as well as an active subject assignment', () => {
  expect(
    reportScope({
      staffProfileId: 'teacher',
      roles: [{ role: 'FACULTY', campusId: 'own-campus' }],
    } as any),
  ).toEqual({
    OR: [
      {
        batch: { semester: { campusId: { in: ['own-campus'] } } },
        faculty: { some: { staffProfileId: 'teacher', active: true } },
      },
    ],
  });
  expect(() =>
    reportScope({
      staffProfileId: 'teacher',
      roles: [{ role: 'FACULTY', campusId: null }],
    } as any),
  ).toThrow();
  expect(reportQuerySchema.safeParse({ trackId: 'CS' }).success).toBe(false);
  expect(reportQuerySchema.parse({ trackId: 'UNIVERSITY' }).trackId).toBe(
    'UNIVERSITY',
  );
});
