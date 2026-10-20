import { SubjectBufferRatio } from './BufferRatio';
import { FacultyPlanSchedule } from './FacultyPlanSchedule';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  formatTeachingTime,
  LessonPlanDetail,
  LessonPlanPreview,
  LessonPlanUnit,
  lessonPlanApi,
} from './lessonPlans';
import { LoadingSkeleton } from './LoadingSkeleton';

export function LessonPlanWorkspace({
  campusId,
  initialOfferingId = '',
}: {
  campusId?: string;
  initialOfferingId?: string;
}) {
  const queryClient = useQueryClient();
  const [offeringId, setOfferingId] = useState(initialOfferingId);
  const offerings = useQuery({
    queryKey: ['lesson-plans', 'offerings', campusId],
    queryFn: () => lessonPlanApi.offerings(campusId),
    staleTime: 15000,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
  });
  const selectedOfferingId = offerings.data?.some((o) => o.id === offeringId)
    ? offeringId
    : offerings.data?.[0]?.id || '';
  const detail = useQuery({
    queryKey: ['lesson-plans', 'offering', selectedOfferingId],
    queryFn: () => lessonPlanApi.offering(selectedOfferingId),
    enabled: Boolean(selectedOfferingId),
    staleTime: 15000,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
  });
  const selectionIsLoading = offerings.isLoading;

  return (
    <section
      className="lesson-plan-workspace"
      aria-labelledby="lesson-plan-title"
    >
      <div className="workspace-heading">
        <div>
          <h2 id="lesson-plan-title">Lesson plans and exam scope</h2>
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
            <span>
              {selectionIsLoading ? 'Loading…' : (offerings.data?.length ?? 0)}
            </span>
          </div>
          {selectionIsLoading ? (
            <LoadingSkeleton
              variant="list"
              count={3}
              label="Loading lesson-plan offerings"
            />
          ) : (
            offerings.data?.map((offering) => (
              <button
                key={offering.id}
                className={offering.id === selectedOfferingId ? 'selected' : ''}
                onMouseEnter={() =>
                  void queryClient.prefetchQuery({
                    queryKey: ['lesson-plans', 'offering', offering.id],
                    queryFn: () => lessonPlanApi.offering(offering.id),
                    staleTime: 60_000,
                  })
                }
                onFocus={() =>
                  void queryClient.prefetchQuery({
                    queryKey: ['lesson-plans', 'offering', offering.id],
                    queryFn: () => lessonPlanApi.offering(offering.id),
                    staleTime: 60_000,
                  })
                }
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
            ))
          )}
          {!selectionIsLoading && offerings.data?.length === 0 ? (
            <p className="empty-copy">
              No semester batch is assigned for teaching yet. Ask the
              admin/program manager to link your subject to its semester batch,
              then ask the campus manager to confirm your teaching assignment.
            </p>
          ) : null}
        </div>

        <div className="plan-detail">
          {selectionIsLoading ? (
            <LoadingSkeleton variant="panel" label="Loading lesson plan" />
          ) : offerings.isError &&
            !offerings.data ? null : !selectedOfferingId ? (
            <div className="empty-state">
              <span>01</span>
              <h3>No subject offerings</h3>
              <p>
                No semester batch is assigned for teaching yet. Ask the
                admin/program manager to link your subject to its semester
                batch, then ask the campus manager to confirm your teaching
                assignment.
              </p>
            </div>
          ) : detail.isLoading ? (
            <LoadingSkeleton variant="panel" label="Loading lesson plan" />
          ) : detail.isError ? (
            <p className="form-error" role="alert">
              {detail.error.message}
            </p>
          ) : detail.data ? (
            <LessonPlanDetailView key={detail.data.id} detail={detail.data} />
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
    await Promise.all(
      [
        'topic-schedules',
        'session-logs',
        'progress-dashboard',
        'reports',
        'exam-readiness',
        'student-overview',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
  const activate = useMutation({
    mutationFn: () => lessonPlanApi.activate(detail.plan!.id),
    onSuccess: refresh,
  });

  return (
    <>
      <FacultyPlanSchedule detail={detail} />
      <SubjectBufferRatio offeringId={detail.id} enabled={detail.plan?.status === 'ACTIVE' && detail.plan.summary.totalPlannedMinutes > 0} />
      <details
        className="plan-upload-disclosure"
        open={!detail.plan || undefined}
      >
        <summary>
          {detail.plan
            ? 'Add topics or upload a lesson plan'
            : 'Upload your lesson plan'}
        </summary>
        <PlanUpload
          offeringId={detail.id}
          currentPlanId={detail.plan?.id}
          onImported={refresh}
        />
      </details>
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
  currentPlanId,
  onImported,
}: {
  offeringId: string;
  currentPlanId?: string;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'APPEND' | 'REPLACE'>('APPEND');
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<LessonPlanPreview | null>(null);
  const previewMutation = useMutation({
    mutationFn: () =>
      lessonPlanApi.preview(offeringId, file!, {
        mode,
        basePlanId: currentPlanId,
      }),
    onSuccess: setPreview,
  });
  const importMutation = useMutation({
    mutationFn: () =>
      lessonPlanApi.import(offeringId, file!, {
        mode,
        basePlanId: preview?.basePlanId ?? currentPlanId,
      }),
    onSuccess: async () => {
      setFile(null);
      setInputKey((key) => key + 1);
      setPreview(null);
      await onImported();
    },
  });

  return (
    <div className="plan-upload-card">
      <div>
        <h3>Upload lesson plan</h3>
        <p>
          Upload the whole semester or add a few topics at a time. Teaching
          dates follow your assigned timetable.
        </p>
      </div>
      <div
        className="plan-import-choices"
        role="group"
        aria-label="Lesson-plan upload mode"
      >
        <label className={mode === 'APPEND' ? 'selected' : ''}>
          <input
            type="radio"
            name="planImportMode"
            value="APPEND"
            checked={mode === 'APPEND'}
            disabled={previewMutation.isPending || importMutation.isPending}
            onChange={() => {
              setMode('APPEND');
              setPreview(null);
              previewMutation.reset();
              importMutation.reset();
            }}
          />
          <span>
            <strong>Add topics to existing plan</strong>
            <small>
              Start with a partial file and add more later. Existing topics,
              progress and logs stay in place.
            </small>
          </span>
        </label>
        <label className={mode === 'REPLACE' ? 'selected' : ''}>
          <input
            type="radio"
            name="planImportMode"
            value="REPLACE"
            checked={mode === 'REPLACE'}
            disabled={previewMutation.isPending || importMutation.isPending}
            onChange={() => {
              setMode('REPLACE');
              setPreview(null);
              previewMutation.reset();
              importMutation.reset();
            }}
          />
          <span>
            <strong>New full-plan version</strong>
            <small>Create a replacement draft before teaching starts.</small>
          </span>
        </label>
      </div>
      <p className="plan-upload-hint">
        For additions, keep the original unit and topic numbers. New topics can
        continue from any number; identical rows are skipped. Planned time is in
        whole minutes.
      </p>
      <label className="file-picker compact-picker">
        <span className="file-picker-label">Lesson-plan file</span>
        <span className="file-picker-control">
          <input
            type="file"
            key={inputKey}
            disabled={previewMutation.isPending || importMutation.isPending}
            aria-label="Lesson-plan file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              previewMutation.reset();
              importMutation.reset();
            }}
          />
          <span className="file-picker-button" aria-hidden="true">
            Choose file
          </span>
          <span className="file-picker-name" title={file?.name}>
            {file?.name ?? 'No file chosen'}
          </span>
        </span>
      </label>
      <div className="upload-actions">
        <button
          className="secondary-button"
          disabled={
            !file || previewMutation.isPending || importMutation.isPending
          }
          onClick={() => previewMutation.mutate()}
        >
          {previewMutation.isPending ? 'Checking…' : 'Preview'}
        </button>
        <button
          className="primary-button"
          disabled={
            !file ||
            !preview?.valid ||
            previewMutation.isPending ||
            importMutation.isPending
          }
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending
            ? 'Saving…'
            : mode === 'APPEND'
              ? 'Add topics'
              : 'Import new version'}
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
          {preview.changes && (
            <span>
              {preview.changes.added} new topics · {preview.changes.unchanged}{' '}
              already saved
            </span>
          )}
          {preview.issues.map((issue, index) => (
            <small key={`${issue.rowNumber}-${issue.columnName}-${index}`}>
              Row {issue.rowNumber || 'file'} · {issue.columnName ?? 'file'}:{' '}
              {issue.errorMessage}
            </small>
          ))}
        </div>
      ) : null}
      {importMutation.isSuccess && (
        <p className="form-success" role="status">
          {importMutation.data.added !== undefined
            ? `${importMutation.data.added} topics added. ${importMutation.data.unchanged ?? 0} existing topics preserved.`
            : 'Lesson plan saved. Activate the draft when you are ready.'}
        </p>
      )}
      {importMutation.data?.warnings?.map((warning) => (
        <p className="inline-notice" role="status" key={warning}>
          {warning}
        </p>
      ))}
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

  if (!editable)
    return (
      <article className="plan-unit plan-unit-readonly">
        <header>
          <span className="unit-number">
            {String(unit.sequence).padStart(2, '0')}
          </span>
          <div>
            <h3>{unit.title}</h3>
            {unit.description && <p>{unit.description}</p>}
          </div>
          <span>
            {formatTeachingTime(
              unit.topics.reduce((n, t) => n + t.plannedMinutes, 0),
            )}
          </span>
        </header>
        {unit.topics.map((topic) => (
          <div className="plan-topic-readonly" key={topic.id}>
            <span>{topic.sequence}</span>
            <div>
              <strong>{topic.title}</strong>
              {topic.description && <p>{topic.description}</p>}
              <small>
                {topic.examScopes.map((e) => e.name).join(' · ') ||
                  'No exam scope assigned'}
              </small>
            </div>
            <span>{formatTeachingTime(topic.plannedMinutes)}</span>
            <span>
              {Math.round(topic.currentCompletionPercentage)}% covered
            </span>
          </div>
        ))}
      </article>
    );
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
          Ask your program manager to add exam dates in Semester setup before
          assigning syllabus scope.
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
