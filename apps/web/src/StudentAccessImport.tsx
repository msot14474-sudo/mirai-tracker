import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicApi } from './academic';
import { apiFetch, apiUrl } from './http';
import { saveDownload } from './exports';

type Preview = {
  valid: boolean;
  fingerprint: string;
  rows: {
    row: number;
    name: string;
    campus: string;
    email: string;
    action: string;
  }[];
  issues: { row: number; message: string }[];
  createCount: number;
  skipCount: number;
  created: number;
};
export function StudentAccessImport({ campusId }: { campusId: string }) {
  const client = useQueryClient();
  const [semesterId, setSemester] = useState('');
  const [batchId, setBatch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState(false);
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
    enabled: !!campusId,
  });
  const batches = useQuery({
    queryKey: ['academic', 'semester-subjects', semesterId],
    queryFn: () => academicApi.semesterCourses(semesterId),
    enabled: !!semesterId,
  });
  const path = `${apiUrl}/faculty-access/campuses/${campusId}/students`;
  const template = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`${path}/template`);
      saveDownload(await response.blob(), 'student-access-template.xlsx');
    },
  });
  const upload = useMutation({
    mutationFn: async (commit: boolean) => {
      if (!file || !batchId)
        throw new Error('Choose a batch and student file.');
      const body = new FormData();
      body.append('file', file);
      body.append('batchId', batchId);
      if (commit && preview) body.append('fingerprint', preview.fingerprint);
      const response = await apiFetch(
        `${path}/${commit ? 'import' : 'preview'}`,
        { method: 'POST', body },
      );
      return (await response.json()) as Preview;
    },
    onSuccess: async (data, commit) => {
      setPreview(data);
      setSaved(commit && data.valid);
      if (commit && data.valid)
        await Promise.all(
          ['managed-accounts', 'faculty-access'].map((key) =>
            client.invalidateQueries({ queryKey: [key] }),
          ),
        );
    },
  });
  const clear = () => {
    setPreview(null);
    setSaved(false);
    upload.reset();
  };
  return (
    <section
      className="campus-data-card student-access-import"
      aria-label="Bulk student access"
    >
      <div className="campus-data-card-heading">
        <div>
          <h3>Add students from Excel</h3>
          <p>
            Choose their semester and batch, then upload Name, Campus and Email.
            Every row is checked before access is granted.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={!campusId || template.isPending}
          onClick={() => template.mutate()}
        >
          Download student template
        </button>
      </div>
      <div className="form-grid">
        <label>
          Student semester
          <select
            value={semesterId}
            disabled={upload.isPending}
            onChange={(e) => {
              setSemester(e.target.value);
              setBatch('');
              clear();
            }}
          >
            <option value="">Choose semester</option>
            {semesters.data
              ?.filter((s) => s.status !== 'ARCHIVED')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Student batch
          <select
            value={batchId}
            disabled={!semesterId || upload.isPending}
            onChange={(e) => {
              setBatch(e.target.value);
              clear();
            }}
          >
            <option value="">Choose batch</option>
            {batches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Student file
          <input
            type="file"
            accept=".xlsx,.csv"
            disabled={upload.isPending}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              clear();
            }}
          />
        </label>
      </div>
      <p className="campus-data-note">
        Students receive access to this batch in the selected campus. They sign
        in using their email verification code. Existing matching accounts are
        skipped.
      </p>
      {[upload.error, template.error, semesters.error, batches.error]
        .filter(Boolean)
        .map((e, i) => (
          <p role="alert" className="form-error" key={i}>
            {e?.message}
          </p>
        ))}
      <div className="campus-data-actions">
        <button
          className="primary-button"
          disabled={!file || !batchId || upload.isPending}
          onClick={() => upload.mutate(false)}
        >
          {upload.isPending ? 'Checking students…' : 'Preview students'}
        </button>
      </div>
      {preview && (
        <div className="student-import-preview">
          <h4>
            {preview.createCount} new students · {preview.skipCount} already
            have access
          </h4>
          {!!preview.issues.length && (
            <div className="form-error" role="alert">
              <strong>Correct these rows and upload again</strong>
              <ul>
                {preview.issues.map((i, n) => (
                  <li key={n}>
                    {i.row ? `Row ${i.row}: ` : ''}
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Student access preview"
          >
            <table>
              <thead>
                <tr>
                  {['Row', 'Name', 'Campus', 'Email', 'Action'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((s) => (
                  <tr key={s.row}>
                    <td>{s.row}</td>
                    <td>{s.name}</td>
                    <td>{s.campus}</td>
                    <td>{s.email}</td>
                    <td>{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!saved && (
            <button
              className="primary-button"
              disabled={
                !preview.valid || !preview.createCount || upload.isPending
              }
              onClick={() => upload.mutate(true)}
            >
              Grant student access
            </button>
          )}
          {saved && (
            <p role="status" className="form-success">
              {preview.created} students added to this batch.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
