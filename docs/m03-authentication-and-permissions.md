# M03 Authentication and Role Permissions

M03 establishes the security boundary for every later feature. Authentication identifies the user. Authorization decides whether that user may act on a particular campus, batch or subject offering.

## Session design

1. The browser sends an email and password to `POST /auth/login`.
2. The API verifies the scrypt password hash stored in `PasswordCredential`.
3. The API generates a six-digit code, stores only its HMAC digest in a Redis challenge for ten minutes and emails the code through SMTP.
4. The browser sends the challenge ID and code to `POST /auth/verify-otp`.
5. After a correct code, the API creates a cryptographically random opaque session token. Only an HMAC digest of that token is used in the Redis session key, which stores the user ID for eight hours by default.
6. The browser receives the token in the `mirai_session` cookie with `HttpOnly`, `SameSite=Lax` and `Path=/`. Production cookies also receive `Secure`.
7. On every protected request, the API resolves the session and reloads the active user, roles and scopes from PostgreSQL. A suspension or role change therefore takes effect on the next request.
8. Logout deletes the Redis session and expires the browser cookie.

Password failures are limited to five attempts per fifteen minutes. A user can request three OTPs per ten minutes, and each challenge permits five verification attempts. A consumed, expired or exhausted challenge cannot create a session.

Forgot-password recovery uses a separate ten-minute Redis challenge. The API always returns a generic challenge response, stores only the HMAC digest of the emailed code and accepts a replacement password only after a correct six-digit code. Reset requests and verification attempts are rate limited. The replacement is scrypt-hashed and the change is audit logged without plaintext.

API routes are protected by default. Only routes explicitly decorated with `@Public()`, currently health checks, login, OTP verification and password recovery, bypass session authentication. Mutation-origin checks still apply to the public authentication routes.

## Permission model

| Role                    | Scope             | Manage                                                       | View                                                     |
| ----------------------- | ----------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Program Manager / Admin | Global            | All campuses, users and offerings                            | All data                                                 |
| Campus Manager          | Assigned campus   | Faculty and Student accounts, campus timetable and offerings | Campus dashboards and alerts                             |
| Faculty                 | Assigned offering | Their lesson plans and session logs                          | Their subject dashboard                                  |
| Student                 | Enrolled batch    | Nothing                                                      | Covered/next topics and exam information for their batch |

`AccessPolicyService` resolves offering ownership through its batch, semester, campus and active faculty assignments. Controllers for M04 onward will call its assertion methods before reading or changing scoped records. The global `RolesGuard` handles endpoints whose rule depends only on role.

## Local demonstration identities

The seed creates fictional local identities only:

| Email                        | Role                                        |
| ---------------------------- | ------------------------------------------- |
| `admin@mirai.local`          | Program Manager                             |
| `campus.manager@mirai.local` | Campus Manager for HI-Tech                  |
| `faculty@mirai.local`        | Faculty assigned to the sample DSA offering |
| `student@mirai.local`        | Student enrolled in the sample Mirai batch  |

All four use the value of `DEMO_USER_PASSWORD` at seed time. `DEMO_NOTIFICATION_EMAIL` supplies a reachable mailbox for their OTP messages because `.local` login identifiers do not create external accounts. Local Mailpit accepts the default `demo-inbox@mirai.local`; production must use a real inbox. Docker Compose requires the password and `SESSION_SECRET` to come from the uncommitted `.env` file and provides no working fallback secrets. Passwords are hashed with a unique random salt.

## API surface

| Endpoint                                           | Access         | Result                                                                     |
| -------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| `POST /auth/login`                                 | Public         | Verifies the password and emails an OTP challenge                          |
| `POST /auth/verify-otp`                            | Public         | Consumes the OTP and creates the server session cookie                     |
| `POST /auth/forgot-password`                       | Public         | Emails a rate-limited password-reset code when the account exists          |
| `POST /auth/reset-password`                        | Public         | Verifies the reset code and stores a new scrypt password hash              |
| `GET /auth/me`                                     | Authenticated  | Returns current identity, roles and scopes                                 |
| `POST /auth/logout`                                | Authenticated  | Revokes the session and clears the cookie                                  |
| `GET /faculty-access/campuses/:campusId`           | Manager        | Lists faculty and assignable subjects in an authorized campus              |
| `POST /faculty-access/campuses/:campusId/faculty`  | Manager        | Creates a campus-scoped faculty login and optional subject assignments     |
| `POST /faculty-access/campuses/:campusId/managers` | Global manager | Creates a Campus Manager scoped to the selected campus                     |
| `POST /faculty-access/administrators`              | Global manager | Creates another global Administrator account                               |
| `GET /faculty-access/campuses/:campusId/accounts`  | Manager        | Lists accounts the current manager may maintain                            |
| `PATCH /faculty-access/accounts/:userId`           | Manager        | Updates allowed identity details, status and optional replacement password |

The React client restores the session through `/auth/me`, shows the login form when no session exists, and displays workspaces based on the returned role. These interface choices help users navigate; the API remains the source of enforcement.

## Automated permission evidence

The M03 tests cover password and OTP validation, code expiry/failure behavior, SMTP failure cleanup, session creation only after OTP, incorrect passwords, suspended users, opaque Redis sessions, logout invalidation, public/protected routes, valid and missing cookies, role guards, global access, campus isolation, faculty assignment ownership, student batch isolation, student mutation denial, cookie flags and the two-step React flow.

## Production identity providers

The permission layer remains independent of the method used to prove identity. The current deployment uses password plus email OTP. A later deployment can add Google Workspace or institutional single sign-on while keeping the same user, role and scope checks. Production requires a strong `SESSION_SECRET`, HTTPS and a verified SMTP sender.

## Remaining runtime verification

Static type checks, unit tests and production builds work without infrastructure. The deployed M18 environment provides PostgreSQL, Redis, HTTPS and Brevo SMTP; final OTP verification is performed against that live stack after each authentication release.
