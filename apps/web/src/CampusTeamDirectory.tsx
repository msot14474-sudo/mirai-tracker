import { facultyAccessApi } from './facultyAccess';
import './ResponsiveRecords.css';

type CampusTeam = Awaited<ReturnType<typeof facultyAccessApi.network>>[number];
export function CampusTeamDirectory({ campus }: { campus: CampusTeam }) {
  return (
    <div className="campus-team-directory">
      <header className="campus-team-heading">
        <div>
          <span className="workspace-kicker">{campus.name}</span>
          <h3>Campus team</h3>
          <p>People and teaching assignments for this campus.</p>
        </div>
        <div className="campus-team-counts">
          <span>
            <strong>{campus.managerCount}</strong>{' '}
            {campus.managerCount === 1 ? 'Campus manager' : 'Campus managers'}
          </span>
          <span>
            <strong>{campus.facultyCount}</strong> Faculty
          </span>
        </div>
      </header>
      {campus.people.length ? (
        <div className="table-scroll responsive-records campus-team-records">
          <table
            className="campus-team-table"
            role="table"
            aria-label={`${campus.name} team`}
          >
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  Member
                </th>
                <th scope="col" role="columnheader">
                  Role
                </th>
                <th scope="col" role="columnheader">
                  Subjects and batches
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {campus.people.map((person) => (
                <tr key={`${person.id}-${person.role}`} role="row">
                  <td role="cell" data-label="Member">
                    <span className="record-field-label" aria-hidden="true">
                      Member
                    </span>
                    <div className="team-member">
                      <span className="team-avatar" aria-hidden="true">
                        {person.name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join('')}
                      </span>
                      <div>
                        <strong>{person.name}</strong>
                        <small>
                          {person.status === 'INVITED' ? 'Invited' : 'Active'}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td role="cell" data-label="Role">
                    <span className="record-field-label" aria-hidden="true">
                      Role
                    </span>
                    <span
                      className={`team-role ${person.role === 'CAMPUS_MANAGER' ? 'manager' : ''}`}
                    >
                      {person.role === 'CAMPUS_MANAGER'
                        ? 'Campus manager'
                        : 'Faculty'}
                    </span>
                  </td>
                  <td role="cell" data-label="Subjects and batches">
                    <span className="record-field-label" aria-hidden="true">
                      Subjects and batches
                    </span>
                    {person.role === 'CAMPUS_MANAGER' ? (
                      <span className="team-scope">
                        Campus timetable and faculty access
                      </span>
                    ) : (
                      <div className="team-assignments">
                        {person.subjects.map((s) => (
                          <span key={s.offeringId} className="team-assignment">
                            {s.subject} · {s.batch} · {s.semester}
                          </span>
                        ))}
                        {person.defaultSubjects
                          ?.filter(
                            (s) =>
                              !person.subjects.some(
                                (a) => a.subject === s.name,
                              ),
                          )
                          .map((s) => (
                            <span
                              key={s.id}
                              className="team-assignment pending"
                            >
                              {s.name} · Batch link pending
                            </span>
                          ))}
                        {!person.subjects.length &&
                          !person.defaultSubjects?.length && (
                            <span className="team-scope">
                              No subjects assigned yet
                            </span>
                          )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <h4>No campus team yet</h4>
          <p>Add a campus manager or faculty member to get started.</p>
        </div>
      )}
    </div>
  );
}
