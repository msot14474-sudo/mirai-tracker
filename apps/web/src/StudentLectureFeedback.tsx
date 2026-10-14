import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch, apiUrl } from './http';
import { LoadingSkeleton } from './LoadingSkeleton';

type Review = {
  understood: boolean;
  unclearTopics: string | null;
  updatedAt: string;
};
type Lecture = {
  id: string;
  startsAt: string;
  endsAt: string;
  subject: { code: string; name: string };
  teacher: string | null;
  coveredSummary: string | null;
  review: Review | null;
};
type Feed = {
  lectures: Lecture[];
  page: number;
  pageSize: number;
  total: number;
  pendingCount: number;
  timezone: string;
};

export function StudentLectureFeedback() {
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending');
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const feed = useQuery({
    queryKey: ['student-lectures', tab, page],
    queryFn: async (): Promise<Feed> => {
      return (
        await apiFetch(`${apiUrl}/student/lectures?review=${tab}&page=${page}`)
      ).json();
    },
  });
  return (
    <section
      className="lecture-feedback"
      aria-labelledby="lecture-feedback-title"
    >
      <header className="student-section-heading">
        <div>
          <h3 id="lecture-feedback-title">Lecture feedback</h3>
          <p>Did you understand everything from your lectures?</p>
        </div>
        {feed.data ? (
          <span>{feed.data.pendingCount} awaiting feedback</span>
        ) : null}
      </header>
      <div
        className="lecture-review-tabs"
        role="group"
        aria-label="Lecture feedback view"
      >
        {(['pending', 'reviewed'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setPage(0);
              setNotice('');
            }}
          >
            {value === 'pending' ? 'Pending' : 'Submitted'}
          </button>
        ))}
      </div>
      {notice ? (
        <p role="status" className="form-success">
          {notice}
        </p>
      ) : null}
      {feed.isPending ? (
        <LoadingSkeleton variant="cards" label="Loading your lectures" />
      ) : feed.isError ? (
        <div role="alert">
          <p className="form-error">{feed.error.message}</p>
          <button type="button" onClick={() => void feed.refetch()}>
            Try again
          </button>
        </div>
      ) : feed.data ? (
        <>
          {feed.data.lectures.length ? (
            <div className="lecture-review-list">
              {feed.data.lectures.map((lecture) => (
                <LectureReviewCard
                  key={`${lecture.id}-${lecture.review?.updatedAt ?? 'new'}`}
                  lecture={lecture}
                  timezone={feed.data.timezone}
                  onSaved={() => {
                    setNotice('Your feedback has been saved.');
                    setPage(0);
                    void client.invalidateQueries({
                      queryKey: ['student-lectures'],
                    });
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              {tab === 'pending'
                ? 'You have no lectures awaiting feedback.'
                : 'Your submitted feedback will appear here.'}
            </p>
          )}
          {feed.data.total > feed.data.pageSize || page > 0 ? (
            <div className="lecture-review-pagination">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page + 1}</span>
              <button
                type="button"
                disabled={(page + 1) * feed.data.pageSize >= feed.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function LectureReviewCard({
  lecture,
  timezone,
  onSaved,
}: {
  lecture: Lecture;
  timezone: string;
  onSaved: () => void;
}) {
  const [understood, setUnderstood] = useState<boolean | null>(
    lecture.review?.understood ?? null,
  );
  const [details, setDetails] = useState(lecture.review?.unclearTopics ?? '');
  const save = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        `${apiUrl}/student/lectures/${lecture.id}/review`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            understood,
            ...(understood === false ? { unclearTopics: details.trim() } : {}),
          }),
        },
      );
      return response.json();
    },
    onSuccess: onSaved,
  });
  const date = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      understood === null ||
      (understood === false && !details.trim()) ||
      save.isPending
    )
      return;
    save.mutate();
  }
  return (
    <article className="lecture-review-card">
      <header>
        <div>
          <small>{lecture.subject.code}</small>
          <h4>{lecture.subject.name}</h4>
          <p>{lecture.teacher ?? 'Faculty not assigned'}</p>
        </div>
        <p>
          {date.format(new Date(lecture.startsAt))}
          <br />
          {time.format(new Date(lecture.startsAt))} –{' '}
          {time.format(new Date(lecture.endsAt))}
        </p>
      </header>
      {lecture.coveredSummary ? (
        <p className="lecture-summary">{lecture.coveredSummary}</p>
      ) : null}
      <form onSubmit={submit}>
        <fieldset disabled={save.isPending}>
          <legend>Did you understand everything from this lecture?</legend>
          <div className="lecture-review-options">
            <label>
              <input
                type="radio"
                name={`understood-${lecture.id}`}
                checked={understood === true}
                onChange={() => setUnderstood(true)}
              />
              Yes, I understood
            </label>
            <label>
              <input
                type="radio"
                name={`understood-${lecture.id}`}
                checked={understood === false}
                onChange={() => setUnderstood(false)}
              />
              No, I need help
            </label>
          </div>
          {understood === false ? (
            <label className="lecture-review-details">
              What did you not understand?
              <textarea
                required
                maxLength={2000}
                rows={3}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Mention the topics or questions you need help with."
              />
              <small>{details.length}/2000</small>
            </label>
          ) : null}
        </fieldset>
        {save.isError ? (
          <p className="form-error" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <footer>
          <span>
            {lecture.review ? 'Feedback submitted' : 'Your feedback is pending'}
          </span>
          <button
            type="submit"
            disabled={
              save.isPending ||
              understood === null ||
              (understood === false && !details.trim())
            }
          >
            {save.isPending
              ? 'Saving…'
              : lecture.review
                ? 'Update feedback'
                : 'Submit feedback'}
          </button>
        </footer>
      </form>
    </article>
  );
}
