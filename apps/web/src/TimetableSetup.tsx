import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { academicApi } from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';
import { OfferingTimetable, timetableApi } from './timetable';

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
    enabled: Boolean(campusId),
  });
  const offerings = useQuery({
    queryKey: ['timetable', 'offerings', semesterId],
    queryFn: () => timetableApi.offerings(semesterId),
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
    await queryClient.invalidateQueries({
      queryKey: ['timetable', 'offering', offeringId],
    });
    await queryClient.invalidateQueries({
      queryKey: ['timetable', 'offerings', semesterId],
    });
  };

  return (
    <section className="timetable-workspace" aria-labelledby="timetable-title">
      <div className="workspace-heading">
        <div>
          <h2 id="timetable-title">Weekly timetable</h2>
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

      <div className="timetable-layout">
        <div className="offering-list" aria-label="Subject offerings">
          <div className="subheading-row">
            <h3>Subjects and batches</h3>
            <span>
              {selectionIsLoading
                ? 'Loading…'
                : `${offerings.data?.offerings.length ?? 0} offerings`}
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
                onClick={() => setOfferingId(offering.id)}
              >
                <strong>{offering.subject.name}</strong>
                <span>
                  {offering.subject.code} · {offering.batch.name}
                </span>
                <small>
                  {formatMinutes(offering.weeklyPlannedMinutes)} weekly ·{' '}
                  {offering.generatedSessions} sessions
                </small>
              </button>
            ))
          )}
          {!selectionIsLoading &&
          semesterId &&
          offerings.data?.offerings.length === 0 ? (
            <p className="empty-copy">
              No subject offerings are attached to this semester yet.
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
              <h3>
                {semesterId ? 'No subject offerings' : 'Select a semester'}
              </h3>
              <p>
                {semesterId
                  ? 'This semester has no subject offerings yet.'
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
      <div className="timetable-summary">
        <div>
          <span>Weekly teaching</span>
          <strong>{formatMinutes(detail.summary.weeklyPlannedMinutes)}</strong>
        </div>
        <div>
          <span>Dated sessions</span>
          <strong>{detail.summary.generatedSessions}</strong>
        </div>
        <div>
          <span>Semester teaching</span>
          <strong>
            {formatMinutes(detail.summary.semesterPlannedMinutes)}
          </strong>
        </div>
      </div>

      <div className="timetable-grid">
        <EntryForm
          detail={detail}
          offeringId={offeringId}
          onChanged={onChanged}
        />
        <div className="weekly-slots">
          <div className="subheading-row">
            <h3>Weekly slots</h3>
            <button
              className="text-button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              Regenerate dates
            </button>
          </div>
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
                </div>
                <button
                  className="text-button danger"
                  onClick={() => archive.mutate(entry.id)}
                  disabled={archive.isPending}
                >
                  Archive
                </button>
              </div>
            ))}
          {!detail.entries.some((entry) => entry.active) ? (
            <p className="empty-copy">No weekly slot has been added.</p>
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
          <h3>Generated teaching dates</h3>
          <span>{detail.semester.campus.timezone}</span>
        </div>
        {detail.sessions.slice(0, 12).map((session) => (
          <div className="session-row" key={session.id}>
            <time>{session.sessionDate}</time>
            <span>
              {localTime(session.startsAt, detail.semester.campus.timezone)}–
              {localTime(session.endsAt, detail.semester.campus.timezone)}
            </span>
            <b>{session.plannedMinutes} min</b>
          </div>
        ))}
        {detail.sessions.length === 0 ? (
          <p className="empty-copy">
            Add a weekly slot to generate dated sessions.
          </p>
        ) : null}
      </div>
    </>
  );
}

function EntryForm({
  detail,
  offeringId,
  onChanged,
}: {
  detail: OfferingTimetable;
  offeringId: string;
  onChanged: () => Promise<void>;
}) {
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [effectiveFrom, setEffectiveFrom] = useState(detail.semester.startDate);
  const [effectiveTo, setEffectiveTo] = useState(detail.semester.endDate);
  const [facultyAssignmentId, setFacultyAssignmentId] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      timetableApi.createEntry(offeringId, {
        weekday,
        startTime,
        endTime,
        effectiveFrom,
        effectiveTo,
        facultyAssignmentId: facultyAssignmentId || null,
      }),
    onSuccess: onChanged,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form className="setup-card timetable-form" onSubmit={submit}>
      <h3>Add weekly slot</h3>
      <label>
        Day
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
          Starts
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
          />
        </label>
        <label>
          Ends
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
          Effective from
          <input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
          />
        </label>
        <label>
          Effective to
          <input
            type="date"
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Faculty
        <select
          value={facultyAssignmentId}
          onChange={(event) => setFacultyAssignmentId(event.target.value)}
        >
          <option value="">Unassigned</option>
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
      <button disabled={mutation.isPending}>
        {mutation.isPending ? 'Generating sessions…' : 'Add and generate'}
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
