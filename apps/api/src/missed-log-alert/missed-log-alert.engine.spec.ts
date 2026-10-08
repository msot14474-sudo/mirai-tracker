import { AlertType } from '@prisma/client';
import {
  alertDueAt,
  endOfCampusDay,
  isAlertDue,
} from './missed-log-alert.engine';

const session = {
  sessionDate: new Date('2026-10-08T00:00:00.000Z'),
  endsAt: new Date('2026-10-08T10:00:00.000Z'),
  timezone: 'Asia/Kolkata',
};

describe('missed-log alert timing', () => {
  it('places the faculty reminder at the end of the campus local day', () => {
    expect(
      endOfCampusDay(session.sessionDate, session.timezone).toISOString(),
    ).toBe('2026-10-08T18:29:59.999Z');
  });

  it('does not release the reminder one millisecond early', () => {
    expect(
      isAlertDue(
        AlertType.FACULTY_MISSED_LOG,
        session,
        new Date('2026-10-08T18:29:59.998Z'),
      ),
    ).toBe(false);
    expect(
      isAlertDue(
        AlertType.FACULTY_MISSED_LOG,
        session,
        new Date('2026-10-08T18:29:59.999Z'),
      ),
    ).toBe(true);
  });

  it('releases escalation exactly 48 hours after the class ends', () => {
    expect(
      alertDueAt(AlertType.CAMPUS_MANAGER_ESCALATION, session).toISOString(),
    ).toBe('2026-10-10T10:00:00.000Z');
    expect(
      isAlertDue(
        AlertType.CAMPUS_MANAGER_ESCALATION,
        session,
        new Date('2026-10-10T09:59:59.999Z'),
      ),
    ).toBe(false);
    expect(
      isAlertDue(
        AlertType.CAMPUS_MANAGER_ESCALATION,
        session,
        new Date('2026-10-10T10:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('uses each campus timezone independently', () => {
    expect(
      endOfCampusDay(session.sessionDate, 'America/New_York').toISOString(),
    ).toBe('2026-10-09T03:59:59.999Z');
  });
});
