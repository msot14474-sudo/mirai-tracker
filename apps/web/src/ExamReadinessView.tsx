import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ExamReadinessExam,
  ExamReadinessMetrics,
  ExamReadinessSubject,
  ExamReadinessTopic,
  examReadinessApi,
} from './examReadiness';
import { LoadingSkeleton } from './LoadingSkeleton';

const examTypeLabels: Record<ExamReadinessExam['type'], string> = {
  SESSIONAL: 'Sessional',
  MID_TERM: 'Mid-term',
  PUT: 'Pre-university test',
  END_TERM: 'End-term',
  OTHER: 'Exam',
};

export function ExamReadinessView({ campusId }: { campusId?: string }) {
  const [asOfDate, setAsOfDate] = useState(today());
  const readiness = useQuery({
    refetchInterval: 30000, refetchOnWindowFocus: 'always',
    queryKey: ['exam-readiness', asOfDate, campusId],
    queryFn: () => examReadinessApi.list(asOfDate, campusId),
  });
  const exams = readiness.data?.exams ?? [];

  return (
    <section
      id="exam-readiness"
      className="exam-readiness"
      aria-labelledby="exam-readiness-title"
    >
      <div className="exam-readiness-heading">
        <div>
          <h2 id="exam-readiness-title">Exam readiness</h2>
        </div>
        <div className="exam-date-control">
          <label htmlFor="exam-as-of">Readiness as of</label>
          <input
            id="exam-as-of"
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />
        </div>
      </div>

      <div className="exam-formula" role="note">
        <strong>Calculation</strong>
        <span>
          Only topics mapped to that exam count. Coverage is weighted by their
          planned hours.
        </span>
      </div>

      {readiness.isLoading ? (
        <LoadingSkeleton variant="cards" label="Checking upcoming exams" />
      ) : readiness.isError ? (
        <p className="form-error" role="alert">
          {readiness.error.message}
        </p>
      ) : exams.length === 0 ? (
        <div className="empty-state compact-empty">
          <h3>No upcoming exams</h3>
          <p>Future exam windows in your permitted scope will appear here.</p>
        </div>
      ) : (
        <div className="exam-list">
          {exams.map((exam) => (
            <ExamCard exam={exam} key={exam.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function ExamCard({ exam }: { exam: ExamReadinessExam }) {
  const state = readinessState(exam);
  return (
    <article className={`exam-card exam-${state.className}`}>
      <header className="exam-card-header">
        <div>
          <span className="exam-type">{examTypeLabels[exam.type]}</span>
          <h3>{exam.name}</h3>
          <p>
            {exam.campus.name} · {exam.semester.name}
          </p>
        </div>
        <div className="exam-countdown">
          <strong>{state.label}</strong>
          <span>
            {exam.daysUntilExam === 0
              ? 'Starts today'
              : `${exam.daysUntilExam} days to exam`}
          </span>
        </div>
      </header>

      <div className="exam-dates">
        <span>
          <small>Exam dates</small>
          {displayDate(exam.startDate)}–{displayDate(exam.endDate)}
        </span>
        <span className={exam.deadlinePassed ? 'deadline-passed' : ''}>
          <small>Syllabus deadline</small>
          {displayDate(exam.syllabusDeadline)}
          {exam.deadlinePassed ? ' · passed' : ''}
        </span>
      </div>

      {exam.coveragePercentage === null ? (
        <div className="exam-scope-warning">
          <strong>Scope mapping needed</strong>
          <span>
            Map lesson-plan topics to this exam before readiness can be
            calculated.
          </span>
        </div>
      ) : (
        <>
          <div className="exam-coverage-heading">
            <span>Teaching hours covered</span>
            <strong>{number(exam.coveragePercentage)}%</strong>
          </div>
          <div
            className="exam-coverage-bar"
            aria-label={`${number(exam.coveragePercentage)}% of in-scope hours covered`}
          >
            <span style={{ width: `${exam.coveragePercentage}%` }} />
          </div>
          <ReadinessMetrics metrics={exam} />
        </>
      )}

      <section className="exam-subjects" aria-label={`${exam.name} subjects`}>
        <div className="exam-subjects-title">
          <div>
            <h4>Readiness by subject</h4>
          </div>
          <span>{exam.subjects.length} mapped subjects</span>
        </div>
        <div className="exam-subject-grid">
          {exam.subjects.map((subject) => (
            <SubjectReadiness subject={subject} key={subject.id} />
          ))}
        </div>
      </section>
    </article>
  );
}

function SubjectReadiness({ subject }: { subject: ExamReadinessSubject }) {
  return (
    <article className="exam-subject-card">
      <div className="exam-subject-heading">
        <div>
          <small>
            {subject.subject.code} · {subject.batch.name}
          </small>
          <h5>{subject.subject.name}</h5>
          <span>{subject.track.name}</span>
        </div>
        <strong aria-label="Teaching hours covered">
          {subject.coveragePercentage === null
            ? '—'
            : `${number(subject.coveragePercentage)}%`}
        </strong>
      </div>
      <div className="exam-subject-hours">
        <span>
          <small>Covered</small>
          {hours(subject.coveredHours)}
        </span>
        <span>
          <small>Still needed</small>
          {hours(subject.hoursStillNeeded)}
        </span>
        <span>
          <small>
            Topics completed ·{' '}
            {subject.topicsInScope
              ? number((subject.completedTopics / subject.topicsInScope) * 100)
              : 0}
            %
          </small>
          {subject.completedTopics}/{subject.topicsInScope} complete
        </span>
      </div>
      <BufferRatio metrics={subject.buffer} />
      <div className="exam-topic-list">
        {subject.topics.map((topic) => (
          <TopicRow topic={topic} key={topic.id} />
        ))}
      </div>
    </article>
  );
}

function TopicRow({ topic }: { topic: ExamReadinessTopic }) {
  return (
    <div className="exam-topic-row">
      <div>
        <strong>{topic.title}</strong>
        <small>
          {number(topic.plannedMinutes / 60)}h planned ·{' '}
          {number(topic.completionPercentage)}% complete
        </small>
      </div>
      <span className={`topic-state ${topic.status.toLowerCase()}`}>
        {topic.status.replaceAll('_', ' ')}
      </span>
    </div>
  );
}

function ReadinessMetrics({ metrics }: { metrics: ExamReadinessMetrics }) {
  return (
    <dl className="exam-metrics">
      <div>
        <dt>Topics completed</dt>
        <dd>
          {metrics.completedTopics} / {metrics.topicsInScope}
        </dd>
      </div>
      <div>
        <dt>Topic completion</dt>
        <dd>
          {metrics.topicsInScope
            ? `${number((metrics.completedTopics / metrics.topicsInScope) * 100)}%`
            : '—'}
        </dd>
      </div>
      <div>
        <dt>Planned hours</dt>
        <dd>{hours(metrics.plannedHours)}</dd>
      </div>
      <div>
        <dt>Covered hours</dt>
        <dd>{hours(metrics.coveredHours)}</dd>
      </div>
      <div className={metrics.hoursStillNeeded > 0 ? 'hours-needed' : ''}>
        <dt>Hours still needed</dt>
        <dd>{hours(metrics.hoursStillNeeded)}</dd>
      </div>
    </dl>
  );
}

function readinessState(exam: ExamReadinessExam) {
  if (exam.topicsInScope === 0) {
    return { label: 'SCOPE NEEDED', className: 'unmapped' };
  }
  if (exam.hoursStillNeeded === 0) {
    return { label: 'READY', className: 'ready' };
  }
  return {
    label: `${hours(exam.hoursStillNeeded)} NEEDED`,
    className: 'preparing',
  };
}

function hours(value: number) {
  return `${number(value)}h`;
}

function number(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
    value,
  );
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
import { BufferRatio } from './BufferRatio';
