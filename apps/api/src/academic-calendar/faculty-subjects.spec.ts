import { AcademicCalendarService } from './academic-calendar.service';
it('lists both default subjects and teaching assignments using only the current faculty and campus', async () => {
  const findMany = jest.fn().mockResolvedValue([{ id: 'assigned' }]);
  const service = new AcademicCalendarService(
    { subject: { findMany } } as any,
    {} as any,
    {} as any,
  );
  const result = await service.listFacultySubjects({
    staffProfileId: 'teacher-a',
    roles: [{ role: 'FACULTY', campusId: 'campus-a' }],
  } as any);
  expect(result).toEqual([{ id: 'assigned' }]);
  const query = findMany.mock.calls[0][0];
  expect(query.where.OR[0].teachers.some).toEqual({
    staffProfileId: 'teacher-a',
    campusId: { in: ['campus-a'] },
  });
  expect(query.where.OR[1].offerings.some).toEqual(
    query.select.offerings.where,
  );
  expect(query.select.offerings.where.faculty.some).toEqual({
    staffProfileId: 'teacher-a',
    active: true,
  });
  expect(query.select.offerings.where.batch.semester.campusId.in).toEqual([
    'campus-a',
  ]);
});
it('does not expose subjects when the session has no faculty profile or campus', async () => {
  const findMany = jest.fn();
  const service = new AcademicCalendarService(
    { subject: { findMany } } as any,
    {} as any,
    {} as any,
  );
  expect(await service.listFacultySubjects({ roles: [] } as any)).toEqual([]);
  expect(findMany).not.toHaveBeenCalled();
});
