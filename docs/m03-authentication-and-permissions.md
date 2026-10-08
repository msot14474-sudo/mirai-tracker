# M03 Authentication and Role Permissions

M03 establishes the security boundary for every later feature. Authentication identifies the user. Authorization decides whether that user may act on a particular campus, batch or subject offering.

## Session design

1. The browser sends an email and password to `POST /auth/login`.
2. The API verifies the scrypt password hash stored in `PasswordCredential`.
3. The API creates a cryptographically random opaque token.
4. Only an HMAC digest of that token is used in the Redis session key. Redis stores the user ID for eight hours by default.
5. The browser receives the token in the `mirai_session` cookie with `HttpOnly`, `SameSite=Lax` and `Path=/`. Production cookies also receive `Secure`.
6. On every protected request, the API resolves the session and reloads the active user, roles and scopes from PostgreSQL. A suspension or role change therefore takes effect on the next request.
7. Logout deletes the Redis session and expires the browser cookie.

API routes are protected by default. Only routes explicitly decorated with `@Public()`, currently health checks and login, bypass authentication.

## Permission model

| Role | Scope | Manage | View |
| --- | --- | --- | --- |
| Admin / Program Manager | Global | All campuses and offerings | All data |
| Campus Manager | Assigned campus | Campus timetable, faculty and offerings | Campus dashboards and alerts |
| Faculty | Assigned offering | Their lesson plans and session logs | Their subject dashboard |
| Student | Enrolled batch | Nothing | Covered/next topics and exam information for their batch |

`AccessPolicyService` resolves offering ownership through its batch, semester, campus and active faculty assignments. Controllers for M04 onward will call its assertion methods before reading or changing scoped records. The global `RolesGuard` handles endpoints whose rule depends only on role.

## Local demonstration identities

The seed creates fictional local identities only:

| Email | Role |
| --- | --- |
| `admin@mirai.local` | Program Manager |
| `campus.manager@mirai.local` | Campus Manager for HI-Tech |
| `faculty@mirai.local` | Faculty assigned to the sample DSA offering |
| `student@mirai.local` | Student enrolled in the sample Mirai batch |

All four use the value of `DEMO_USER_PASSWORD` at seed time. Docker Compose requires this value and `SESSION_SECRET` to come from the uncommitted `.env` file; the project does not provide working fallback secrets. Passwords are hashed with a unique random salt, and `.local` addresses do not create external accounts.

## API surface

| Endpoint | Access | Result |
| --- | --- | --- |
| `POST /auth/login` | Public | Creates the server session and cookie |
| `GET /auth/me` | Authenticated | Returns current identity, roles and scopes |
| `POST /auth/logout` | Authenticated | Revokes the session and clears the cookie |

The React client restores the session through `/auth/me`, shows the login form when no session exists, and displays workspaces based on the returned role. These interface choices help users navigate; the API remains the source of enforcement.

## Automated permission evidence

The M03 tests cover valid login, incorrect passwords, suspended users, opaque Redis sessions, logout invalidation, public/protected routes, valid and missing cookies, role guards, global access, campus isolation, faculty assignment ownership, student batch isolation, student mutation denial, cookie flags and role-aware React views.

## Production identity providers

The permission layer is independent of the method used to prove identity. A later deployment can add Google Workspace for staff and OTP or student-ID login for students while keeping the same user, role and scope checks. Production deployment must provide a strong `SESSION_SECRET`, real HTTPS and approved identity-provider credentials.

## Remaining runtime verification

Static type checks, unit tests and production builds work without infrastructure. End-to-end login, cookie persistence, logout and live role checks require the M02/M03 migrations, PostgreSQL and Redis. They remain pending until Docker or equivalent services are available.
