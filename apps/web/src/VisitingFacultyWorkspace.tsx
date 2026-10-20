import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CampusDataScope } from './CampusDataScope';
import {
  campusDownload,
  campusPost,
  campusRequest,
  VisitingDashboard,
} from './campusData';
import { LoadingSkeleton } from './LoadingSkeleton';
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ');
export function VisitingFacultyWorkspace({
  initialCampusId,
}: {
  initialCampusId?: string;
}) {
  return (
    <CampusDataScope
      initialCampusId={initialCampusId}
      title="Visiting faculty"
      description="Classes, subjects and expenses in one place. Honorarium updates from recorded teaching at each faculty member’s per-class rate."
    >
      {(semester) => <VisitingFacultyDashboard semesterId={semester.id} />}
    </CampusDataScope>
  );
}
function VisitingFacultyDashboard({ semesterId }: { semesterId: string }) {
  const [month, setMonth] = useState(''),
    [teacher, setTeacher] = useState(''),
    [tab, setTab] = useState<'faculty' | 'classes' | 'expenses'>('faculty');
  const [editor, setEditor] = useState<'rate' | 'expense' | 'payment' | null>(
      null,
    ),
    [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const client = useQueryClient(),
    path = `/semesters/${semesterId}/visiting-faculty`;
  const query = useQuery({
    queryKey: ['campus-data', 'visiting', semesterId, month],
    queryFn: () =>
      campusRequest<VisitingDashboard>(path + (month ? `?month=${month}` : '')),
    refetchInterval: 30000,
  });
  const download = useMutation({
    mutationFn: (ext: 'csv' | 'xlsx') =>
      campusDownload(
        `${path}/report?format=${ext}${month ? `&month=${month}` : ''}`,
        `visiting-faculty-${month || 'semester'}.${ext}`,
      ),
  });
  const save = useMutation({
    mutationFn: ({
      kind,
      data,
    }: {
      kind: 'rate' | 'expense' | 'payment';
      data: unknown;
    }) =>
      campusRequest(
        path + (kind === 'rate' ? '/rates' : '/ledger'),
        campusPost(data),
      ),
    onSuccess: async (_, input) => {
      setEditor(null);
      setMessage(
        input.kind === 'rate'
          ? 'Class rate saved. Honorarium has been recalculated.'
          : input.kind === 'expense'
            ? 'Expense recorded.'
            : 'Payment recorded.',
      );
      await client.invalidateQueries({
        queryKey: ['campus-data', 'visiting', semesterId],
      });
    },
  });
  const voidEntry = useMutation({
    mutationFn: (id: string) =>
      campusRequest(`${path}/ledger/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setMessage('Entry voided. It is retained in the audit history.');
      await client.invalidateQueries({
        queryKey: ['campus-data', 'visiting', semesterId],
      });
    },
  });
  const data = query.data;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor || save.isPending) return;
    const fields = new FormData(e.currentTarget),
      staffProfileId = String(fields.get('staffProfileId'));
    const body =
      editor === 'rate'
        ? {
            staffProfileId,
            effectiveFrom: String(fields.get('date')),
            ratePerClass: Number(fields.get('amount')),
          }
        : {
            staffProfileId,
            date: String(fields.get('date')),
            kind: editor === 'expense' ? 'EXPENSE' : 'PAYMENT',
            category:
              editor === 'expense' ? String(fields.get('category')) : 'Payment',
            amount: Number(fields.get('amount')),
            notes: String(fields.get('notes') ?? ''),
            requestId,
          };
    save.mutate({ kind: editor, data: body });
  }
  if (query.isPending) return <LoadingSkeleton variant="cards" />;
  if (query.error)
    return (
      <div className="campus-data-card">
        <p className="form-error" role="alert">
          {query.error.message}
        </p>
        <button
          className="secondary-button"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  if (!data) return null;
  const classes = data.classes.filter(
    (c) => !teacher || c.staffProfileId === teacher,
  );
  const faculty = data.faculty.filter((f) => !teacher || f.id === teacher);
  const ledger = data.ledger.filter(
    (e) => !teacher || e.staffProfileId === teacher,
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: data.semester.timezone,
  }).format(new Date());
  const open = (value: typeof editor) => {
    setEditor(value);
    setRequestId(crypto.randomUUID());
    save.reset();
    setMessage('');
  };
  return (
    <>
      <div className="campus-data-toolbar">
        <label>
          Reporting month
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(0);
            }}
          />
          <small>Leave empty for the full semester.</small>
        </label>
        <label>
          Faculty
          <select
            value={teacher}
            onChange={(e) => {
              setTeacher(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All visiting faculty</option>
            {data.faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="campus-data-actions">
          {(['xlsx', 'csv'] as const).map((ext) => (
            <button
              className="secondary-button"
              key={ext}
              disabled={download.isPending}
              onClick={() => download.mutate(ext)}
            >
              {ext.toUpperCase()} report
            </button>
          ))}
        </div>
      </div>
      <div className="campus-data-counts">
        {[
          ['Visiting faculty', data.summary.faculty],
          ['Classes taken', data.summary.takenClasses],
          ['Teaching hours', `${data.summary.teachingHours}h`],
          ['Honorarium', money(data.summary.honorarium)],
          ['Expenses', money(data.summary.expenses)],
          ['Paid', money(data.summary.paid)],
          ['Balance', money(data.summary.balance)],
        ].map(([title, value]) => (
          <div key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="campus-data-note">
        Totals include all visiting faculty in the selected semester and
        reporting month. Completed and in-progress logged classes count once
        after their end time. Cancelled, skipped and merged classes are
        excluded. A negative balance is a credit.
      </p>
      {(data.summary.unpricedClasses > 0 || data.unresolvedClasses > 0) && (
        <div className="campus-data-notice" role="status">
          {data.summary.unpricedClasses > 0 && (
            <p>
              <strong>
                {data.summary.unpricedClasses} classes need a rate.
              </strong>{' '}
              Financial totals are incomplete until you set an effective rate
              for these dates.
            </p>
          )}
          {data.unresolvedClasses > 0 && (
            <p>
              {data.unresolvedClasses} classes have an unclear teacher
              assignment and are excluded. Assign their teacher in Timetable.
            </p>
          )}
        </div>
      )}
      {(download.error || save.error || voidEntry.error) && (
        <p role="alert" className="form-error">
          {download.error?.message ||
            save.error?.message ||
            voidEntry.error?.message}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      <div className="campus-data-toolbar">
        <div
          className="campus-data-tabs"
          role="group"
          aria-label="Visiting faculty views"
        >
          {(['faculty', 'classes', 'expenses'] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'faculty'
                ? 'Faculty & subjects'
                : t === 'classes'
                  ? 'Class register'
                  : 'Expenses & payments'}
            </button>
          ))}
        </div>
        <div className="campus-data-actions">
          <button
            className="secondary-button"
            disabled={!data.faculty.length}
            onClick={() => open('rate')}
          >
            Set class rate
          </button>
          <button
            className="secondary-button"
            disabled={!data.faculty.length}
            onClick={() => open('expense')}
          >
            Add expense
          </button>
          <button
            className="primary-button"
            disabled={!data.faculty.length}
            onClick={() => open('payment')}
          >
            Record payment
          </button>
        </div>
      </div>
      {editor && (
        <form
          className="campus-data-card campus-ledger-form"
          key={`${editor}-${teacher}`}
          onSubmit={submit}
          aria-label={
            editor === 'rate'
              ? 'Set class rate'
              : editor === 'expense'
                ? 'Add expense'
                : 'Record payment'
          }
        >
          <div className="campus-data-card-heading">
            <div>
              <h3>
                {editor === 'rate'
                  ? 'Set a per-class rate'
                  : editor === 'expense'
                    ? 'Record an expense'
                    : 'Record a payment'}
              </h3>
              <p>
                {editor === 'rate'
                  ? 'The rate applies from this date until a newer rate begins. Correcting a rate on the same date recalculates that period.'
                  : editor === 'payment'
                    ? 'Record a payment you have already made. This does not send money.'
                    : 'Add the actual reimbursable amount for this faculty member.'}
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={save.isPending}
              onClick={() => setEditor(null)}
            >
              Cancel
            </button>
          </div>
          <div className="campus-data-form-grid">
            <label>
              Visiting faculty
              <select
                name="staffProfileId"
                required
                defaultValue={teacher || data.faculty[0]?.id}
                disabled={save.isPending}
              >
                {data.faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {editor === 'rate' ? 'Effective from' : 'Date'}
              <input
                type="date"
                name="date"
                required
                max={editor === 'rate' ? undefined : today}
                defaultValue={today}
                disabled={save.isPending}
              />
            </label>
            <label>
              {editor === 'rate' ? 'Rate per class (INR)' : 'Amount (INR)'}
              <input
                name="amount"
                type="number"
                required
                min={editor === 'rate' ? 0 : 0.01}
                max={1000000}
                step="0.01"
                disabled={save.isPending}
              />
            </label>
            {editor === 'expense' && (
              <label>
                Category
                <select name="category" disabled={save.isPending}>
                  <option>Travel</option>
                  <option>Accommodation</option>
                  <option>Meals</option>
                  <option>Materials</option>
                  <option>Other</option>
                </select>
              </label>
            )}
            {editor !== 'rate' && (
              <label>
                Notes / reference
                <input
                  name="notes"
                  maxLength={2000}
                  placeholder="Receipt or payment reference"
                  disabled={save.isPending}
                />
              </label>
            )}
          </div>
          <div className="campus-data-actions">
            <button className="primary-button" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </form>
      )}
      {!data.faculty.length ? (
        <div className="campus-data-empty">
          <h3>No visiting faculty yet</h3>
          <p>
            Add a faculty member in User access with staff type Visiting, then
            assign their batch subject. Classes and expenses will appear here.
          </p>
        </div>
      ) : (
        <>
          {tab === 'faculty' && (
            <div className="campus-data-card">
              <h3>Faculty and subject details</h3>
              <div className="campus-data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Faculty</th>
                      <th>Subjects / batches</th>
                      <th>Classes taken</th>
                      <th>Honorarium</th>
                      <th>Expenses</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faculty.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <strong>{f.name}</strong>
                          <small>{f.email}</small>
                          <small>{f.active ? 'Active' : 'Inactive'}</small>
                        </td>
                        <td>
                          {f.subjects.length
                            ? f.subjects.map((s, i) => (
                                <div key={i}>
                                  {s.name}
                                  <small>
                                    {s.code} · {s.batch}
                                    {!s.active ? ' · Past assignment' : ''}
                                  </small>
                                </div>
                              ))
                            : 'Not assigned yet'}
                          <details>
                            <summary>Rate history</summary>
                            {f.rates.length ? (
                              f.rates.map((r) => (
                                <p key={r.effectiveFrom}>
                                  {money(r.ratePerClass)} / class from{' '}
                                  {r.effectiveFrom}
                                </p>
                              ))
                            ) : (
                              <p>No rate set</p>
                            )}
                          </details>
                        </td>
                        <td>
                          <strong>{f.takenClasses}</strong>
                          <small>{f.teachingHours} teaching hours</small>
                        </td>
                        <td>
                          {money(f.honorarium)}
                          {f.unpricedClasses > 0 && (
                            <small className="form-error">
                              {f.unpricedClasses} unpriced
                            </small>
                          )}
                        </td>
                        <td>{money(f.expenses)}</td>
                        <td>
                          <strong>{money(f.balance)}</strong>
                          <small>{money(f.paid)} paid</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'classes' && (
            <div className="campus-data-card">
              <div className="campus-data-card-heading">
                <h3>
                  Class register{' '}
                  <span className="campus-data-badge">{classes.length}</span>
                </h3>
                <p>Times in {data.semester.timezone}</p>
              </div>
              <div className="campus-data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date / time</th>
                      <th>Faculty</th>
                      <th>Subject / batch</th>
                      <th>Status</th>
                      <th>Rate</th>
                      <th>Earned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.slice(page * 50, (page + 1) * 50).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.date}</strong>
                          <small>
                            {new Date(c.startsAt).toLocaleTimeString('en-IN', {
                              timeZone: data.semester.timezone,
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            –{' '}
                            {new Date(c.endsAt).toLocaleTimeString('en-IN', {
                              timeZone: data.semester.timezone,
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </td>
                        <td>{c.facultyName}</td>
                        <td>
                          {c.subject}
                          <small>
                            {c.subjectCode} · {c.batch}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`campus-data-badge ${c.taken ? 'complete' : ''}`}
                          >
                            {label(c.status)}
                          </span>
                          {!c.logged && <small>Not logged</small>}
                        </td>
                        <td>{c.rate === null ? 'Not set' : money(c.rate)}</td>
                        <td>
                          {c.amount === null
                            ? 'Rate required'
                            : money(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!classes.length && <p>No classes for this selection.</p>}
              <div className="campus-data-actions">
                <button
                  className="secondary-button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} of{' '}
                  {Math.max(1, Math.ceil(classes.length / 50))}
                </span>
                <button
                  className="secondary-button"
                  disabled={(page + 1) * 50 >= classes.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {tab === 'expenses' && (
            <div className="campus-data-card">
              <h3>Expense and payment register</h3>
              <div className="campus-data-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Faculty</th>
                      <th>Type / category</th>
                      <th>Notes</th>
                      <th>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((l) => (
                      <tr key={l.id}>
                        <td>{l.date}</td>
                        <td>
                          {data.faculty.find((f) => f.id === l.staffProfileId)
                            ?.name ?? 'Faculty'}
                        </td>
                        <td>
                          {label(l.kind)}
                          <small>{l.category}</small>
                        </td>
                        <td>{l.notes || '—'}</td>
                        <td>{money(l.amount)}</td>
                        <td>
                          <button
                            className="secondary-button"
                            disabled={voidEntry.isPending}
                            onClick={() => voidEntry.mutate(l.id)}
                          >
                            Void entry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!ledger.length && (
                <p>No expenses or payments recorded for this selection.</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
