import { WeeklySummaries } from './WeeklySummaries';
import type { BufferMetrics } from './BufferRatio';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch, apiUrl } from './http';
import { LoadingSkeleton } from './LoadingSkeleton';
import './AiInsights.css';

type Subject = {
  id: string;
  code: string;
  name: string;
  batch: string;
  campus: { name: string };
  monitoring?:
    | (BufferMetrics & {
        status: string;
        remainingHours: number;
        availableHours: number;
        bufferRatio: number | null;
        paceVsPlanHours: number;
      })
    | null;
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
}: {
  campusId?: string;
  canLog: boolean;
  onOpen: (view: ManagementView) => void;
}) {
  const [question, setQuestion] = useState('');
  const [selectedConversationId, setConversationId] = useState('');
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
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
  return (
    <section className="ai-workspace">
      <header className="ai-heading">
        <div>
          <h2>AI insights</h2>
          <p>Clarity for your next academic decision.</p>
        </div>
        <WeeklySummaries campusId={campusId} compact />
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
            <div className="ai-conversation-heading">
              <span className="ai-assistant-symbol">
                <InsightIcon kind="spark" />
              </span>
              <div>
                <strong>Mirai AI</strong>
                <span>Your academic assistant</span>
              </div>
              <span className="ai-scope-note">
                Based on your permitted records
              </span>
            </div>
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
                  <h3>What would you like to explore?</h3>
                  <p>
                    Review progress, prepare for classes or turn your teaching
                    records into a useful report.
                  </p>
                  <div className="ai-suggestions">
                    {[
                      {
                        title: 'Review subject progress',
                        description:
                          'Spot delays and subjects that need attention.',
                        icon: 'chart',
                        prompt: 'Which subjects need attention?',
                      },
                      {
                        title: 'Find the next step',
                        description:
                          'Get focused suggestions for what to do next.',
                        icon: 'target',
                        prompt: 'What should we focus on next?',
                      },
                      {
                        title: 'Prepare for classes',
                        description:
                          'Look ahead at upcoming lectures and preparation.',
                        icon: 'calendar',
                        prompt: canLog
                          ? 'Summarise my upcoming classes and preparation priorities.'
                          : 'Summarise upcoming classes and preparation priorities.',
                      },
                    ].map(({ title, description, icon, prompt }) => (
                      <button
                        key={prompt}
                        type="button"
                        aria-label={prompt}
                        disabled={report.isPending}
                        onClick={() => {
                          setQuestion(prompt);
                          composer.current?.focus();
                        }}
                      >
                        <span className="ai-prompt-icon">
                          <InsightIcon kind={icon} />
                        </span>
                        <strong>{title}</strong>
                        <span>{description}</span>
                        <span className="ai-prompt-arrow" aria-hidden="true">
                          ↗
                        </span>
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
                  provider settings. You can still generate a data report below.
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
                ref={composer}
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
                    <InsightIcon kind="report" />
                    {data.ai.ready
                      ? 'Generate AI report'
                      : 'Generate data report'}
                  </button>
                  <button type="submit" disabled={!canSend || !question.trim()}>
                    Send <InsightIcon kind="send" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
function InsightIcon({ kind }: { kind: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'chart' ? (
        <>
          <path d="M4 4v16h16M8 15v-4m5 4V7m5 8v-6" />
        </>
      ) : kind === 'calendar' ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M7 3v4m10-4v4M3 11h18m-13 4h3m3 0h2" />
        </>
      ) : kind === 'target' ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="m12 12 8-8" />
        </>
      ) : kind === 'report' ? (
        <>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5" />
        </>
      ) : kind === 'send' ? (
        <path d="m5 12 7-7 7 7M12 5v14" />
      ) : (
        <>
          <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />
          <path d="M20 2v4m-2-2h4" />
        </>
      )}
    </svg>
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
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const uuidList = new RegExp(
    `\\s*\\((?:IDs?|record IDs?)\\s*:?\\s*${uuid}(?:\\s*,\\s*${uuid})*\\)`,
    'gi',
  );
  const internalId = new RegExp(uuid, 'gi');
  const cleaned = text
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s*<br\s*\/?\s*>\s*/gi, '\n')
    .replace(/^\[Incomplete response\]\s*/, '')
    .replace(uuidList, '')
    .replace(internalId, '')
    .replace(/\(\s*(?:IDs?|record IDs?)?\s*\)/gi, '')
    .replace(/\s+•\s+/g, '\n- ')
    .replace(/^\s*•\s+/gm, '- ')
    .replace(/\s+\|\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
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
