# Session and request recovery

Login sessions are stored in Redis without a TTL. Existing valid session keys have their expiry removed when used. Logout deletes the session; suspended/deleted users remain blocked, and current roles are checked on every request. Already-expired sessions cannot be restored and require signing in once.

Browsers impose cookie lifetimes. The HttpOnly, SameSite=Lax (Secure in production) session cookie is renewed for 400 days on authenticated requests. Clearing cookies, browser retention policies, loss of Redis data, or a changed signing secret can still require sign-in. OTP, reset approval, OAuth state and rate-limit expiry remain unchanged. The old SESSION_TTL_SECONDS setting no longer determines login lifetime.

All frontend API modules use the shared transport. Reads retry once for network failures and 502/503/504 responses, with bounded request timeouts. Writes are never automatically replayed. Network, offline, service and malformed-response failures have readable messages. Validation and authorization errors retain their meaning. Query retries are disabled to avoid multiplying transport attempts.

Invalid authenticated sessions clear protected query caches and return to login. Stale responses from previous sessions cannot invalidate newly authenticated sessions. Active failed queries expose a shared retry action; reconnecting retries active data queries. Workspace and application error boundaries provide recovery for rendering or lazy module failures. Planned dates, lesson plans and timetable selection no longer treat failed loads as empty data.

Validation covers transient recovery, bounded retries, non-replayed writes, timeouts, authorization failures, invalid sessions, stale responses, malformed JSON, rendering failures and the misleading empty-state regression. UI browser verification is still outstanding.
