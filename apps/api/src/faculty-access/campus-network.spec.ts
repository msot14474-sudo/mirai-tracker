import { FacultyAccessService } from './faculty-access.service';
it('limits the campus network to managed campuses and filters foreign subject assignments', async () => {
  const campus = {
    id: 'hi-tech',
    name: 'HI-Tech',
    roleAssignments: [
      {
        role: 'FACULTY',
        user: {
          id: 'teacher',
          name: 'Teacher',
          status: 'ACTIVE',
          staffProfile: {
            facultyAssignments: [
              {
                offering: {
                  id: 'own',
                  subject: { name: 'Web' },
                  batch: {
                    name: 'A',
                    semester: { name: 'Semester 1', campusId: 'hi-tech' },
                  },
                },
              },
              {
                offering: {
                  id: 'foreign',
                  subject: { name: 'Other' },
                  batch: {
                    name: 'B',
                    semester: { name: 'Semester 1', campusId: 'other' },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
  const db = { campus: { findMany: jest.fn().mockResolvedValue([campus]) } };
  const service = new FacultyAccessService(
    db as any,
    { isGlobalManager: () => false } as any,
  );
  const result = await service.network({
    roles: [{ role: 'CAMPUS_MANAGER', campusId: 'hi-tech' }],
  } as any);
  expect(db.campus.findMany.mock.calls[0][0].where.id.in).toEqual(['hi-tech']);
  expect(result[0]!.facultyCount).toBe(1);
  expect(result[0]!.people[0]!.subjects.map((s) => s.offeringId)).toEqual([
    'own',
  ]);
});
