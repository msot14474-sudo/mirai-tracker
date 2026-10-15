# Academic AI insights

The AI insights workspace is available to Admin/Program Manager, Campus Manager,
and Faculty roles. Students cannot access its API or navigation. Client filters
are intersected with server-derived authorization: administrators have global
academic scope, campus managers their assigned campuses, and faculty only active
subject assignments. AI has no write tools. Management links open existing forms
whose normal authorization rules remain in force.

## Production setup

Configure these **server-only** variables on the `mirai-tracker-api` Vercel project:

Recommended Ollama configuration:

| Name | Value |
| --- | --- |
| `OLLAMA_API_KEY` | Your Ollama cloud API key |
| `AI_PROVIDER` | `ollama` |
| `AI_MODEL` | `gpt-oss:20b` |

The key alone selects Ollama and this default model when provider/model are
omitted. The API calls `https://ollama.com/api/chat`; use the direct cloud model
ID above, not the CLI's `-cloud` suffix. This is a starting choice for efficient
academic analysis, not a benchmark claim. Validate response quality against your
campus records. Account availability and quotas remain controlled by Ollama.

OpenAI and Gemini are also supported using `AI_PROVIDER=openai` with
`OPENAI_API_KEY`, or `AI_PROVIDER=gemini` with `GEMINI_API_KEY`, plus `AI_MODEL`.

Redeploy the API after setting them. Never prefix keys with `VITE_`, put them in
the web project, commit them, or paste them into the app. Google OAuth credentials
are unrelated to Gemini API credentials. No paid request runs automatically on page load. The dashboard clearly shows when AI is not connected; data reports
remain functional. Before rollout, perform a real-provider smoke test using an
authorized staff account. Provider tests in the repository mock network calls.

## Context and reporting

Data reports use current recorded facts, not an LLM. AI reports use the same
fresh, server-generated scope with an optional question. Subject context includes
current active plans (draft fallback), topic completion and sequence, latest
planned dates, faculty assignments and upcoming exam scope/deadlines. All
permitted active/completed offerings contribute to lecture-status aggregates;
student understanding counts are responses, not unique students.

Detailed context is bounded to the latest 80 eligible past lectures, next 20
lectures and 50 recent feedback gaps. Counts and limits are disclosed in the UI
and downloaded report. Select a subject to focus the context. This is not a
claim to retrieve every historic version or every note in one model request.
Missing lecture logs are not proof a class was missed. Missing feedback is not
proof students understood. Missing plans/dates remain visible instead of
breaking the entire dashboard.

AI requests exceeding 60,000 context characters are rejected with guidance to
select a subject. Rate limits are 20 requests/user/hour and 200 total/hour in
Redis; when the limiter is unavailable, AI fails closed while data reports work.
Provider requests have a 35-second timeout and are not automatically retried.
No passwords, tokens, login email, or student identity fields are selected for
AI context. Academic narrative fields may contain personal information supplied
by users and are sent to the configured provider when AI is requested. OpenAI
requests use `store: false`; provider account data policies still apply.

Student feedback and lecture notes are treated as untrusted data in the system
instructions. The model has no browsing, database or execution tools. Responses
are rendered as text. Downloaded HTML escapes all content and contains no scripts;
it can be opened and printed or saved as PDF using the browser.

Reference implementations follow the official APIs:
- https://developers.openai.com/api/docs/guides/text
- https://ai.google.dev/api/generate-content

## Token efficiency

The backend calculates metrics directly, so data reports use no model tokens.
AI context omits internal IDs and repeated metadata and excerpts narrative fields
at 600 characters, with this limit disclosed to the model. Ollama gpt-oss uses
low thinking. Questions request at most 1,200 generated tokens; reports 1,800.
Incomplete answers are flagged and not cached. Identical questions and scoped
context reuse a result for five minutes. Authorization and the current snapshot
are checked before every cache lookup; user, provider, model, question and context
are hashed into the cache key. A changed record changes the key. No automatic
model escalation or background generation consumes additional quota.

Ollama references:
- https://docs.ollama.com/cloud
- https://ollama.com/library/gpt-oss:20b-cloud
- https://docs.ollama.com/api/chat

## Saved conversations

AI exchanges are stored in PostgreSQL, owned by the signed-in account. Use Saved
chats to reopen a conversation or New chat to start fresh. Switching the academic
scope starts a new conversation. The current permission/subject fingerprint is
checked before reading messages or generating a continuation; changed access
makes old-scope chats unavailable rather than disclosing old data.

Each reply includes the latest authorized academic snapshot and the most recent
six exchanges (older message bodies excerpted at 2,400 characters each). Full
messages remain saved; the viewer shows the latest 100 messages. The model is
instructed to resolve follow-up references and prefer current records over older
answers. The cache fingerprint includes conversation context. Failed provider
requests leave the typed question available for retry. Successful user/assistant
pairs save atomically; a version check rejects simultaneous stale continuations.

The additive conversation migration runs during API production builds. Database
integration tests cover persistence, ordering, ownership, scope changes, context
bounds and concurrent updates against a disposable PostgreSQL database.
