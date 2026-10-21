import { ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicApi, Semester } from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';
export function CampusDataScope({
  initialCampusId,
  title,
  description,
  children,
  renderAllSemesters,
}: {
  initialCampusId?: string;
  title: string;
  description: string;
  children: (semester: Semester) => ReactNode;
  renderAllSemesters?: (campusId: string) => ReactNode;
}) {
  const [choice, setChoice] = useState(initialCampusId ?? '');
  const [semesterChoice, setSemesterChoice] = useState('');
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
  });
  const campusId = initialCampusId || choice || campuses.data?.[0]?.id || '';
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
    enabled: !!campusId,
  });
  const selected =
    semesters.data?.find((s) => s.id === semesterChoice) ??
    (renderAllSemesters
      ? undefined
      : (semesters.data?.find((s) => s.status === 'ACTIVE') ??
        semesters.data?.[0]));
  return (
    <section className="campus-data-workspace">
      <header className="campus-data-heading">
        <div>
          <p className="eyebrow">CAMPUS WORKSPACE</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="campus-data-scope">
        <label>
          Campus
          <select
            value={campusId}
            disabled={!!initialCampusId || campuses.isPending}
            onChange={(e) => {
              setChoice(e.target.value);
              setSemesterChoice('');
            }}
          >
            <option value="">Choose campus</option>
            {campuses.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semester
          <select
            value={selected?.id ?? ''}
            disabled={!campusId || semesters.isPending}
            onChange={(e) => setSemesterChoice(e.target.value)}
          >
            <option value="">
              {renderAllSemesters ? 'All semesters' : 'Choose semester'}
            </option>
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.startDate.slice(0, 10)} – {s.endDate.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(campuses.error || semesters.error) && (
        <div className="form-error" role="alert">
          {campuses.error?.message || semesters.error?.message}
          <button
            className="secondary-button"
            onClick={() => {
              void campuses.refetch();
              void semesters.refetch();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {(campuses.isPending && !campusId) ||
      (!renderAllSemesters && campusId && semesters.isPending) ? (
        <LoadingSkeleton />
      ) : renderAllSemesters && campusId && !selected ? (
        <div key={`${campusId}:all`}>{renderAllSemesters(campusId)}</div>
      ) : selected ? (
        <div key={selected.id}>{children(selected)}</div>
      ) : (
        <div className="campus-data-empty">
          <h3>No semester yet</h3>
          <p>Create a semester in Semester setup to use this workspace.</p>
        </div>
      )}
    </section>
  );
}
