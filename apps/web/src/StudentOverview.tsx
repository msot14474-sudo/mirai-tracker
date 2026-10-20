import { useQuery } from '@tanstack/react-query';
import { BufferRatio } from './BufferRatio';
import {
  StudentExam,
  StudentSubject,
  StudentTopic,
  studentViewApi,
} from './studentView';
import { LoadingSkeleton } from './LoadingSkeleton';

const examTypeLabels: Record<StudentExam['type'], string> = {
  SESSIONAL: 'Sessional',
  MID_TERM: 'Mid-term',
  PUT: 'Pre-university test',
  END_TERM: 'End-term',
  OTHER: 'Exam',
};

export function StudentOverview() {
  const asOfDate = today();
  const overview = useQuery({
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
    queryKey: ['student-overview', asOfDate],
    queryFn: () => studentViewApi.overview(asOfDate),
  });

  return (
    <section
      id="student-overview"
      className="student-overview"
      aria-labelledby="student-overview-title"
    >
      <div className="student-overview-heading">
        <div>
          <p className="step-label">Student view</p>
          <h2 id="student-overview-title">My subjects</h2>
          <p>
            Your teachers, class dates, syllabus and exams, together in one
            place. Subjects are linked to your enrolled batch and campus.
          </p>
        </div>
      </div>

      {overview.isLoading ? (
        <LoadingSkeleton variant="panel" label="Loading your batch" />
      ) : overview.isError ? (
        <div className="form-error" role="alert">
          <p>{overview.error.message}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void overview.refetch()}
          >
            Try again
          </button>
        </div>
      ) : !overview.data?.batch ? (
        <div className="empty-state compact-empty">
          <span>13</span>
          <h3>Batch details unavailable</h3>
          <p>Your coordinator can verify your active student enrolment.</p>
        </div>
      ) : (
        <>
          <div className="student-batch-banner">
            <div>
              <span>Your batch</span>
              <strong>{overview.data.batch.name}</strong>
            </div>
            <dl>
              <div>
                <dt>Tracks in your batch</dt>
                <dd>
                  {overview.data.batch.tracks?.map((t) => t.name).join(', ') ||
                    'Not assigned yet'}
                </dd>
              </div>
              <div>
                <dt>Campus</dt>
                <dd>{overview.data.batch.semester.campus.name}</dd>
              </div>
              <div>
                <dt>Semester</dt>
                <dd>{overview.data.batch.semester.name}</dd>
              </div>
            </dl>
          </div>

          <section
            className="student-subjects"
            aria-labelledby="my-subjects-title"
          >
            <div className="student-section-heading">
              <div>
                <p className="step-label">Covered and coming next</p>
                <h3 id="my-subjects-title">Subjects in your batch</h3>
              </div>
              <span>{overview.data.subjects.length} subjects</span>
            </div>
            {!overview.data.subjects.length ? (
              <p className="empty-copy">
                No subjects have been linked to your batch yet. Your campus
                manager can add them.
              </p>
            ) : (
              <div className="student-subject-grid">
                {overview.data.subjects.map((subject) => (
                  <StudentSubjectCard
                    subject={subject}
                    timezone={
                      overview.data!.batch.semester.campus.timezone ||
                      'Asia/Kolkata'
                    }
                    key={subject.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section
            className="student-exams"
            aria-labelledby="student-exams-title"
          >
            <div className="student-section-heading">
              <div>
                <p className="step-label">Dates and published syllabus</p>
                <h3 id="student-exams-title">Exams</h3>
              </div>
              <span>{overview.data.exams.length} upcoming or in progress</span>
            </div>
            {overview.data.exams.length ? (
              <div className="student-exam-list">
                {overview.data.exams.map((exam) => (
                  <StudentExamCard exam={exam} key={exam.id} />
                ))}
              </div>
            ) : (
              <p className="empty-copy">No upcoming exams are scheduled.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function StudentSubjectCard({
  subject,
  timezone,
}: {
  subject: StudentSubject;
  timezone: string;
}) {
  const coverage = subject.coveragePercentage ?? 0;
  return (
    <article className="student-subject-card">
      <header>
        <div>
          <small>
            {subject.subject.code}
            {subject.track ? ` · ${subject.track.name} track` : ''}
          </small>
          <h4>{subject.subject.name}</h4>
        </div>
        <strong>
          {subject.coveragePercentage === null ? '—' : `${number(coverage)}%`}
        </strong>
      </header>
      <p className="student-teacher">
        <span>Teacher</span>
        <strong>
          {subject.teachers?.map((teacher) => teacher.name).join(', ') ||
            'Teacher to be assigned'}
        </strong>
      </p>
      {subject.coveragePercentage !== null && (
        <div
          className="student-coverage-bar"
          aria-label={`${number(coverage)}% covered`}
        >
          <span style={{ width: `${Math.min(100, Math.max(0, coverage))}%` }} />
        </div>
      )}
      <div className="student-subject-summary">
        <span>
          <small>Recorded coverage</small>
          {subject.totalTopics
            ? `${hours(subject.coveredHours)} / ${hours(subject.plannedHours)}`
            : 'Plan not published'}
        </span>
        <span>
          <small>Weekly teaching</small>
          {subject.weeklyClasses?.length
            ? `${hours(subject.weeklyHours)} per week`
            : 'Timetable pending'}
        </span>
      </div>

      <BufferRatio metrics={subject.buffer} />
      <div className="student-topic-section covered-work">
        <h5>What we covered</h5>
        {subject.coveredTopics.length ? (
          subject.coveredTopics
            .slice(-3)
            .map((topic) => (
              <StudentTopicRow topic={topic} key={topic.id} mode="covered" />
            ))
        ) : (
          <p>No topics have been marked covered yet.</p>
        )}
      </div>

      <div className="student-topic-section next-work">
        <h5>Coming next</h5>
        {subject.comingNextTopics.length ? (
          subject.comingNextTopics.map((topic, index) => (
            <StudentTopicRow
              topic={topic}
              key={topic.id}
              mode="next"
              index={index}
            />
          ))
        ) : (
          <p>
            {!subject.totalTopics
              ? 'Your teacher has not published a lesson plan yet.'
              : subject.completedTopics === subject.totalTopics
                ? 'All published topics are complete.'
                : 'The next topics are being planned.'}
          </p>
        )}
      </div>
      <div className="student-topic-section student-class-dates">
        <h5>Next classes</h5>
        <p className="student-timezone">
          Times in {timezone.replaceAll('_', ' ')}
        </p>
        {subject.upcomingClasses?.length ? (
          <ul>
            {subject.upcomingClasses.map((session) => (
              <li key={session.id}>
                <strong>{displayDate(session.date)}</strong>
                <span>
                  {displayTime(session.startsAt, timezone)}–
                  {displayTime(session.endsAt, timezone)}
                  {session.isExtraClass ? ' · Extra class' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No upcoming class dates have been scheduled.</p>
        )}
      </div>
      {!!subject.syllabusTopics?.length && (
        <details className="student-plan-details">
          <summary>
            View teaching plan · {subject.completedTopics} of{' '}
            {subject.totalTopics} topics complete
          </summary>
          {subject.syllabusTopics.map((topic, index) => (
            <StudentTopicRow
              topic={topic}
              key={topic.id}
              mode={topic.status === 'COMPLETED' ? 'covered' : 'next'}
              index={index}
            />
          ))}
        </details>
      )}
      {!!subject.weeklyClasses?.length && (
        <details className="student-plan-details">
          <summary>View weekly timetable</summary>
          <ul className="student-weekly-list">
            {subject.weeklyClasses.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {
                    [
                      'Sunday',
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                    ][entry.weekday]
                  }
                </strong>
                <span>
                  {entry.startTime}–{entry.endTime}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function StudentTopicRow({
  topic,
  mode,
  index,
}: {
  topic: StudentTopic;
  mode: 'covered' | 'next';
  index?: number;
}) {
  return (
    <div className="student-topic-row">
      <span className="student-topic-marker">
        {mode === 'covered' ? '✓' : String((index ?? 0) + 1).padStart(2, '0')}
      </span>
      <div>
        <strong>{topic.title}</strong>
        <small>
          Unit {topic.unit.sequence} · {topic.unit.title}
        </small>
        <span>
          {mode === 'covered'
            ? `${number(topic.completionPercentage)}% complete`
            : topic.status === 'IN_PROGRESS'
              ? `In progress · ${number(topic.completionPercentage)}% complete`
              : topic.plannedStartDate
                ? `Planned ${displayDate(topic.plannedStartDate)}`
                : 'Date being planned'}
        </span>
      </div>
    </div>
  );
}

function StudentExamCard({ exam }: { exam: StudentExam }) {
  return (
    <article className="student-exam-card">
      <header>
        <div>
          <span>{examTypeLabels[exam.type]}</span>
          <h4>{exam.name}</h4>
        </div>
        <strong>
          {exam.isOngoing
            ? 'IN PROGRESS'
            : exam.daysUntilExam === 0
              ? 'TODAY'
              : `${exam.daysUntilExam} DAYS`}
        </strong>
      </header>
      <div className="student-exam-dates">
        <span>
          <small>Exam</small>
          {displayDate(exam.startDate)}–{displayDate(exam.endDate)}
        </span>
        <span>
          <small>Syllabus deadline</small>
          {displayDate(exam.syllabusDeadline)}
        </span>
      </div>
      <div className="student-exam-scope">
        <h5>Syllabus scope</h5>
        {exam.subjects.length ? (
          exam.subjects.map((subject) => (
            <div className="student-exam-subject" key={subject.id}>
              <strong>
                {subject.subject.code} · {subject.subject.name}
              </strong>
              <div>
                {subject.topics.map((topic) => (
                  <span key={topic.id}>{topic.title}</span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p>Scope has not been published yet.</p>
        )}
      </div>
    </article>
  );
}

function number(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
    value,
  );
}

function hours(value: number) {
  return `${number(value)}h`;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function displayTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

function today() {
  const current = new Date();
  const offset = current.getTimezoneOffset() * 60_000;
  return new Date(current.getTime() - offset).toISOString().slice(0, 10);
}
