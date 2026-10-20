import { StudentLectureFeedback } from './StudentLectureFeedback';
import { useQuery } from '@tanstack/react-query';
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
          <h2 id="student-overview-title">My course progress</h2>
          <p>
            Review what your class has covered, see what comes next and prepare
            from the exact syllabus mapped to each exam.
          </p>
        </div>
      </div>

      {overview.isLoading ? (
        <LoadingSkeleton variant="panel" label="Loading your batch" />
      ) : overview.isError ? (
        <p className="form-error" role="alert">
          {overview.error.message}
        </p>
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
                    'Mirai · University'}
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

          <StudentLectureFeedback />

          <section
            className="student-subjects"
            aria-labelledby="my-subjects-title"
          >
            <div className="student-section-heading">
              <div>
                <p className="step-label">Covered and coming next</p>
                <h3 id="my-subjects-title">My subjects</h3>
              </div>
              <span>{overview.data.subjects.length} subjects</span>
            </div>
            <div className="student-subject-grid">
              {overview.data.subjects.map((subject) => (
                <StudentSubjectCard subject={subject} key={subject.id} />
              ))}
            </div>
          </section>

          <section
            className="student-exams"
            aria-labelledby="student-exams-title"
          >
            <div className="student-section-heading">
              <div>
                <p className="step-label">Dates and exact scope</p>
                <h3 id="student-exams-title">Upcoming exams</h3>
              </div>
              <span>{overview.data.exams.length} upcoming</span>
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

function StudentSubjectCard({ subject }: { subject: StudentSubject }) {
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
      <div
        className="student-coverage-bar"
        aria-label={`${number(coverage)}% covered`}
      >
        <span style={{ width: `${coverage}%` }} />
      </div>
      <div className="student-subject-summary">
        <span>
          <small>Covered</small>
          {hours(subject.coveredHours)} / {hours(subject.plannedHours)}
        </span>
        <span>
          <small>Topics complete</small>
          {subject.completedTopics} / {subject.totalTopics}
        </span>
      </div>

      <div className="student-topic-section covered-work">
        <h5>What we covered</h5>
        {subject.coveredTopics.length ? (
          subject.coveredTopics.map((topic) => (
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
          <p>All planned topics are complete.</p>
        )}
      </div>
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
          {exam.daysUntilExam === 0 ? 'TODAY' : `${exam.daysUntilExam} DAYS`}
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

function today() {
  const current = new Date();
  const offset = current.getTimezoneOffset() * 60_000;
  return new Date(current.getTime() - offset).toISOString().slice(0, 10);
}
