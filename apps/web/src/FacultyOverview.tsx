import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl } from './http';
import { AcademicOverview } from './AcademicOverview';

type AssignedSubject = {
  id: string;
  name: string;
  code: string;
  offerings: { id: string }[];
};
export function FacultyOverview({
  userId,
  name,
  onOpen,
  onReports,
}: {
  userId: string;
  name: string;
  onOpen: (view: 'lesson-plans' | 'daily-logging', offeringId?: string) => void;
  onReports?: (subjectId?: string) => void;
}) {
  const client = useQueryClient();
  const subjects = useQuery({
    queryKey: ['faculty-subjects', userId],
    queryFn: async (): Promise<AssignedSubject[]> => {
      const response = await apiFetch(`${apiUrl}/academic/my-subjects`);
      return response.json();
    },
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: 'always',
  });
  const unlinked =
    subjects.data?.filter((subject) => !subject.offerings.length) ?? [];
  return (
    <>
      <AcademicOverview
        name={name}
        faculty
        onReports={onReports}
        onLessonPlan={(id) => onOpen('lesson-plans', id)}
        onLog={
          subjects.data?.some((subject) => subject.offerings.length)
            ? () => onOpen('daily-logging')
            : undefined
        }
      />
      <section className="workspace-card">
        <div className="workspace-heading">
          <div>
            <h2>Subject assignments</h2>
            <p>
              {unlinked.length
                ? `${unlinked.length} assigned subjects need a batch and semester link.`
                : 'Your overview follows your current teaching assignments.'}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={subjects.isFetching}
            onClick={() => {
              void subjects.refetch();
              void client.invalidateQueries({ queryKey: ['reports'] });
            }}
          >
            Refresh subjects
          </button>
        </div>
        {subjects.isError ? <p role="alert">{subjects.error.message}</p> : null}
        {subjects.data?.length === 0 ? (
          <p>
            No subjects have been assigned to you yet. Ask your campus manager
            to check your teacher assignment.
          </p>
        ) : null}
        {unlinked.length ? (
          <div className="faculty-subject-grid">
            {unlinked.map((subject) => (
              <article className="faculty-subject-card" key={subject.id}>
                <h3>{subject.name}</h3>
                <p>{subject.code}</p>
                <p>
                  Assigned to you. Your admin/program manager still needs to
                  link this subject to your batch and semester before you can
                  upload its lesson plan or log classes.
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
