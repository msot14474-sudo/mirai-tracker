import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { academicApi } from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';
import { BatchTimetableImport } from './BatchTimetableImport';
import { OfferingTimetable, TimetableEntry, timetableApi } from './timetable';

const weekdayLabels = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function TimetableSetup({
  initialCampusId = '',
  campusLocked = false,
}: {
  initialCampusId?: string;
  campusLocked?: boolean;
}) {
  const queryClient = useQueryClient();
  const [campusId, setCampusId] = useState(initialCampusId);
  const [semesterId, setSemesterId] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
  });
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
    enabled: Boolean(campusId),
  });
  const offerings = useQuery({
    queryKey: ['timetable', 'offerings', semesterId],
    queryFn: () => timetableApi.offerings(semesterId),
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
    enabled: Boolean(semesterId),
  });
  const detail = useQuery({
    queryKey: ['timetable', 'offering', offeringId],
    queryFn: () => timetableApi.offering(offeringId),
    enabled: Boolean(offeringId),
  });

  useEffect(() => {
    if (!campusId && campuses.data?.[0]) setCampusId(campuses.data[0].id);
  }, [campusId, campuses.data]);
  useEffect(() => {
    if (!semesterId && semesters.data?.[0]) setSemesterId(semesters.data[0].id);
  }, [semesterId, semesters.data]);
  useEffect(() => {
    if (!offeringId && offerings.data?.offerings[0]) {
      setOfferingId(offerings.data.offerings[0].id);
    }
  }, [offeringId, offerings.data]);

  const selectionIsLoading =
    campuses.isLoading ||
    (Boolean(campusId) && semesters.isLoading) ||
    (!campusId && Boolean(campuses.data?.length)) ||
    (!semesterId && Boolean(semesters.data?.length)) ||
    (Boolean(semesterId) && offerings.isLoading) ||
    (!offeringId && Boolean(offerings.data?.offerings.length));

  const refresh = async () => {
    await Promise.all(
      [
        'timetable',
        'topic-schedules',
        'progress-dashboard',
        'exam-readiness',
        'student-overview',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };

  return (
    <section className="timetable-workspace" aria-labelledby="timetable-title">
      <div className="workspace-heading">
        <div>
          <h2 id="timetable-title">Weekly timetable</h2>
          <p className="schedule-help">
            Upload a full batch timetable, or choose a subject below to add and
            edit weekly classes.
          </p>
        </div>
        <div className="timetable-filters">
          <label>
            Campus
            <select
              value={campusId}
              disabled={campusLocked}
              onChange={(event) => {
                setCampusId(event.target.value);
                setSemesterId('');
                setOfferingId('');
              }}
            >
              <option value="">
                {campuses.isLoading ? 'Loading campuses…' : 'Select campus'}
              </option>
              {campuses.data?.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester
            <select
              value={semesterId}
              disabled={!campusId || semesters.isLoading}
              onChange={(event) => {
                setSemesterId(event.target.value);
                setOfferingId('');
              }}
            >
              <option value="">
                {semesters.isLoading ? 'Loading semesters…' : 'Select semester'}
              </option>
              {semesters.data?.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {campuses.isError || semesters.isError || offerings.isError ? (
        <p className="form-error" role="alert">
          {campuses.error?.message ??
            semesters.error?.message ??
            offerings.error?.message}
        </p>
      ) : null}

      {semesterId && offerings.data && (
        <BatchTimetableImport
          key={semesterId}
          offerings={offerings.data.offerings}
          onChanged={refresh}
        />
      )}
      <div className="timetable-layout">
        <div className="offering-list" aria-label="Subject offerings">
          <div className="subheading-row">
            <h3>1. Choose a subject</h3>
            <span>
              {selectionIsLoading
                ? 'Loading…'
                : `${offerings.data?.offerings.length ?? 0} subjects`}
            </span>
          </div>
          {selectionIsLoading ? (
            <LoadingSkeleton
              variant="list"
              count={3}
              label="Loading subject offerings"
            />
          ) : (
            offerings.data?.offerings.map((offering) => (
              <button
                key={offering.id}
                className={offering.id === offeringId ? 'selected' : ''}
                onMouseEnter={() =>
                  void queryClient.prefetchQuery({
                    queryKey: ['timetable', 'offering', offering.id],
                    queryFn: () => timetableApi.offering(offering.id),
                    staleTime: 60_000,
                  })
                }
                onFocus={() =>
                  void queryClient.prefetchQuery({
                    queryKey: ['timetable', 'offering', offering.id],
                    queryFn: () => timetableApi.offering(offering.id),
                    staleTime: 60_000,
                  })
                }
                onClick={() => setOfferingId(offering.id)}
              >
                <strong>{offering.subject.name}</strong>
                <span>
                  {offering.subject.code} · {offering.batch.name}
                </span>
                <small>
                  {formatMinutes(offering.weeklyPlannedMinutes)} weekly ·{' '}
                  {offering.generatedSessions} classes
                </small>
              </button>
            ))
          )}
          {!selectionIsLoading &&
          semesterId &&
          offerings.data?.offerings.length === 0 ? (
            <p className="empty-copy">
              No subjects have been added to this semester yet.
            </p>
          ) : null}
        </div>

        <div className="timetable-detail">
          {selectionIsLoading ? (
            <LoadingSkeleton variant="panel" label="Loading timetable data" />
          ) : campuses.isError ||
            semesters.isError ||
            offerings.isError ? null : !offeringId ? (
            <div className="empty-state">
              <span>01</span>
              <h3>{semesterId ? 'No subjects' : 'Select a semester'}</h3>
              <p>
                {semesterId
                  ? 'Ask the admin/program manager to link subjects to a batch under Semester setup → select semester → Subjects and batches. Then return here to schedule classes.'
                  : 'Choose a semester to view its timetable.'}
              </p>
            </div>
          ) : detail.isLoading ? (
            <LoadingSkeleton
              variant="table"
              label="Building timetable summary"
            />
          ) : detail.isError ? (
            <p className="form-error" role="alert">
              {detail.error.message}
            </p>
          ) : detail.data ? (
            <TimetableDetail
              key={offeringId}
              detail={detail.data}
              offeringId={offeringId}
              onChanged={refresh}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TimetableDetail({
  detail,
  offeringId,
  onChanged,
}: {
  detail: OfferingTimetable;
  offeringId: string;
  onChanged: () => Promise<void>;
}) {
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const generate = useMutation({
    mutationFn: () => timetableApi.generate(offeringId),
    onSuccess: onChanged,
  });
  const archive = useMutation({
    mutationFn: timetableApi.archiveEntry,
    onSuccess: onChanged,
  });

  return (
    <>
      <div className="schedule-selection">
        <strong>{detail.subject.name}</strong>
        <span>
          {detail.batch.name} · {detail.semester.name}
        </span>
      </div>
      <div className="timetable-summary">
        <div>
          <span>Hours per week</span>
          <strong>{formatMinutes(detail.summary.weeklyPlannedMinutes)}</strong>
        </div>
        <div>
          <span>Scheduled classes</span>
          <strong>{detail.summary.generatedSessions}</strong>
        </div>
        <div>
          <span>Total teaching hours</span>
          <strong>
            {formatMinutes(detail.summary.semesterPlannedMinutes)}
          </strong>
        </div>
      </div>

      <div className="timetable-grid">
        <EntryForm
          key={editingEntry?.id || offeringId}
          entry={editingEntry}
          onCancel={() => setEditingEntry(null)}
          detail={detail}
          offeringId={offeringId}
          onChanged={onChanged}
        />
        <div className="weekly-slots">
          <div className="subheading-row">
            <h3>Weekly schedule</h3>
            <button
              className="text-button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending || archive.isPending}
            >
              Update class dates
            </button>
          </div>
          <p className="schedule-help">
            Your recurring classes. Update class dates after changing the
            semester calendar.
          </p>
          {detail.entries
            .filter((entry) => entry.active)
            .map((entry) => (
              <div className="weekly-slot" key={entry.id}>
                <div>
                  <strong>{weekdayLabels[entry.weekday]}</strong>
                  <span>
                    {entry.startTime}–{entry.endTime} ·{' '}
                    {formatMinutes(entry.plannedMinutes)}
                  </span>
                  <small>
                    {detail.facultyAssignments.find(
                      (a) => a.id === entry.facultyAssignmentId,
                    )?.staff.name || 'Teacher not assigned'}{' '}
                    · {entry.effectiveFrom} to {entry.effectiveTo}
                  </small>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Edit ${weekdayLabels[entry.weekday]} ${entry.startTime} class`}
                    onClick={() => setEditingEntry(entry)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => archive.mutate(entry.id)}
                    disabled={archive.isPending}
                  >
                    Stop repeating
                  </button>
                </div>
              </div>
            ))}
          {!detail.entries.some((entry) => entry.active) ? (
            <p className="empty-copy">
              No weekly classes yet. Add the day and time for this subject.
            </p>
          ) : null}
          {generate.error || archive.error ? (
            <p className="form-error" role="alert">
              {generate.error?.message ?? archive.error?.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="session-preview">
        <div className="subheading-row">
          <h3>3. Review class dates</h3>
          <span>{detail.semester.campus.timezone}</span>
        </div>
        <div
          className="schedule-date-list"
          tabIndex={0}
          role="region"
          aria-label="All scheduled class dates"
        >
          {detail.sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <time>{session.sessionDate}</time>
              <span>
                {localTime(session.startsAt, detail.semester.campus.timezone)}–
                {localTime(session.endsAt, detail.semester.campus.timezone)}
              </span>
              <b>{session.plannedMinutes} min</b>
            </div>
          ))}
        </div>
        {detail.sessions.length === 0 ? (
          <p className="empty-copy">
            Save a weekly class above to see all its teaching dates here.
          </p>
        ) : null}
      </div>
    </>
  );
}

function EntryForm({
  entry,
  onCancel,
  detail,
  offeringId,
  onChanged,
}: {
  detail: OfferingTimetable;
  offeringId: string;
  onChanged: () => Promise<void>;
  entry: TimetableEntry | null;
  onCancel: () => void;
}) {
  const formHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (entry) formHeading.current?.focus();
  }, [entry]);
  const [weekday, setWeekday] = useState(entry?.weekday ?? 1);
  const [startTime, setStartTime] = useState(entry?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(entry?.endTime ?? '10:00');
  const [effectiveFrom, setEffectiveFrom] = useState(
    entry?.effectiveFrom ?? detail.semester.startDate,
  );
  const [effectiveTo, setEffectiveTo] = useState(
    entry?.effectiveTo ?? detail.semester.endDate,
  );
  const [facultyAssignmentId, setFacultyAssignmentId] = useState(
    entry?.facultyAssignmentId ?? '',
  );
  const mutation = useMutation({
    mutationFn: () =>
      (entry ? timetableApi.updateEntry : timetableApi.createEntry)(
        entry?.id || offeringId,
        {
          weekday,
          startTime,
          endTime,
          effectiveFrom,
          effectiveTo,
          facultyAssignmentId: facultyAssignmentId || null,
        },
      ),
    onSuccess: onChanged,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form className="setup-card timetable-form" onSubmit={submit}>
      <div className="subheading-row">
        <h3 tabIndex={-1} ref={formHeading}>
          {entry ? 'Edit weekly class' : '2. Add a weekly class'}
        </h3>
        {entry && (
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>
      <p className="schedule-help">
        This class repeats every {weekdayLabels[weekday]} between the dates
        below. Closed days are skipped automatically.
      </p>
      <label>
        Day of the week
        <select
          value={weekday}
          onChange={(event) => setWeekday(Number(event.target.value))}
        >
          {weekdayLabels.slice(1).map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="field-pair">
        <label>
          Start time
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
          />
        </label>
        <label>
          End time
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            required
          />
        </label>
      </div>
      <div className="field-pair">
        <label>
          Repeat from
          <input
            type="date"
            min={detail.semester.startDate}
            max={effectiveTo}
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
          />
        </label>
        <label>
          Repeat until
          <input
            type="date"
            min={effectiveFrom}
            max={detail.semester.endDate}
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Teacher (optional)
        <select
          value={facultyAssignmentId}
          onChange={(event) => setFacultyAssignmentId(event.target.value)}
        >
          <option value="">Choose later</option>
          {detail.facultyAssignments
            .filter((assignment) => assignment.active)
            .map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.staff.name} · {assignment.type.replaceAll('_', ' ')}
              </option>
            ))}
        </select>
      </label>
      {mutation.error ? (
        <p className="form-error" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p role="status" className="schedule-help">
          Weekly class saved. Review the class dates below.
        </p>
      ) : null}
      <button disabled={mutation.isPending}>
        {mutation.isPending
          ? 'Saving schedule…'
          : entry
            ? 'Save timetable changes'
            : 'Save weekly class'}
      </button>
    </form>
  );
}

function formatMinutes(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function localTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
