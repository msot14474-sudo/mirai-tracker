import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  formatTeachingTime,
  LessonPlanDetail,
  LessonPlanPreview,
  LessonPlanUnit,
  lessonPlanApi,
} from './lessonPlans';

export function LessonPlanWorkspace() {
  const [offeringId, setOfferingId] = useState('');
  const offerings = useQuery({
    queryKey: ['lesson-plans', 'offerings'],
    queryFn: lessonPlanApi.offerings,
  });
  const detail = useQuery({
    queryKey: ['lesson-plans', 'offering', offeringId],
    queryFn: () => lessonPlanApi.offering(offeringId),
    enabled: Boolean(offeringId),
  });
  useEffect(() => {
    if (!offeringId && offerings.data?.[0]) setOfferingId(offerings.data[0].id);
  }, [offeringId, offerings.data]);

  return (
    <section
      className="lesson-plan-workspace"
      aria-labelledby="lesson-plan-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="step-label">M07 · Syllabus structure</p>
          <h2 id="lesson-plan-title">Lesson plans and exam scope</h2>
          <p>
            Upload the teaching sequence, verify every planned hour and map
            exact topics to each exam window.
          </p>
        </div>
        <div className="template-actions" aria-label="Lesson plan templates">
          <a href={lessonPlanApi.templateUrl('xlsx')}>Excel template</a>
          <a href={lessonPlanApi.templateUrl('csv')}>CSV template</a>
        </div>
      </div>

      {offerings.isError ? (
        <p className="form-error" role="alert">
          {offerings.error.message}
        </p>
      ) : null}

      <div className="lesson-plan-layout">
        <div className="plan-offering-list" aria-label="Lesson plan offerings">
          <div className="subheading-row">
            <h3>Your subject offerings</h3>
            <span>{offerings.data?.length ?? 0}</span>
          </div>
          {offerings.data?.map((offering) => (
            <button
              key={offering.id}
              className={offering.id === offeringId ? 'selected' : ''}
              onClick={() => setOfferingId(offering.id)}
            >
              <strong>{offering.subject.name}</strong>
              <span>
                {offering.batch.name} · {offering.batch.semester.campus.name}
              </span>
              <small>
                {offering.plan
                  ? `v${offering.plan.version} · ${formatTeachingTime(offering.plan.totalPlannedMinutes)}`
                  : 'No lesson plan'}
              </small>
            </button>
          ))}
          {offerings.data?.length === 0 ? (
            <p className="empty-copy">
              No editable subject offering is assigned to you.
            </p>
          ) : null}
        </div>

        <div className="plan-detail">
          {!offeringId ? (
            <div className="empty-state">
              <span>01</span>
              <h3>Select a subject offering</h3>
              <p>
                Its current lesson-plan version and exam scopes appear here.
              </p>
            </div>
          ) : detail.isLoading ? (
            <p>Loading lesson plan…</p>
          ) : detail.isError ? (
            <p className="form-error" role="alert">
              {detail.error.message}
            </p>
          ) : detail.data ? (
            <LessonPlanDetailView detail={detail.data} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LessonPlanDetailView({ detail }: { detail: LessonPlanDetail }) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['lesson-plans', 'offering', detail.id],
    });
    await queryClient.invalidateQueries({
      queryKey: ['lesson-plans', 'offerings'],
    });
  };
  const activate = useMutation({
    mutationFn: () => lessonPlanApi.activate(detail.plan!.id),
    onSuccess: refresh,
  });

  return (
    <>
      <PlanUpload offeringId={detail.id} onImported={refresh} />
      {detail.plan ? (
        <>
          <div className="plan-summary">
            <div>
              <span>Version</span>
              <strong>v{detail.plan.version}</strong>
            </div>
            <div>
              <span>Units</span>
              <strong>{detail.plan.summary.units}</strong>
            </div>
            <div>
              <span>Topics</span>
              <strong>{detail.plan.summary.topics}</strong>
            </div>
            <div>
              <span>Planned teaching</span>
              <strong>
                {formatTeachingTime(detail.plan.summary.totalPlannedMinutes)}
              </strong>
            </div>
          </div>
          <div className="plan-version-bar">
            <div>
              <span
                className={`status-pill ${detail.plan.status.toLowerCase()}`}
              >
                {detail.plan.status}
              </span>
              <small>{detail.plan.fileName ?? 'Manually created plan'}</small>
            </div>
            {detail.plan.status === 'DRAFT' ? (
              <button
                className="secondary-button"
                onClick={() => activate.mutate()}
                disabled={activate.isPending}
              >
                {activate.isPending ? 'Activating…' : 'Activate this version'}
              </button>
            ) : null}
          </div>
          {activate.error ? (
            <p className="form-error">{activate.error.message}</p>
          ) : null}

          <div className="plan-units">
            {detail.plan.units.map((unit) => (
              <UnitEditor
                key={unit.id}
                unit={unit}
                editable={detail.plan?.status === 'DRAFT'}
                onSaved={refresh}
              />
            ))}
          </div>

          <ExamScopeEditor detail={detail} onSaved={refresh} />
        </>
      ) : (
        <div className="empty-state compact-empty">
          <span>02</span>
          <h3>Upload the first lesson plan</h3>
          <p>
            The supplied template includes sample units, topics, hours and exam
            scope.
          </p>
        </div>
      )}
    </>
  );
}

function PlanUpload({
  offeringId,
  onImported,
}: {
  offeringId: string;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LessonPlanPreview | null>(null);
  const previewMutation = useMutation({
    mutationFn: () => lessonPlanApi.preview(offeringId, file!),
    onSuccess: setPreview,
  });
  const importMutation = useMutation({
    mutationFn: () => lessonPlanApi.import(offeringId, file!),
    onSuccess: async () => {
      setFile(null);
      setPreview(null);
      await onImported();
    },
  });

  return (
    <div className="plan-upload-card">
      <div>
        <p className="step-label">New version</p>
        <h3>Upload lesson plan</h3>
        <p>CSV or Excel · maximum 2 MB · planned time in whole minutes</p>
      </div>
      <label className="file-picker compact-picker">
        Lesson-plan file
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPreview(null);
          }}
        />
      </label>
      <div className="upload-actions">
        <button
          className="secondary-button"
          disabled={!file || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          {previewMutation.isPending ? 'Checking…' : 'Preview'}
        </button>
        <button
          disabled={!file || !preview?.valid || importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending ? 'Importing…' : 'Import new version'}
        </button>
      </div>
      {preview ? (
        <div className={`plan-preview ${preview.valid ? 'valid' : 'invalid'}`}>
          <strong>
            {preview.valid ? 'Ready to import' : 'Needs correction'}
          </strong>
          <span>
            {preview.counts.units} units · {preview.counts.topics} topics ·{' '}
            {formatTeachingTime(preview.counts.totalPlannedMinutes)}
          </span>
          {preview.issues.slice(0, 5).map((issue, index) => (
            <small key={`${issue.rowNumber}-${issue.columnName}-${index}`}>
              Row {issue.rowNumber || 'file'} · {issue.columnName ?? 'file'}:{' '}
              {issue.errorMessage}
            </small>
          ))}
        </div>
      ) : null}
      {previewMutation.error || importMutation.error ? (
        <p className="form-error" role="alert">
          {previewMutation.error?.message ?? importMutation.error?.message}
        </p>
      ) : null}
    </div>
  );
}

function UnitEditor({
  unit,
  editable,
  onSaved,
}: {
  unit: LessonPlanUnit;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: (input: { title: string; description: string | null }) =>
      lessonPlanApi.updateUnit(unit.id, input),
    onSuccess: onSaved,
  });

  return (
    <article className="plan-unit">
      <form
        className="unit-heading"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          mutation.mutate({
            title: String(values.get('title') ?? ''),
            description: String(values.get('description') ?? '') || null,
          });
        }}
      >
        <span className="unit-number">
          {String(unit.sequence).padStart(2, '0')}
        </span>
        <div>
          <input
            name="title"
            defaultValue={unit.title}
            disabled={!editable}
            aria-label={`Unit ${unit.sequence} title`}
          />
          <input
            name="description"
            defaultValue={unit.description ?? ''}
            disabled={!editable}
            placeholder="Unit description"
            aria-label={`Unit ${unit.sequence} description`}
          />
        </div>
        {editable ? <button className="text-button">Save unit</button> : null}
      </form>
      <div className="topic-list">
        {unit.topics.map((topic) => (
          <TopicEditor
            key={topic.id}
            topic={topic}
            editable={editable}
            onSaved={onSaved}
          />
        ))}
      </div>
      {mutation.error ? (
        <p className="form-error">{mutation.error.message}</p>
      ) : null}
    </article>
  );
}

function TopicEditor({
  topic,
  editable,
  onSaved,
}: {
  topic: LessonPlanUnit['topics'][number];
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: (input: {
      title: string;
      description: string | null;
      plannedMinutes: number;
    }) => lessonPlanApi.updateTopic(topic.id, input),
    onSuccess: onSaved,
  });
  return (
    <form
      className="topic-row"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        mutation.mutate({
          title: String(values.get('title') ?? ''),
          description: String(values.get('description') ?? '') || null,
          plannedMinutes: Number(values.get('plannedMinutes')),
        });
      }}
    >
      <span>{unitTopicLabel(topic.sequence)}</span>
      <div>
        <input
          name="title"
          defaultValue={topic.title}
          disabled={!editable}
          aria-label={`Topic ${topic.sequence} title`}
        />
        <input
          name="description"
          defaultValue={topic.description ?? ''}
          disabled={!editable}
          placeholder="Topic description"
          aria-label={`Topic ${topic.sequence} description`}
        />
      </div>
      <label>
        Minutes
        <input
          name="plannedMinutes"
          type="number"
          min="1"
          max="10080"
          defaultValue={topic.plannedMinutes}
          disabled={!editable}
          aria-label={`${topic.title} planned minutes`}
        />
      </label>
      {editable ? (
        <button className="text-button">Save</button>
      ) : (
        <b>{formatTeachingTime(topic.plannedMinutes)}</b>
      )}
      {mutation.error ? (
        <small className="form-error">{mutation.error.message}</small>
      ) : null}
    </form>
  );
}

function ExamScopeEditor({
  detail,
  onSaved,
}: {
  detail: LessonPlanDetail;
  onSaved: () => Promise<void>;
}) {
  const plan = detail.plan!;
  const topics = useMemo(
    () =>
      plan.units.flatMap((unit) =>
        unit.topics.map((topic) => ({ ...topic, unitTitle: unit.title })),
      ),
    [plan.units],
  );
  return (
    <section className="exam-scope-panel">
      <div className="subheading-row">
        <div>
          <p className="step-label">Assessment map</p>
          <h3>Exam syllabus scope</h3>
        </div>
        <span>Topic-level selection</span>
      </div>
      {detail.examWindows.map((exam) => (
        <ExamWindowScope
          key={exam.id}
          exam={exam}
          planId={plan.id}
          topics={topics}
          editable={plan.status === 'DRAFT'}
          onSaved={onSaved}
        />
      ))}
      {!detail.examWindows.length ? (
        <p className="empty-copy">
          Create exam windows in M04 before assigning scope.
        </p>
      ) : null}
    </section>
  );
}

function ExamWindowScope({
  exam,
  planId,
  topics,
  editable,
  onSaved,
}: {
  exam: LessonPlanDetail['examWindows'][number];
  planId: string;
  topics: Array<LessonPlanUnit['topics'][number] & { unitTitle: string }>;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const initial = topics
    .filter((topic) => topic.examScopes.some((scope) => scope.id === exam.id))
    .map((topic) => topic.id);
  const [selected, setSelected] = useState<string[]>(initial);
  useEffect(() => setSelected(initial), [topics, exam.id]);
  const mutation = useMutation({
    mutationFn: () => lessonPlanApi.setExamScope(planId, exam.id, selected),
    onSuccess: onSaved,
  });
  return (
    <details className="exam-scope" open>
      <summary>
        <span>
          <strong>{exam.name}</strong>
          <small>
            {exam.startDate} · scope due {exam.syllabusDeadline}
          </small>
        </span>
        <b>
          {selected.length}/{topics.length} topics
        </b>
      </summary>
      <div className="scope-topics">
        {topics.map((topic) => (
          <label key={topic.id}>
            <input
              type="checkbox"
              checked={selected.includes(topic.id)}
              disabled={!editable}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, topic.id]
                    : current.filter((id) => id !== topic.id),
                )
              }
            />
            <span>
              <strong>{topic.title}</strong>
              <small>
                {topic.unitTitle} · {formatTeachingTime(topic.plannedMinutes)}
              </small>
            </span>
          </label>
        ))}
      </div>
      {editable ? (
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving scope…' : `Save ${exam.name} scope`}
        </button>
      ) : null}
      {mutation.error ? (
        <p className="form-error">{mutation.error.message}</p>
      ) : null}
    </details>
  );
}

function unitTopicLabel(sequence: number) {
  return String(sequence).padStart(2, '0');
}
