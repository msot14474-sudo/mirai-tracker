# M01 Repository and Local Setup

M01 establishes the runnable foundation used by every mandatory Problem 1 feature. It does not claim that the academic domain is implemented.

## Acceptance checks

- The workspace contains separate web, API and worker applications.
- Calculation and validation code live in reusable packages.
- Docker Compose defines PostgreSQL, Redis, Mailpit, API, worker and web services.
- The API exposes liveness and dependency-readiness endpoints.
- The web application exposes a static health resource and displays API readiness.
- Environment-variable names are documented without committing real credentials.
- Type checks, tests and production builds can run through `pnpm check`.

## Problem 1 continuity

The calculation package begins with the prescribed hour-weighted rules. Later milestones will extend it with available hours, buffer ratio, pace versus plan, planned dates and exam readiness after their edge cases are documented and tested.
