# User access management

The User access workspace creates Faculty, Campus Manager and Administrator accounts. Campus Managers can create faculty accounts only inside their assigned campus. Program Managers can also create campus-scoped Campus Managers. Administrators can create all three account types, including other global Administrators.

## Manager workflow

1. Choose an accessible campus.
2. Enter the faculty member's name, login email and employee code.
3. Optionally provide a different email for OTP and reminder delivery. When blank, messages use the login email.
4. Select Regular or Visiting and set an initial password of at least 12 characters.
5. Optionally select subject offerings. Each selection creates a dated faculty assignment covering that offering's semester.
6. Create access and share the login email and initial password privately.

For a Campus Manager account, select the campus and enter the name, login email, optional OTP email and initial password. Administrator accounts use the same identity fields and receive global scope instead of a campus assignment.

The faculty member signs in with the initial password, receives a six-digit OTP at the configured mailbox and sees only assigned subject workspaces. A manager can select the new assignment in the timetable workspace when creating or updating teaching slots; regenerated sessions then appear in the faculty member's Daily session logging view.

## Security and data rules

- The role guard permits only Admin, Program Manager and Campus Manager users.
- The service verifies campus scope again before reading or writing records.
- A Campus Manager cannot submit another campus ID or attach an offering from another campus.
- Only Admin and Program Manager roles can create a Campus Manager.
- Only an existing Administrator can create another Administrator.
- Inactive campuses, archived semesters and archived subject offerings cannot receive new faculty access.
- User, password credential, staff profile, Faculty role, subject assignments and audit evidence are created in one database transaction.
- Passwords use scrypt with an individual random salt. Plaintext passwords are neither returned nor written to audit metadata.
- Duplicate login emails and employee codes return a conflict response without partially creating an account.

## API

| Method | Route                                         | Purpose                                                              |
| ------ | --------------------------------------------- | -------------------------------------------------------------------- |
| `GET`  | `/faculty-access/campuses/:campusId`          | List scoped faculty and assignable subject offerings                 |
| `POST` | `/faculty-access/campuses/:campusId/faculty`  | Create a faculty login, staff profile, role and optional assignments |
| `POST` | `/faculty-access/campuses/:campusId/managers` | Create a Campus Manager scoped to the selected campus                |
| `POST` | `/faculty-access/administrators`              | Create a global Administrator; Administrator role required           |

The creation body contains `name`, `email`, optional `notificationEmail`, `employeeCode`, `staffType`, `password` and `offeringIds`.

## Verification

Focused API tests prove campus authorization is invoked, credentials are hashed, role scope is correct, Administrator creation rejects Program Managers and audit records contain no password. React tests submit all three account types. The complete workspace test suite and production builds run through `pnpm check`.
