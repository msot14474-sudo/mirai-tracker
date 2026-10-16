import { useState } from 'react';
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
        offeringId,
        ...(campusId ? { campusId } : {}),
        mapping: JSON.stringify(mapping),
      }),
    onSuccess: setPreview,
  });
  const save = useMutation({
    mutationFn: () =>
      upload('/imports/progress', file!, {
        offeringId,
        ...(campusId ? { campusId } : {}),
        mapping: JSON.stringify(mapping),
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
  const busy = inspect.isPending || validate.isPending || save.isPending;
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
      <div className="setup-card">
        <h3>Bring your existing teaching record</h3>
        <p className="schedule-help">
          Use the semester’s original start and end dates, even if teaching has
          already started. First set up its batch and subject, then import the
          progress you have recorded.
        </p>
        <fieldset
          disabled={busy || save.isSuccess}
          className="progress-import-fields"
        >
          <label>
            1. Choose the subject and batch
            <select
              value={offeringId}
              onChange={(e) => {
                setOfferingId(e.target.value);
                reset();
              }}
            >
              <option value="">Choose a subject</option>
              {offerings.data
                ?.filter((o) => !o.plan)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.subject.name} · {o.batch.name} · {o.batch.semester.name}{' '}
                    · {o.batch.semester.campus.name}
                  </option>
                ))}
            </select>
          </label>
          {offerings.isLoading ? <p role="status">Loading subjects…</p> : null}
          {offerings.error ? (
            <p role="alert">{offerings.error.message}</p>
          ) : null}
          {!offerings.isLoading &&
          offerings.data &&
          !offerings.data.some((o) => !o.plan) ? (
            <p className="schedule-help">
              No subjects without a lesson plan are available. Add the semester,
              batch and subject using the Semester setup template first.
              Existing plans are protected from replacement.
            </p>
          ) : null}
          <label>
            2. Choose your progress file
            <input
              type="file"
              accept=".csv,.xlsx"
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
          <div className="template-actions">
            <button disabled={!file} onClick={() => inspect.mutate(false)}>
              Read file
            </button>
            <button
              className="text-button"
              disabled={!file}
              onClick={() => inspect.mutate(true)}
            >
              Match columns with AI
            </button>
          </div>

          {mapping && inspection ? (
            <>
              <h3>3. Check the columns</h3>
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
              <button disabled={!offeringId} onClick={() => validate.mutate()}>
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
          <h3>4. Review and import</h3>
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
