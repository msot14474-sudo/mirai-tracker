/** Persistent marker on an unlogged class awaiting its teacher's decision. */
export const CALENDAR_REVIEW_REASON =
  'Calendar changed — teacher review required.';
export function needsCalendarReview(session: {
  status: string;
  cancellationReason?: string | null;
}) {
  return (
    session.status === 'CANCELLED' &&
    session.cancellationReason === CALENDAR_REVIEW_REASON
  );
}
