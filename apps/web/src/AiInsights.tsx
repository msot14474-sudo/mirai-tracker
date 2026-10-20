import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch, apiUrl } from './http';
import { LoadingSkeleton } from './LoadingSkeleton';

type Subject = {
  id: string;
  code: string;
  name: string;
  batch: string;
  campus: { name: string };
  monitoring?: {
    status: string;
    remainingHours: number;
    availableHours: number;
    bufferRatio: number | null;
    paceVsPlanHours: number;
  } | null;
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
  const [question, setQuestion] = useState('');
  const [selectedConversationId, setConversationId] = useState('');
  const transcript = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const scope = {
    ...(campusId ? { campusId } : {}),
  };
  const query = useQuery({
    queryKey: ['ai-insights', campusId ?? '', ''],
    queryFn: () => getSnapshot(campusId),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const chatQuery = new URLSearchParams(scope).toString();
  const chats = useQuery({
    queryKey: ['ai-chats', campusId ?? '', ''],
    queryFn: async (): Promise<{ id: string; title: string }[]> =>
      (
        await apiFetch(`${apiUrl}/ai-insights/conversations?${chatQuery}`)
      ).json(),
  });
  const conversationId = selectedConversationId || chats.data?.[0]?.id || '';
  const history = useQuery({
    queryKey: ['ai-chat', conversationId, campusId ?? '', ''],
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
          ['ai-chat', result.conversationId, campusId ?? '', ''],
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
  const canSend = Boolean(data?.ai.ready && !chatBusy && !report.isPending);
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
          <h2>AI insights</h2>
        </div>
      </header>
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
                        disabled={report.isPending}
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
                    <div
                      className={
                        message.role === 'assistant' ? 'ai-markdown' : undefined
                      }
                    >
                      {message.role === 'assistant' ? (
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          skipHtml
                          disallowedElements={['img']}
                        >
                          {cleanReply(message.content)}
                        </Markdown>
                      ) : (
                        message.content
                      )}
                    </div>
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
                      m.role === 'assistant' &&
                      cleanReply(m.content) ===
                        cleanReply(report.data?.text || ''),
                  ) ? (
                    <div className="ai-chat-message ai-chat-assistant">
                      <strong>Mirai AI</strong>
                      <div className="ai-markdown">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          skipHtml
                          disallowedElements={['img']}
                        >
                          {cleanReply(report.data.text)}
                        </Markdown>
                      </div>
                    </div>
                  ) : null}
                  {report.data.incomplete ? (
                    <p role="alert">
                      The provider stopped before finishing. Use Continue
                      response in the chat box to resume.
                    </p>
                  ) : null}
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
              {!data.ai.ready ? (
                <p className="ai-connection-note" role="status">
                  AI is not connected. Ask your administrator to check the
                  provider settings. You can still download a data report below.
                </p>
              ) : null}
              {chatBusy ? (
                <p className="ai-connection-note" role="status">
                  {chats.isError || history.isError
                    ? 'Your conversation could not be loaded. Use Retry conversation above to reconnect.'
                    : 'Loading your conversation…'}
                </p>
              ) : null}
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
                disabled={report.isPending}
              />
              <div className="ai-composer-footer">
                <span>
                  {data.ai.ready
                    ? 'Enter to send · Shift + Enter for a new line'
                    : 'AI is not connected yet. Data reports are available.'}
                </span>
                <div className="ai-actions">
                  {(report.data?.incomplete ||
                    history.data?.messages
                      .at(-1)
                      ?.content.startsWith('[Incomplete response]')) && (
                    <button
                      type="button"
                      disabled={!canSend}
                      onClick={() =>
                        report.mutate({
                          useAi: true,
                          ask: 'Continue your previous response from where it stopped. Finish the remaining points without repeating earlier text.',
                        })
                      }
                    >
                      Continue response
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={report.isPending || (data.ai.ready && chatBusy)}
                    onClick={() => report.mutate({ useAi: data.ai.ready })}
                  >
                    {data.ai.ready
                      ? 'Generate AI report'
                      : 'Generate data report'}
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
                    {subject.monitoring && (
                      <p>
                        {subject.monitoring.status.replaceAll('_', ' ')} ·{' '}
                        {subject.monitoring.remainingHours}h remaining ·{' '}
                        {subject.monitoring.availableHours}h available · Pace{' '}
                        {subject.monitoring.paceVsPlanHours}h
                      </p>
                    )}
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
export function cleanReply(text: string) {
  const cleaned = text.replace(/^\[Incomplete response\]\s*/, '').trim();
  return /^```(?:markdown|md)\s*\n[\s\S]*\n```$/.test(cleaned)
    ? cleaned.replace(/^```(?:markdown|md)\s*\n/, '').replace(/\n```$/, '')
    : cleaned;
}
export async function reportHtml(report: Report) {
  const { renderToStaticMarkup } = await import('react-dom/server');
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
  const rendered = renderToStaticMarkup(
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml={false}
      disallowedElements={['img']}
    >
      {cleanReply(report.text)}
    </Markdown>,
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mirai Academic Report</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#162a50;max-width:850px;margin:48px auto;padding:24px}header{border-bottom:3px solid #245bd7;padding-bottom:20px;margin-bottom:28px}h1{font-size:28px}article{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}td,th{border:1px solid #dce4f1;padding:8px;text-align:left}pre{overflow:auto;white-space:pre-wrap}@media print{body{margin:0;padding:10px;font-size:11pt}}</style></head><body><header><p>MIRAI TRACKER</p><h1>Academic report</h1><p>${escape(report.mode === 'ai' ? 'AI analysis — review suggestions before acting' : 'Data report')}${report.incomplete ? ' · INCOMPLETE RESPONSE' : ''}</p><p>${escape(report.generatedAt)}</p></header><article>${rendered}</article><footer><p>${escape(report.snapshot.coverage.note)}</p></footer></body></html>`;
}
