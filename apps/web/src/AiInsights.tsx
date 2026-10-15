import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUrl } from './http';
import { LoadingSkeleton } from './LoadingSkeleton';

type Subject = {
  id: string;
  code: string;
  name: string;
  batch: string;
  campus: { name: string };
  completion: number | null;
  plan: { version: number; status: string } | null;
  teachers: string[];
  overdueTopics: number;
  missingLogs: number;
  nextTopics: string[];
  issues: string[];
  exams: {
    name: string;
    date: string;
    syllabusDeadline: string;
    scopeTopics: number;
    incompleteTopics: number;
  }[];
};
type Snapshot = {
  generatedAt: string;
  scope: string;
  ai: { ready: boolean; provider: string | null };
  coverage: {
    note: string;
    pastLectures: number;
    recentLecturesIncluded: number;
    upcomingLectures: number;
    upcomingIncluded: number;
    feedbackGaps: number;
    feedbackGapsIncluded: number;
  };
  summary: {
    subjects: number;
    attention: number;
    overdueTopics: number;
    missingLogs: number;
    needsHelp: number;
    reviews: number;
  };
  subjects: Subject[];
  upcomingLectures: { id: string; offeringId: string; startsAt: string }[];
  recentGaps: {
    unclearTopics: string | null;
    session: { id: string; offeringId: string; startsAt: string };
  }[];
};
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};
type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  earlierMessages: number;
};
type Report = {
  conversationId?: string;
  mode: 'ai' | 'data';
  text: string;
  generatedAt: string;
  incomplete?: boolean;
  snapshot: Snapshot;
};
type ManagementView =
  'lesson-plans' | 'planned-dates' | 'progress' | 'daily-logging';

export function AiInsights({
  campusId,
  canLog,
  onOpen,
}: {
  campusId?: string;
  canLog: boolean;
  onOpen: (view: ManagementView) => void;
}) {
  const [offeringId, setOfferingId] = useState('');
  const [question, setQuestion] = useState('');
  const [selectedConversationId, setConversationId] = useState('');
  const transcript = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const scope = {
    ...(campusId ? { campusId } : {}),
    ...(offeringId ? { offeringId } : {}),
  };
  const options = useQuery({
    queryKey: ['ai-insights', campusId ?? '', ''],
    queryFn: () => getSnapshot(campusId),
  });
  const focused = useQuery({
    queryKey: ['ai-insights', campusId ?? '', offeringId],
    queryFn: () => getSnapshot(campusId, offeringId),
    enabled: Boolean(offeringId),
  });
  const query = offeringId ? focused : options;
  const chatQuery = new URLSearchParams(scope).toString();
  const chats = useQuery({
    queryKey: ['ai-chats', campusId ?? '', offeringId],
    queryFn: async (): Promise<{ id: string; title: string }[]> =>
      (
        await apiFetch(`${apiUrl}/ai-insights/conversations?${chatQuery}`)
      ).json(),
  });
  const conversationId = selectedConversationId || chats.data?.[0]?.id || '';
  const history = useQuery({
    queryKey: ['ai-chat', conversationId, campusId ?? '', offeringId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<Chat> =>
      (
        await apiFetch(
          `${apiUrl}/ai-insights/conversations/${conversationId}?${chatQuery}`,
        )
      ).json(),
  });
  const report = useMutation({
    mutationFn: async ({
      useAi,
      ask,
    }: {
      useAi: boolean;
      ask?: string;
    }): Promise<Report> =>
      (
        await apiFetch(`${apiUrl}/ai-insights/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...scope,
            useAi,
            ...(useAi && conversationId ? { conversationId } : {}),
            ...(ask ? { question: ask } : {}),
          }),
        })
      ).json(),
    onSuccess: (result, variables) => {
      if (result.conversationId) {
        client.setQueryData<Chat>(
          ['ai-chat', result.conversationId, campusId ?? '', offeringId],
          (previous) => ({
            id: result.conversationId!,
            title: previous?.title || variables.ask || 'Academic report',
            earlierMessages: previous?.earlierMessages || 0,
            messages: [
              ...(previous?.messages || []),
              {
                id: 'pending-user-' + result.generatedAt,
                role: 'user',
                content: variables.ask || 'Generate an academic report',
                createdAt: result.generatedAt,
              },
              {
                id: 'pending-assistant-' + result.generatedAt,
                role: 'assistant',
                content: result.text,
                createdAt: result.generatedAt,
              },
            ],
          }),
        );
        setConversationId(result.conversationId);
        setQuestion('');
        void client.invalidateQueries({ queryKey: ['ai-chats'] });
        void client.invalidateQueries({
          queryKey: ['ai-chat', result.conversationId],
        });
      }
    },
  });
  const data = query.data;
  const chatBusy =
    chats.isPending ||
    chats.isError ||
    Boolean(conversationId && (history.isPending || history.isError));
  const canSend = Boolean(
    data?.ai.ready && data.subjects.length && !chatBusy && !report.isPending,
  );
  const send = () => {
    if (canSend && question.trim())
      report.mutate({ useAi: true, ask: question.trim() });
  };
  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [
    conversationId,
    history.data?.messages.length,
    report.isPending,
    report.data,
  ]);
  const subjectName = (id: string) => {
    const s = data?.subjects.find((s) => s.id === id);
    return s ? `${s.code} · ${s.batch}` : 'Subject';
  };
  return (
    <section className="ai-workspace">
      <header className="ai-heading">
        <div>
          <p className="ai-eyebrow">ACADEMIC INTELLIGENCE</p>
          <h2>AI insights</h2>
          <p>Progress, priorities and the next teaching steps.</p>
        </div>
        <div className="ai-actions">
          <button
            type="button"
            disabled={query.isFetching || report.isPending}
            onClick={() => {
              report.reset();
              void query.refetch();
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={!data || report.isPending || !data.subjects.length}
            onClick={() => report.mutate({ useAi: false })}
          >
            Generate report
          </button>
        </div>
      </header>
      <div className="ai-toolbar">
        <label>
          Subject
          <select
            value={offeringId}
            disabled={report.isPending}
            onChange={(e) => {
              setOfferingId(e.target.value);
              setConversationId('');
              report.reset();
            }}
          >
            <option value="">All permitted subjects</option>
            {options.data?.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.batch} · {s.campus.name}
              </option>
            ))}
          </select>
        </label>
        <span>
          {data
            ? `Updated ${new Date(data.generatedAt).toLocaleString()}`
            : 'Reading academic records…'}
        </span>
      </div>
      {query.isPending ? (
        <LoadingSkeleton variant="cards" label="Loading academic insights" />
      ) : query.isError ? (
        <div role="alert">
          <p className="form-error">{query.error.message}</p>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : data ? (
        <>
          <div className="ai-conversation">
            <div
              className="ai-transcript"
              ref={transcript}
              role="log"
              aria-label="Conversation"
            >
              {chats.isPending || (conversationId && history.isPending) ? (
                <LoadingSkeleton variant="cards" label="Loading conversation" />
              ) : null}
              {chats.isError || (conversationId && history.isError) ? (
                <div role="alert">
                  <p>Could not load your conversation.</p>
                  <button
                    type="button"
                    onClick={() => {
                      void chats.refetch();
                      if (conversationId) void history.refetch();
                    }}
                  >
                    Retry conversation
                  </button>
                </div>
              ) : null}
              {!chatBusy &&
              !conversationId &&
              !report.isPending &&
              !report.data ? (
                <div className="ai-chat-welcome">
                  <h3>What would you like to work on?</h3>
                  <p>Ask about lectures, plans or what needs attention.</p>
                  <div className="ai-suggestions">
                    {[
                      'Which subjects need attention?',
                      'What should we focus on next?',
                      'Summarise student understanding gaps.',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={!canSend}
                        onClick={() => setQuestion(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {conversationId && history.data?.earlierMessages ? (
                <p className="ai-chat-note">Showing the latest 100 messages.</p>
              ) : null}
              {conversationId &&
                history.data?.messages.map((message) => (
                  <article
                    className={`ai-chat-message ai-chat-${message.role}`}
                    key={message.id}
                  >
                    <strong>
                      {message.role === 'user' ? 'You' : 'Mirai AI'}
                    </strong>
                    <div>{message.content}</div>
                  </article>
                ))}
              {report.isPending ? (
                <>
                  <article className="ai-chat-message ai-chat-user">
                    <strong>You</strong>
                    <div>
                      {report.variables.ask || 'Generate an academic report'}
                    </div>
                  </article>
                  <div className="ai-thinking" role="status">
                    <span aria-hidden="true">● ● ●</span> Mirai AI is preparing
                    a response…
                  </div>
                </>
              ) : null}
              {report.isError ? (
                <p className="form-error" role="alert">
                  {report.error.message} Your message is still below; you can
                  try again.
                </p>
              ) : null}
              {report.data && !report.isPending ? (
                <article className="ai-chat-result">
                  {report.data.mode === 'data' ||
                  !report.data.conversationId ||
                  !history.data?.messages.some(
                    (m) =>
                      m.role === 'assistant' && m.content === report.data?.text,
                  ) ? (
                    <div className="ai-chat-message ai-chat-assistant">
                      <strong>Mirai AI</strong>
                      <div>{report.data.text}</div>
                    </div>
                  ) : null}
                  {report.data.incomplete ? (
                    <p role="alert">
                      This response is incomplete. Try a more focused question.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => downloadReport(report.data!)}
                  >
                    Download report
                  </button>
                </article>
              ) : null}
            </div>
            <form
              className="ai-composer"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label htmlFor="ai-question">Message Mirai AI</label>
              <textarea
                id="ai-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={2000}
                rows={2}
                placeholder="Ask a question or follow up…"
                disabled={!canSend}
              />
              <div className="ai-composer-footer">
                <span>
                  {data.ai.ready
                    ? 'Enter to send · Shift + Enter for a new line'
                    : 'AI is not connected yet. Data reports are available.'}
                </span>
                <div className="ai-actions">
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={() => report.mutate({ useAi: true })}
                  >
                    Generate AI report
                  </button>
                  <button type="submit" disabled={!canSend || !question.trim()}>
                    Send
                  </button>
                </div>
              </div>
            </form>
          </div>
          <details className="ai-academic-context">
            <summary>Academic context and priorities</summary>
            <div className="ai-metrics">
              {[
                ['Subjects', data.summary.subjects],
                ['Need attention', data.summary.attention],
                ['Overdue topics', data.summary.overdueTopics],
                ['Missing logs', data.summary.missingLogs],
                [
                  'Need-help responses',
                  `${data.summary.needsHelp} / ${data.summary.reviews}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {!data.subjects.length ? (
              <p className="empty-copy">
                No subjects are available in your assigned scope.
              </p>
            ) : (
              <div className="ai-subjects">
                <h3>Subject priorities</h3>
                {data.subjects.map((subject) => (
                  <article key={subject.id} className="ai-subject">
                    <header>
                      <div>
                        <small>
                          {subject.code} · {subject.batch} ·{' '}
                          {subject.campus.name}
                        </small>
                        <h4>{subject.name}</h4>
                        <p>
                          {subject.teachers.join(', ') ||
                            'Faculty not assigned'}
                        </p>
                      </div>
                      <strong>
                        {subject.completion === null
                          ? 'No plan'
                          : `${subject.completion}% covered`}
                      </strong>
                    </header>
                    {subject.issues.length ? (
                      <ul>
                        {subject.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No issues detected in recorded plans and logs.</p>
                    )}
                    <p>
                      <strong>Next in plan:</strong>{' '}
                      {subject.nextTopics.join(' → ') ||
                        'No remaining topics recorded'}
                    </p>
                    {subject.exams.map((exam) => (
                      <p key={exam.name}>
                        <strong>{exam.name}</strong> · {exam.date} ·{' '}
                        {exam.scopeTopics
                          ? `${exam.incompleteTopics}/${exam.scopeTopics} scope topics incomplete`
                          : 'Exam scope missing'}
                      </p>
                    ))}
                    <div className="ai-actions">
                      <button
                        type="button"
                        onClick={() => onOpen('lesson-plans')}
                      >
                        Review lesson plans
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen('planned-dates')}
                      >
                        Manage planned dates
                      </button>
                      {canLog && subject.missingLogs ? (
                        <button
                          type="button"
                          onClick={() => onOpen('daily-logging')}
                        >
                          Update lecture logs
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="ai-detail-grid">
              <section>
                <h3>Student understanding gaps</h3>
                <p>
                  {data.summary.needsHelp} need-help responses ·{' '}
                  {data.summary.reviews} reviews total
                </p>
                {data.recentGaps.length ? (
                  data.recentGaps.map((gap, index) => (
                    <article
                      className="ai-detail"
                      key={`${gap.session.id}-${index}`}
                    >
                      <strong>{subjectName(gap.session.offeringId)}</strong>
                      <small>
                        {new Date(gap.session.startsAt).toLocaleString()}
                      </small>
                      <p>{gap.unclearTopics}</p>
                    </article>
                  ))
                ) : (
                  <p>
                    No understanding gaps have been submitted in this scope.
                  </p>
                )}
              </section>
              <section>
                <h3>Upcoming lectures</h3>
                {data.upcomingLectures.length ? (
                  data.upcomingLectures.map((lecture) => (
                    <article className="ai-detail" key={lecture.id}>
                      <strong>{subjectName(lecture.offeringId)}</strong>
                      <p>{new Date(lecture.startsAt).toLocaleString()}</p>
                    </article>
                  ))
                ) : (
                  <p>No upcoming lectures are scheduled in this scope.</p>
                )}
              </section>
            </div>
            <details className="ai-coverage">
              <summary>Report context and coverage</summary>
              <p>{data.coverage.note}</p>
              <p>
                {data.coverage.recentLecturesIncluded} of{' '}
                {data.coverage.pastLectures} past lectures detailed ·{' '}
                {data.coverage.upcomingIncluded} of{' '}
                {data.coverage.upcomingLectures} upcoming lectures ·{' '}
                {data.coverage.feedbackGapsIncluded} of{' '}
                {data.coverage.feedbackGaps} understanding gaps
              </p>
            </details>
          </details>
        </>
      ) : null}
    </section>
  );
}
async function getSnapshot(
  campusId?: string,
  offeringId?: string,
): Promise<Snapshot> {
  const query = new URLSearchParams({
    ...(campusId ? { campusId } : {}),
    ...(offeringId ? { offeringId } : {}),
  });
  return (await apiFetch(`${apiUrl}/ai-insights?${query}`)).json();
}
export function reportHtml(report: Report) {
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]!,
    );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mirai Academic Report</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#162a50;max-width:850px;margin:48px auto;padding:24px}header{border-bottom:3px solid #245bd7;padding-bottom:20px;margin-bottom:28px}h1{font-size:28px}article{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;padding:10px;font-size:11pt}}</style></head><body><header><p>MIRAI TRACKER</p><h1>Academic report</h1><p>${escape(report.mode === 'ai' ? 'AI analysis — review suggestions before acting' : 'Data report')}${report.incomplete ? ' · INCOMPLETE RESPONSE' : ''}</p><p>${escape(report.generatedAt)}</p></header><article>${escape(report.text)}</article><footer><p>${escape(report.snapshot.coverage.note)}</p></footer></body></html>`;
}
function downloadReport(report: Report) {
  const url = URL.createObjectURL(
    new Blob([reportHtml(report)], { type: 'text/html;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `mirai-academic-report-${report.generatedAt.slice(0, 10)}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
