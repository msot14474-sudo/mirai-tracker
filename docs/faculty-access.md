# Campus Manager faculty access

The Faculty access workspace lets a Campus Manager (the branch manager role) create teaching accounts for the campuses explicitly assigned to that manager. Admin and Program Manager roles can use the same workflow across all accessible campuses.

## Manager workflow

1. Choose an accessible campus.
2. Enter the faculty member's name, login email and employee code.
3. Optionally provide a different email for OTP and reminder delivery. When blank, messages use the login email.
4. Select Regular or Visiting and set an initial password of at least 12 characters.
5. Optionally select subject offerings. Each selection creates a dated faculty assignment covering that offering's semester.
6. Create access and share the login email and initial password privately.

The faculty member signs in with the initial password, receives a six-digit OTP at the configured mailbox and sees only assigned subject workspaces. A manager can select the new assignment in the timetable workspace when creating or updating teaching slots; regenerated sessions then appear in the faculty member's Daily session logging view.

## Security and data rules

- The role guard permits only Admin, Program Manager and Campus Manager users.
- The service verifies campus scope again before reading or writing records.
- A Campus Manager cannot submit another campus ID or attach an offering from another campus.
- Inactive campuses, archived semesters and archived subject offerings cannot receive new faculty access.
- User, password credential, staff profile, Faculty role, subject assignments and audit evidence are created in one database transaction.
- Passwords use scrypt with an individual random salt. Plaintext passwords are neither returned nor written to audit metadata.
- Duplicate login emails and employee codes return a conflict response without partially creating an account.

## API

| Method | Route                                        | Purpose                                                              |
| ------ | -------------------------------------------- | -------------------------------------------------------------------- |
| `GET`  | `/faculty-access/campuses/:campusId`         | List scoped faculty and assignable subject offerings                 |
| `POST` | `/faculty-access/campuses/:campusId/faculty` | Create a faculty login, staff profile, role and optional assignments |

The creation body contains `name`, `email`, optional `notificationEmail`, `employeeCode`, `staffType`, `password` and `offeringIds`.

## Verification

Focused API tests prove campus authorization is invoked, credentials are hashed, assignments are campus-scoped and audit records contain no password. The React test submits the manager form with a selected offering. The complete workspace test suite and production builds run through `pnpm check`.
