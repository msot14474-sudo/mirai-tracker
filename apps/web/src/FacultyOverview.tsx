import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiUrl } from './http';
import { ProgressDashboard } from './ProgressDashboard';
import { LoadingSkeleton } from './LoadingSkeleton';

type AssignedSubject = {
  id: string;
  name: string;
  code: string;
  offerings: {
    id: string;
    batch: { name: string; semester: { name: string } };
  }[];
};
export function FacultyOverview({
  userId,
  name,
  onOpen,
}: {
  userId: string;
  name: string;
  onOpen: (view: 'lesson-plans' | 'daily-logging') => void;
}) {
  const subjects = useQuery({
    queryKey: ['faculty-subjects', userId],
    queryFn: async (): Promise<AssignedSubject[]> => {
      const response = await apiFetch(`${apiUrl}/academic/my-subjects`);
      if (!response.ok)
        throw new Error('Could not load your assigned subjects. Please retry.');
      return response.json();
    },
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: 'always',
  });
  return (
    <>
      <section className="workspace-card">
        <div className="workspace-heading">
          <div>
            <h2>Welcome back, {name.split(' ')[0]}</h2>
            <p>Your assigned subjects</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => subjects.refetch()}
            disabled={subjects.isFetching}
          >
            Refresh subjects
          </button>
        </div>
        {subjects.isPending ? (
          <LoadingSkeleton variant="cards" label="Loading assigned subjects" />
        ) : subjects.isError ? (
          <p role="alert">{subjects.error.message}</p>
        ) : !subjects.data?.length ? (
          <p>
            No subjects have been assigned to you yet. Ask your campus manager
            to check your teacher assignment.
          </p>
        ) : (
          <div className="faculty-subject-grid">{subjects.data.map((subject) => (
            <article className="faculty-subject-card" key={subject.id}>
              <h3>{subject.name}</h3>
              <p>{subject.code}</p>
              {subject.offerings.length ? (
                <>
                  {subject.offerings.map((o) => (
                    <p key={o.id}>
                      {o.batch.name} · {o.batch.semester.name}
                    </p>
                  ))}
                  <div className="action-row"><button type="button" onClick={() => onOpen('lesson-plans')}>
                    Open lesson plans
                  </button>{' '}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onOpen('daily-logging')}
                  >
                    Log a class
                  </button></div>
                </>
              ) : (
                <p>
                  Assigned to you. Your admin/program manager still needs to link this
                  subject to your batch and semester before you can upload its
                  lesson plan or log classes.
                </p>
              )}
            </article>
          ))}</div>
        )}
      </section>
      {subjects.data?.some(subject => subject.offerings.length > 0) && <ProgressDashboard scope="faculty" />}
    </>
  );
}
