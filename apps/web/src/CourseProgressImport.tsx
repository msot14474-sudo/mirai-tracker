import { useState, FormEvent } from 'react';
import { academicApi, dateOnly, SaturdayRule } from './academic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lessonPlanApi } from './lessonPlans';
import { upload } from './imports';

type Mapping = {
  sheet: string;
  header: number;
  topic: number;
  hours: number;
  completion: number;
  status: number;
  plannedDate: number;
  taughtDate: number;
  percentScale: 'fraction' | 'percent';
  dateOrder?: 'day-first' | 'month-first';
  excludedColumns?: number[];
};
type Inspection = {
  sheets: {
    name: string;
    rows: string[][];
    totalRows: number;
    suggestedMapping?: Mapping;
  }[];
  mapping: Mapping;
};
type Preview = {
  source?: {
    sheet: string;
    header: number;
    columns: { index: number; name: string; destination: string }[];
    rows: { row: number; values: string[]; kind: string; issue?: string }[];
  };
  warnings?: string[];
  valid: boolean;
  issues: string[];
  counts: {
    topics: number;
    completed: number;
    minutes: number;
    nonTeachingRows: number;
  };
  topics: {
    title: string;
    minutes: number;
    completion: number;
    plannedDate: string | null;
    taughtDate: string | null;
    description: string;
  }[];
  preserved: string[];
};
const fields = [
  ['topic', 'Topic name'],
  ['hours', 'Planned hours'],
  ['completion', 'Completion'],
  ['status', 'Status'],
  ['plannedDate', 'Planned date'],
  ['taughtDate', 'Date taught'],
] as const;

export function CourseProgressImport({ campusId }: { campusId?: string }) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [offeringId, setOfferingId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [batchName, setBatchName] = useState('');
  const [programName, setProgramName] = useState('');
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId!),
    enabled: Boolean(campusId),
  });
  const semester = semesters.data?.find((item) => item.id === semesterId);
  const createSemester = useMutation({
    mutationFn: (input: {
      name: string;
      startDate: string;
      endDate: string;
      workingSaturdayRule: SaturdayRule;
    }) => academicApi.createSemester(campusId!, input),
    onSuccess: async (created) => {
      await client.invalidateQueries({
        queryKey: ['academic', 'semesters', campusId],
      });
      setSemesterId(created.id);
      setOfferingId('');
      setShowSemesterForm(false);
      reset();
    },
  });
  const submitSemester = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    createSemester.mutate({
      name: String(values.get('name')),
      startDate: String(values.get('startDate')),
      endDate: String(values.get('endDate')),
      workingSaturdayRule: String(
        values.get('workingSaturdayRule'),
      ) as SaturdayRule,
    });
  };
  const destinationFields = () => ({
    semesterId,
    offeringId,
    ...(!offeringId
      ? {
          destination: JSON.stringify({
            semesterId,
            subjectName,
            batchName,
            programName,
          }),
        }
      : {}),
  });

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const offerings = useQuery({
    queryKey: ['lesson-plans', 'offerings', campusId],
    queryFn: () => lessonPlanApi.offerings(campusId),
  });
  const inspect = useMutation({
    mutationFn: (useAi: boolean) =>
      upload<Inspection>('/imports/progress/inspect', file!, {
        useAi: String(useAi),
      }),
    onSuccess: (data) => {
      setInspection(data);
      setMapping(data.mapping);
      setPreview(null);
    },
  });
  const validate = useMutation({
    mutationFn: () =>
      upload<Preview>('/imports/progress/preview', file!, {
        ...destinationFields(),
        ...(campusId ? { campusId } : {}),
        mapping: JSON.stringify(mapping),
      }),
    onSuccess: setPreview,
  });
  const save = useMutation({
    mutationFn: () =>
      upload('/imports/progress', file!, {
        ...destinationFields(),
        ...(campusId ? { campusId } : {}),
        mapping: JSON.stringify(mapping),
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
  const busy =
    inspect.isPending ||
    validate.isPending ||
    save.isPending ||
    createSemester.isPending;
  const reset = () => {
    setPreview(null);
    save.reset();
    validate.reset();
    inspect.reset();
  };
  const update = (value: Partial<Mapping>) => {
    setMapping((m) => {
      if (!m) return m;
      const next = { ...m, ...value };
      if (value.sheet !== undefined || value.header !== undefined)
        next.excludedColumns = [];
      else
        next.excludedColumns = (next.excludedColumns ?? []).filter(
          (index) => index !== next.topic && index !== next.hours,
        );
      return next;
    });
    reset();
  };
  const toggleColumn = (index: number, include: boolean) => {
    if (!mapping) return;
    const excluded = new Set(mapping.excludedColumns ?? []);
    if (include) excluded.delete(index);
    else excluded.add(index);
    const changes: Partial<Mapping> = { excludedColumns: [...excluded] };
    if (!include)
      for (const key of [
        'completion',
        'status',
        'plannedDate',
        'taughtDate',
      ] as const) {
        if (mapping[key] === index) changes[key] = -1;
      }
    update(changes);
  };
  const sheet = inspection?.sheets.find((s) => s.name === mapping?.sheet);
  const headers = sheet?.rows[(mapping?.header ?? 1) - 1] ?? [];
  return (
    <div className="progress-import">
      <div className="setup-card course-import-card">
        <div className="course-import-heading">
          <div>
            <h3>Import into a semester</h3>
            <p className="schedule-help">
              Create the semester with its original start and end dates, select
              it below, then upload your teaching record. Planned dates and
              dates taught come from your file; they are not shifted to today.
            </p>
          </div>
          <button
            type="button"
            className="text-button course-create-semester"
            aria-expanded={showSemesterForm}
            disabled={busy || save.isSuccess || !campusId}
            onClick={() => setShowSemesterForm(!showSemesterForm)}
          >
            {showSemesterForm
              ? 'Cancel semester creation'
              : 'Create a semester'}
          </button>
        </div>
        {showSemesterForm ? (
          <form
            className="progress-import-fields course-semester-form"
            onSubmit={submitSemester}
          >
            <fieldset disabled={busy} className="progress-import-fields">
              <label>
                Semester name
                <input name="name" required maxLength={160} />
              </label>
              <div className="field-pair">
                <label>
                  Semester starts
                  <input type="date" name="startDate" required />
                </label>
                <label>
                  Semester ends
                  <input type="date" name="endDate" required />
                </label>
              </div>
              <label>
                Working Saturdays
                <select name="workingSaturdayRule" defaultValue="NONE">
                  <option value="NONE">None</option>
                  <option value="ALL">All Saturdays</option>
                  <option value="SECOND_AND_FOURTH">Second and fourth</option>
                </select>
              </label>
              <button type="submit">Create and select semester</button>
            </fieldset>
            {createSemester.error ? (
              <p className="form-error" role="alert">
                {createSemester.error.message}
              </p>
            ) : null}
          </form>
        ) : null}
        <fieldset
          disabled={busy || save.isSuccess}
          className="progress-import-fields"
        >
          <div className="course-import-steps">
            <div className="course-import-step">
              <label>
                1. Choose a semester
                <select
                  value={semesterId}
                  onChange={(event) => {
                    setSemesterId(event.target.value);
                    setOfferingId('');
                    reset();
                  }}
                >
                  <option value="">Choose a semester</option>
                  {semesters.data
                    ?.filter((item) => item.status !== 'ARCHIVED')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {dateOnly(item.startDate)} to{' '}
                        {dateOnly(item.endDate)}
                      </option>
                    ))}
                </select>
              </label>
              {semesters.isLoading ? (
                <p role="status">Loading semesters…</p>
              ) : null}
              {semesters.error ? (
                <p role="alert">{semesters.error.message}</p>
              ) : null}
              {semester ? (
                <p className="schedule-help">
                  Selected semester: <strong>{semester.name}</strong> ·{' '}
                  {dateOnly(semester.startDate)} to {dateOnly(semester.endDate)}
                  . File dates outside this range will be listed for correction
                  before import.
                </p>
              ) : (
                <p className="schedule-help">
                  Select an existing semester or use Create a semester above.
                </p>
              )}
            </div>
            <div className="course-import-step course-upload-step">
              <label>
                2. Choose your progress file
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  disabled={!semesterId}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setInspection(null);
                    setMapping(null);
                    reset();
                  }}
                />
              </label>
              <p className="schedule-help">
                Excel or CSV. Your file can use its own sheet and column names.
              </p>
              <div className="template-actions course-import-actions">
                <button
                  disabled={!file || !semesterId}
                  onClick={() => inspect.mutate(false)}
                >
                  Read file
                </button>
                <button
                  className="text-button"
                  disabled={!file || !semesterId}
                  onClick={() => inspect.mutate(true)}
                >
                  Match columns with AI
                </button>
              </div>
            </div>
          </div>
          {mapping && inspection ? (
            <>
              <h3>3. Confirm the course</h3>
              <label>
                Subject and batch in this semester
                <select
                  value={offeringId}
                  onChange={(event) => {
                    setOfferingId(event.target.value);
                    reset();
                  }}
                >
                  <option value="">
                    Add a subject and batch with this import
                  </option>
                  {offerings.data
                    ?.filter(
                      (item) =>
                        !item.plan && item.batch.semester.id === semesterId,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.subject.name} · {item.batch.name}
                      </option>
                    ))}
                </select>
              </label>
              {offerings.error ? (
                <p role="alert">{offerings.error.message}</p>
              ) : null}
              {!offeringId ? (
                <div className="progress-mapping-grid">
                  <label>
                    Subject name
                    <input
                      value={subjectName}
                      maxLength={200}
                      required
                      onChange={(event) => {
                        setSubjectName(event.target.value);
                        reset();
                      }}
                    />
                  </label>
                  <label>
                    Batch name
                    <input
                      value={batchName}
                      maxLength={160}
                      required
                      onChange={(event) => {
                        setBatchName(event.target.value);
                        reset();
                      }}
                    />
                  </label>
                  <label>
                    Program name
                    <input
                      value={programName}
                      maxLength={160}
                      required
                      onChange={(event) => {
                        setProgramName(event.target.value);
                        reset();
                      }}
                    />
                  </label>
                  <p className="schedule-help">
                    These records are created only when you confirm the import.
                    Existing matching records are reused; existing lesson plans
                    are never overwritten.
                  </p>
                </div>
              ) : null}
              <h3>4. Check the columns</h3>
              <div className="progress-mapping-grid">
                <label>
                  Worksheet
                  <select
                    value={mapping.sheet}
                    onChange={(e) =>
                      update(
                        inspection.sheets.find((s) => s.name === e.target.value)
                          ?.suggestedMapping ?? {
                          sheet: e.target.value,
                          header: 1,
                        },
                      )
                    }
                  >
                    {inspection.sheets.map((s) => (
                      <option key={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Row with column headings
                  <input
                    type="number"
                    min={1}
                    max={sheet?.rows.length}
                    value={mapping.header}
                    onChange={(e) => update({ header: Number(e.target.value) })}
                  />
                </label>
                {fields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <select
                      value={mapping[key]}
                      onChange={(e) =>
                        update({ [key]: Number(e.target.value) })
                      }
                    >
                      {key !== 'topic' && key !== 'hours' ? (
                        <option value={-1}>Not in this file</option>
                      ) : null}
                      {headers.map((h, i) => (
                        <option
                          key={i}
                          value={i}
                          disabled={mapping.excludedColumns?.includes(i)}
                        >
                          {i + 1}. {h || 'Unnamed column'}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  Numeric date order
                  <select
                    value={mapping.dateOrder ?? 'day-first'}
                    onChange={(e) =>
                      update({
                        dateOrder: e.target.value as Mapping['dateOrder'],
                      })
                    }
                  >
                    <option value="day-first">Day / month / year</option>
                    <option value="month-first">Month / day / year</option>
                  </select>
                </label>
                <label>
                  Completion values
                  <select
                    value={mapping.percentScale}
                    onChange={(e) =>
                      update({
                        percentScale: e.target.value as Mapping['percentScale'],
                      })
                    }
                  >
                    <option value="fraction">0 to 1 (1 means 100%)</option>
                    <option value="percent">0 to 100 (100 means 100%)</option>
                  </select>
                </label>
              </div>
              <h4>
                Choose columns to import ·{' '}
                {headers.length - (mapping.excludedColumns?.length ?? 0)} of{' '}
                {headers.length} selected
              </h4>
              <p className="schedule-help">
                Uncheck fields you do not want to add. Excluded columns will not
                be saved in the lesson plan, notes, or source record. Topic name
                and planned hours are required. Your original file stays
                unchanged.
              </p>
              <div
                className="progress-preview-table"
                tabIndex={0}
                role="region"
                aria-label="Source columns"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Include</th>
                      <th>Column</th>
                      <th>Source heading</th>
                      <th>Sample value</th>
                      <th>Saved as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((header, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Include column ${index + 1}: ${header || 'Unnamed column'}`}
                            checked={!mapping.excludedColumns?.includes(index)}
                            disabled={
                              index === mapping.topic || index === mapping.hours
                            }
                            onChange={(event) =>
                              toggleColumn(index, event.target.checked)
                            }
                          />
                          {index === mapping.topic ||
                          index === mapping.hours ? (
                            <small>Required</small>
                          ) : null}
                        </td>
                        <td>{index + 1}</td>
                        <th>{header || 'Unnamed column'}</th>
                        <td>{sheet?.rows[mapping.header]?.[index] || '—'}</td>
                        <td>
                          {mapping.excludedColumns?.includes(index)
                            ? 'Excluded — not saved'
                            : (fields.find(
                                ([key]) => mapping[key] === index,
                              )?.[1] ?? 'Topic notes')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                disabled={
                  !semesterId ||
                  (!offeringId &&
                    (!subjectName.trim() ||
                      !batchName.trim() ||
                      !programName.trim()))
                }
                onClick={() => validate.mutate()}
              >
                Preview progress
              </button>
            </>
          ) : null}
        </fieldset>
        {busy ? (
          <p role="status">
            {save.isPending
              ? 'Importing progress…'
              : inspect.isPending
                ? 'Reading your file…'
                : 'Checking progress…'}
          </p>
        ) : null}
        {inspect.error || validate.error || save.error ? (
          <p className="form-error" role="alert">
            {inspect.error?.message ??
              validate.error?.message ??
              save.error?.message}
          </p>
        ) : null}
      </div>
      {preview ? (
        <div className="setup-card">
          <h3>5. Review and import</h3>
          <p className="schedule-help">
            {semester?.name} ·{' '}
            {semester
              ? dateOnly(semester.startDate) +
                ' to ' +
                dateOnly(semester.endDate)
              : ''}{' '}
            · File dates are kept as recorded.
          </p>
          <p>
            {preview.counts.topics} topics · {preview.counts.completed}{' '}
            completed · {preview.counts.minutes / 60} planned hours ·{' '}
            {preview.counts.nonTeachingRows} other source rows
          </p>
          {preview.issues.length ? (
            <div className="progress-import-issues" role="alert">
              <strong>
                Import paused: {preview.issues.length} issues to correct
              </strong>
              <p>
                Correct the listed rows or the selected semester dates, then
                preview again. No data has been imported.
              </p>
              <ul>
                {preview.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="form-success">
              Ready to import. All selected columns will be kept.
            </p>
          )}
          {preview.warnings?.map((warning) => (
            <p className="schedule-help" key={warning}>
              {warning}
            </p>
          ))}
          {preview.source ? (
            <details open>
              <summary>
                Selected source data · {preview.source.columns.length} columns ·{' '}
                {preview.source.rows.length} rows
              </summary>
              <div
                className="progress-preview-table progress-source-table"
                tabIndex={0}
                role="region"
                aria-label="Complete source data"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Source row</th>
                      <th>Import result</th>
                      {preview.source.columns.map((column) => (
                        <th key={column.index}>
                          {column.name}
                          <small>{column.destination}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.source.rows.map((row) => (
                      <tr key={row.row}>
                        <th>{row.row}</th>
                        <td>
                          {row.kind}
                          {row.issue ? (
                            <p className="form-error">{row.issue}</p>
                          ) : null}
                        </td>
                        {preview.source!.columns.map((column) => (
                          <td key={column.index}>
                            {row.values[column.index] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          <h4>Lesson plan preview</h4>
          <div
            className="progress-preview-table"
            tabIndex={0}
            role="region"
            aria-label="Progress preview"
          >
            <table>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Hours</th>
                  <th>Complete</th>
                  <th>Planned</th>
                  <th>Taught</th>
                </tr>
              </thead>
              <tbody>
                {preview.topics.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <details>
                        <summary>{t.title}</summary>
                        <pre>{t.description}</pre>
                      </details>
                    </td>
                    <td>{t.minutes / 60}</td>
                    <td>{t.completion}%</td>
                    <td>{t.plannedDate ?? '—'}</td>
                    <td>{t.taughtDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.preserved.length ? (
            <details>
              <summary>Other source rows kept as notes</summary>
              <div className="progress-source-notes">
                {preview.preserved.map((row, index) => (
                  <pre key={index}>{row}</pre>
                ))}
              </div>
            </details>
          ) : null}
          <p className="schedule-help">
            This creates the lesson plan and recorded topic completion. Dates
            taught and extra fields are saved in notes; no attendance or timed
            lecture logs are invented. Add recurring class times in Timetable
            separately.
          </p>
          {!preview.valid ? (
            <p className="form-error" role="status">
              Import is disabled until the {preview.issues.length} issues above
              are corrected. Check the highlighted source rows and preview
              again.
            </p>
          ) : null}
          <button
            disabled={!preview.valid || busy || save.isSuccess}
            onClick={() => save.mutate()}
          >
            {save.isSuccess ? 'Progress imported' : 'Confirm progress import'}
          </button>
          {save.isSuccess ? (
            <p role="status">
              Progress imported. Open Lesson plans or Progress to review it.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
