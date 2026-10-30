import { ExamCalendarEditor } from './ExamCalendarEditor';
import { BufferThresholdSettings } from './BufferThresholdSettings';
import { academicTrackIdentity } from './tracks';
import { TrackSelect } from './TrackSelect';
import { SemesterSubjects } from './SemesterSubjects';
import { SubjectTeacherAssignment } from './SubjectTeacherAssignment';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import {
  academicApi,
  dateOnly,
  SaturdayRule,
  GeneratedCalendar,
  Subject,
} from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';

const saturdayLabels: Record<SaturdayRule, string> = {
  ALL: 'All Saturdays',
  NONE: 'No Saturdays',
  SECOND_AND_FOURTH: 'Second and fourth',
};

export function SemesterSetup({
  initialCampusId,
  canAssignTeachers = true,
}: {
  initialCampusId: string;
  canAssignTeachers?: boolean;
}) {
  const queryClient = useQueryClient();
  const campusId = initialCampusId;
  const [showCreate, setShowCreate] = useState(false);
  const [semesterId, setSemesterId] = useState('');
  const [setupView, setSetupView] = useState<'semesters' | 'subjects'>(
    'semesters',
  );

  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
    enabled: Boolean(campusId),
  });
  const calendar = useQuery({
    queryKey: ['academic', 'calendar', semesterId],
    queryFn: () => academicApi.calendar(semesterId),
    enabled: Boolean(semesterId),
  });

  const deletion = useMutation({
    mutationFn: academicApi.deleteSemester,
    onSuccess: async (_, deletedId) => {
      if (semesterId === deletedId) setSemesterId('');
      queryClient.removeQueries({
        queryKey: ['academic', 'calendar', deletedId],
      });
      await queryClient.invalidateQueries();
    },
  });

  const refreshCalendar = async () => {
    await Promise.all(
      [
        'timetable',
        'topic-schedules',
        'progress-dashboard',
        'reports',
        'exam-readiness',
        'student-overview',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
    await queryClient.invalidateQueries({
      queryKey: ['academic', 'calendar', semesterId],
    });
    await queryClient.invalidateQueries({
      queryKey: ['academic', 'semesters', campusId],
    });
  };

  return (
    <section className="semester-workspace" aria-labelledby="semester-title">
      <div className="workspace-heading">
        <div>
          <h2 id="semester-title">
            {setupView === 'semesters' ? 'Semester calendar' : 'Subjects'}
          </h2>
          {setupView === 'semesters' && semesters.isSuccess ? (
            <p>
              {semesters.data.length}{' '}
              {semesters.data.length === 1 ? 'semester' : 'semesters'} in this
              campus
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="primary-button"
          aria-expanded={showCreate}
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate
            ? 'Cancel'
            : setupView === 'semesters'
              ? 'Add semester'
              : 'Add subject'}
        </button>
      </div>

      <div className="access-type-tabs academic-setup-tabs" role="group">
        <button
          type="button"
          aria-pressed={setupView === 'semesters'}
          onClick={() => {
            setSetupView('semesters');
            setShowCreate(false);
          }}
        >
          Semesters
        </button>
        <button
          type="button"
          aria-pressed={setupView === 'subjects'}
          onMouseEnter={() =>
            void queryClient.prefetchQuery({
              queryKey: ['academic', 'subjects', campusId],
              queryFn: () => academicApi.subjects(campusId),
            })
          }
          onFocus={() =>
            void queryClient.prefetchQuery({
              queryKey: ['academic', 'subjects', campusId],
              queryFn: () => academicApi.subjects(campusId),
            })
          }
          onClick={() => {
            setSetupView('subjects');
            setShowCreate(false);
          }}
        >
          Subjects
        </button>
      </div>

      {setupView === 'subjects' ? (
        <SubjectSetup
          canAssignTeachers={canAssignTeachers}
          campusId={campusId}
          showCreate={showCreate}
          onCreated={() => setShowCreate(false)}
        />
      ) : (
        <div className="semester-layout">
          <div>
            {showCreate ? (
              <CreateSemesterForm
                campusId={campusId}
                onCreated={(createdId) => {
                  setSemesterId(createdId);
                  setShowCreate(false);
                  void queryClient.invalidateQueries({
                    queryKey: ['academic', 'semesters', campusId],
                  });
                }}
              />
            ) : null}

            {semesters.isError ? (
              <p className="form-error" role="alert">
                {semesters.error.message}
              </p>
            ) : null}
            {deletion.error ? (
              <p className="form-error" role="alert">
                {deletion.error.message}
              </p>
            ) : null}
            <div className="semester-list" aria-label="Semesters">
              {semesters.isLoading ? (
                <LoadingSkeleton
                  variant="list"
                  count={3}
                  label="Loading semesters"
                />
              ) : (
                semesters.data?.map((semester) => (
                  <div className="semester-list-item" key={semester.id}>
                    <button
                      className={semester.id === semesterId ? 'selected' : ''}
                      onMouseEnter={() =>
                        void queryClient.prefetchQuery({
                          queryKey: ['academic', 'calendar', semester.id],
                          queryFn: () => academicApi.calendar(semester.id),
                        })
                      }
                      onFocus={() =>
                        void queryClient.prefetchQuery({
                          queryKey: ['academic', 'calendar', semester.id],
                          queryFn: () => academicApi.calendar(semester.id),
                        })
                      }
                      onClick={() => setSemesterId(semester.id)}
                    >
                      <strong>{semester.name}</strong>
                      <span>
                        {dateOnly(semester.startDate)} →{' '}
                        {dateOnly(semester.endDate)}
                      </span>
                      <small>
                        {saturdayLabels[semester.workingSaturdayRule]}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="academic-delete"
                      disabled={deletion.isPending}
                      aria-label={`Delete semester ${semester.name}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete “${semester.name}”? Its calendar days and exam windows will be permanently removed. Semesters with linked batches cannot be deleted.`,
                          )
                        )
                          deletion.mutate(semester.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
              {!semesters.isLoading &&
              campusId &&
              semesters.data?.length === 0 ? (
                <p className="empty-copy">
                  No semester created for this campus.
                </p>
              ) : null}
            </div>
          </div>

          <div className="calendar-detail">
            {semesters.isLoading ? (
              <LoadingSkeleton variant="panel" label="Loading semesters" />
            ) : !semesterId ? (
              <div className="empty-state">
                <h3>Select or create a semester</h3>
                <p>Its calculated working-day summary will appear here.</p>
              </div>
            ) : calendar.isLoading ? (
              <LoadingSkeleton variant="panel" label="Calculating calendar" />
            ) : calendar.isError ? (
              <p className="form-error" role="alert">
                {calendar.error.message}
              </p>
            ) : calendar.data ? (
              <>
                <SemesterSubjects
                  key={semesterId}
                  semesterId={semesterId}
                  campusId={campusId}
                />
                <div className="calendar-summary">
                  <div>
                    <span>Total dates</span>
                    <strong>{calendar.data.summary.totalDays}</strong>
                  </div>
                  <div>
                    <span>Teaching days</span>
                    <strong>{calendar.data.summary.workingDays}</strong>
                  </div>
                  <div>
                    <span>Non-teaching</span>
                    <strong>{calendar.data.summary.nonWorkingDays}</strong>
                  </div>
                </div>

                <div className="calendar-preview">
                  <BufferThresholdSettings key={semesterId} semester={calendar.data.semester} />
                  <div className="subheading-row">
                    <h3>Full semester calendar</h3>
                    <span>
                      {calendar.data.semester.startDate} –{' '}
                      {calendar.data.semester.endDate}
                    </span>
                  </div>
                  <div
                    className="schedule-date-list"
                    tabIndex={0}
                    role="region"
                    aria-label="All semester dates"
                  >
                    {calendar.data.days.map((day) => (
                      <div className="calendar-row" key={day.date}>
                        <time dateTime={day.date}>
                          {day.date}
                          <small className="calendar-weekday">
                            {day.weekday.toLowerCase()}
                          </small>
                        </time>
                        <span>
                          {day.override?.title ??
                            day.reason.replaceAll('_', ' ')}
                        </span>
                        <b className={day.working ? 'working' : 'closed'}>
                          {day.working ? 'Teaching' : 'Closed'}
                        </b>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="setup-forms">
                  <CalendarDayForm
                    key={semesterId}
                    calendar={calendar.data}
                    semesterId={semesterId}
                    onSaved={refreshCalendar}
                  />
                  <ExamCalendarEditor
                    calendar={calendar.data}
                    onSaved={refreshCalendar}
                  />
                </div>

                <div className="exam-list">
                  <h3>Exam windows</h3>
                  {calendar.data.exams.length ? (
                    calendar.data.exams.map((exam) => (
                      <div key={exam.id}>
                        <strong>{exam.name}</strong>
                        <span>
                          {dateOnly(exam.startDate)} → {dateOnly(exam.endDate)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-copy">No exam windows yet.</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export function SubjectSetup({
  campusId,
  canAssignTeachers,
  showCreate,
  onCreated,
  canDelete = true,
  initialSemesterId = '',
}: {
  campusId: string;
  canAssignTeachers: boolean;
  showCreate: boolean;
  onCreated: () => void;
  canDelete?: boolean;
  initialSemesterId?: string;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savedSubject, setSavedSubject] = useState('');
  const [selectedSemester, setSelectedSemester] = useState(initialSemesterId);
  const [batchId, setBatchId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [trackCode, setTrackCode] = useState('');
  const [linkSubjectId, setLinkSubjectId] = useState('');
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
  });
  const activeSemesters =
    semesters.data?.filter((s) => s.status !== 'ARCHIVED') ?? [];
  const semesterId =
    selectedSemester ||
    (activeSemesters.length === 1 ? activeSemesters[0]!.id : '');
  const batches = useQuery({
    queryKey: ['academic', 'semester-subjects', semesterId],
    queryFn: () => academicApi.semesterCourses(semesterId),
    enabled: !!semesterId,
  });

  const subjectQueryKey = ['academic', 'subjects', campusId];
  const deletion = useMutation({
    mutationFn: academicApi.deleteSubject,
    onSuccess: async (_, deletedId) => {
      await queryClient.cancelQueries({ queryKey: subjectQueryKey });
      queryClient.setQueryData<Subject[]>(subjectQueryKey, (current) =>
        current?.filter((subject) => subject.id !== deletedId),
      );
      setSavedSubject('');
      await queryClient.invalidateQueries();
    },
  });
  const subjects = useQuery({
    queryKey: ['academic', 'subjects', campusId],
    queryFn: () => academicApi.subjects(campusId),
  });
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.createSubject({
        campusId,
        code,
        name,
        semesterId,
        ...(batchId ? { batchId } : { batchName, batchCode }),
        trackCode,
        trackName: academicTrackIdentity(trackCode).name,
        description: description.trim() || null,
      }),
    onMutate: () => queryClient.cancelQueries({ queryKey: subjectQueryKey }),
    onSuccess: async (subject) => {
      // A read started before the write must not replace the saved subject with an old list.
      await queryClient.cancelQueries({ queryKey: subjectQueryKey });
      queryClient.setQueryData<Subject[]>(subjectQueryKey, (current = []) =>
        [...current.filter((item) => item.id !== subject.id), subject].sort(
          (a, b) => a.code.localeCompare(b.code),
        ),
      );
      setCode('');
      setName('');
      setDescription('');
      setSavedSubject(subject.name);
      onCreated();
      await queryClient.invalidateQueries();
    },
  });

  return (
    <div
      className={`subject-setup-layout${showCreate ? '' : ' subject-setup-list-only'}`}
    >
      {showCreate ? (
        <form
          className="setup-card subject-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSavedSubject('');
            mutation.mutate();
          }}
        >
          <h3>Add subject</h3>
          <p>
            Create the subject in a semester batch, then assign its teacher. The
            campus manager can schedule its classes in Timetable.
          </p>
          <label>
            Semester
            <select
              required
              value={semesterId}
              onChange={(e) => {
                setSelectedSemester(e.target.value);
                setBatchId('');
              }}
            >
              <option value="">Choose a semester</option>
              {activeSemesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {semesters.isError && <p role="alert">{semesters.error.message}</p>}
          {semesters.isSuccess && !activeSemesters.length && (
            <p>Create a semester in the Semesters tab first.</p>
          )}
          <label>
            Batch
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              disabled={!semesterId || batches.isPending}
            >
              <option value="">Create a new batch</option>
              {batches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {batches.isError && <p role="alert">{batches.error.message}</p>}
          {!batchId && (
            <div className="form-grid">
              <label>
                Batch name
                <input
                  required
                  maxLength={160}
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                />
              </label>
              <label>
                Batch code
                <input
                  required
                  maxLength={64}
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                />
              </label>
            </div>
          )}

          <TrackSelect value={trackCode} onChange={setTrackCode} />
          <p className="schedule-help">
            Each batch can contain both Mirai and University subjects.
          </p>
          <label>
            Subject code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="CS-DSA"
              required
            />
          </label>
          <label>
            Subject name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Data Structures and Algorithms"
              required
            />
          </label>
          <label>
            Description <span className="optional-label">Optional</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </label>
          {mutation.error ? (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          ) : null}

          <button
            disabled={
              mutation.isPending ||
              !semesterId ||
              batches.isPending ||
              batches.isError
            }
          >
            {mutation.isPending ? 'Adding…' : 'Add subject'}
          </button>
        </form>
      ) : null}

      <section
        className="subject-catalog"
        aria-labelledby="subject-catalog-title"
      >
        <div className="subheading-row">
          <h3 id="subject-catalog-title">Subject catalog</h3>
          <span className="subject-count">
            {subjects.data
              ? `${subjects.data.length} ${subjects.data.length === 1 ? 'subject' : 'subjects'}`
              : subjects.isLoading
                ? 'Loading…'
                : 'Unavailable'}
          </span>
        </div>
        {subjects.isLoading ? (
          <LoadingSkeleton variant="cards" label="Loading subjects" />
        ) : null}
        {subjects.isError ? (
          <p className="form-error" role="alert">
            {subjects.error.message}
          </p>
        ) : null}
        {savedSubject ? (
          <p className="form-success" role="status">
            {savedSubject} added.
          </p>
        ) : null}
        {deletion.error ? (
          <p className="form-error" role="alert">
            {deletion.error.message}
          </p>
        ) : null}
        <div className="subject-list">
          {subjects.data?.map((subject) => (
            <article key={subject.id} className="subject-card">
              <header className="subject-card-heading">
                <div className="subject-card-identity">
                  <span className="subject-code">{subject.code}</span>
                  <h4>{subject.name}</h4>
                  {subject.description ? <p>{subject.description}</p> : null}
                </div>
                {canDelete && (
                  <button
                    type="button"
                    className="academic-delete"
                    disabled={deletion.isPending}
                    aria-label={`Delete subject ${subject.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Permanently delete “${subject.name}” from the subject catalog? Subjects assigned to a batch cannot be deleted.`,
                        )
                      )
                        deletion.mutate(subject.id);
                    }}
                  >
                    Delete
                  </button>
                )}
              </header>
              <SubjectTeacherAssignment
                readOnly={!canAssignTeachers}
                subject={
                  initialSemesterId
                    ? {
                        ...subject,
                        offerings: subject.offerings?.filter(
                          (o) => o.batch.semester.id === initialSemesterId,
                        ),
                      }
                    : subject
                }
                campusId={campusId}
              />
              <div className="subject-card-link">
                <button
                  type="button"
                  className="secondary"
                  aria-expanded={linkSubjectId === subject.id}
                  onClick={() =>
                    setLinkSubjectId(
                      linkSubjectId === subject.id ? '' : subject.id,
                    )
                  }
                >
                  {linkSubjectId === subject.id
                    ? 'Close semester linking'
                    : subject.offerings?.length
                      ? 'Link another batch'
                      : 'Link to semester and batch'}
                </button>
                {linkSubjectId === subject.id && (
                  <div className="subject-link-form">
                    <label>
                      Semester to link
                      <select
                        required
                        value={semesterId}
                        onChange={(e) => setSelectedSemester(e.target.value)}
                      >
                        <option value="">Choose a semester</option>
                        {activeSemesters.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {semesterId && (
                      <SemesterSubjects
                        key={semesterId + subject.id}
                        semesterId={semesterId}
                        campusId={campusId}
                        onlySubjectId={subject.id}
                      />
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {!subjects.isLoading && subjects.data?.length === 0 ? (
          <p className="empty-copy">No subjects added yet.</p>
        ) : null}
      </section>
    </div>
  );
}

function CreateSemesterForm({
  campusId,
  onCreated,
}: {
  campusId: string;
  onCreated: (semesterId: string) => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rule, setRule] = useState<SaturdayRule>('SECOND_AND_FOURTH');
  const mutation = useMutation({
    mutationFn: () =>
      academicApi.createSemester(campusId, {
        name,
        startDate,
        endDate,
        workingSaturdayRule: rule,
      }),
    onSuccess: (semester) => {
      setName('');
      onCreated(semester.id);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form className="setup-card" onSubmit={submit}>
      <h3>Create semester</h3>
      <label>
        Semester name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <div className="field-pair">
        <label>
          Starts
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </label>
        <label>
          Ends
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Working Saturdays
        <select
          value={rule}
          onChange={(event) => setRule(event.target.value as SaturdayRule)}
        >
          {Object.entries(saturdayLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {mutation.error ? (
        <p className="form-error">{mutation.error.message}</p>
      ) : null}
      <button disabled={!campusId || mutation.isPending}>
        {mutation.isPending ? 'Creating…' : 'Create semester'}
      </button>
    </form>
  );
}

export function CalendarDayForm({
  semesterId,
  calendar,
  onSaved,
}: {
  semesterId: string;
  calendar: GeneratedCalendar;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<
    'HOLIDAY' | 'EVENT' | 'EXTRA_WORKING_DAY' | 'CAMPUS_CLOSED'
  >('HOLIDAY');
  const [teachingAllowed, setTeachingAllowed] = useState(false);
  const mutation = useMutation({
    mutationFn: () => {
      const existing = calendar.days.find((day) => day.date === date)?.override;
      const input = { title, type, teachingAllowed };
      return existing?.id
        ? academicApi.updateCalendarDay(existing.id, input)
        : academicApi.createCalendarDay(semesterId, { date, ...input });
    },
    onSuccess: async () => {
      await onSaved();
      setSaved(true);
    },
  });

  return (
    <form
      className="setup-card compact"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        mutation.mutate();
      }}
    >
      <h3>Update calendar date</h3>
      <fieldset className="calendar-date-fields" disabled={mutation.isPending}>
        <label>
          Date
          <input
            type="date"
            value={date}
            min={dateOnly(calendar.semester.startDate)}
            max={dateOnly(calendar.semester.endDate)}
            onChange={(event) => {
              const selected = event.target.value;
              const existing = calendar.days.find(
                (day) => day.date === selected,
              )?.override;
              setDate(selected);
              setTitle(existing?.title ?? '');
              setType((existing?.type as typeof type) ?? 'HOLIDAY');
              setTeachingAllowed(existing?.teachingAllowed ?? false);
              setSaved(false);
              mutation.reset();
            }}
            required
          />
        </label>
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            <option value="HOLIDAY">Holiday</option>
            <option value="EVENT">Event</option>
            <option value="EXTRA_WORKING_DAY">Extra working day</option>
            <option value="CAMPUS_CLOSED">Campus closed</option>
          </select>
        </label>
        {type === 'EVENT' ? (
          <label className="check-field">
            <input
              type="checkbox"
              checked={teachingAllowed}
              onChange={(event) => setTeachingAllowed(event.target.checked)}
            />
            Teaching continues
          </label>
        ) : null}
        {mutation.error ? (
          <p className="form-error">{mutation.error.message}</p>
        ) : null}
        {saved ? (
          <p className="form-success" role="status">
            Calendar date updated.
          </p>
        ) : null}
        <button disabled={!date || mutation.isPending}>
          {mutation.isPending ? 'Updating…' : 'Update date'}
        </button>
      </fieldset>
    </form>
  );
}
