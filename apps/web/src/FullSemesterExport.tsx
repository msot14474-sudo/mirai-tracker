import './semesterExport.css';
import { useMutation } from '@tanstack/react-query';
import { CampusDataScope } from './CampusDataScope';
import { campusDownload } from './campusData';
import { Semester } from './academic';

export function FullSemesterExport({
  initialCampusId,
}: {
  initialCampusId?: string;
}) {
  return (
    <CampusDataScope
      initialCampusId={initialCampusId}
      title="Full semester export"
      description="Download the complete teaching record for a campus semester in one file."
    >
      {(semester) => <SemesterDownload semester={semester} />}
    </CampusDataScope>
  );
}
function SemesterDownload({ semester }: { semester: Semester }) {
  const download = useMutation({
    mutationFn: (format: 'xlsx' | 'csv') =>
      campusDownload(
        `/semesters/${semester.id}/export?format=${format}`,
        `mirai-semester-${semester.startDate.slice(0, 10)}.${format}`,
      ),
  });
  return (
    <div className="campus-data-card semester-export-card">
      <div className="campus-data-card-heading">
        <div>
          <p className="eyebrow">READY TO EXPORT</p>
          <h3>{semester.name}</h3>
          <p>
            {semester.startDate.slice(0, 10)} — {semester.endDate.slice(0, 10)}
          </p>
        </div>
        <span className="semester-export-badge">Entire semester</span>
      </div>
      <div className="semester-export-sections">
        {[
          [
            'Calendar & exams',
            'Every semester date, working-day rules, holidays, events and exam deadlines.',
          ],
          [
            'People & subjects',
            'Batches, Mirai and University subjects, teachers and their assignments.',
          ],
          [
            'Teaching & lesson plans',
            'Weekly timetable, dated classes, plan versions, topics and exam syllabus.',
          ],
          [
            'Logs & progress',
            'Saved lecture logs, revisions, planned dates, coverage and exam readiness.',
          ],
          [
            'Visiting faculty costs',
            'Recorded classes, per-class rates, expenses, payments and balances.',
          ],
          [
            'Contents index',
            'A record count for each dataset, including sections with no saved records.',
          ],
        ].map(([title, description]) => (
          <div key={title}>
            <h4>{title}</h4>
            <p>{description}</p>
          </div>
        ))}
      </div>
      <div className="semester-export-footer">
        <p>
          Excel separates each dataset into a sheet. CSV combines records with a
          dataset column. Both use the selected semester and your campus access.
        </p>
        <div className="campus-data-actions">
          <button
            className="primary-button"
            disabled={download.isPending}
            onClick={() => download.mutate('xlsx')}
          >
            {download.isPending && download.variables === 'xlsx'
              ? 'Preparing Excel…'
              : 'Download Excel'}
          </button>
          <button
            className="secondary-button"
            disabled={download.isPending}
            onClick={() => download.mutate('csv')}
          >
            {download.isPending && download.variables === 'csv'
              ? 'Preparing CSV…'
              : 'Download CSV'}
          </button>
        </div>
      </div>
      {download.isPending && (
        <p role="status" className="campus-data-note">
          Preparing your semester records…
        </p>
      )}
      {download.error && (
        <p role="alert" className="form-error">
          {download.error.message}
        </p>
      )}
      {download.isSuccess && (
        <p role="status" className="campus-data-note">
          Your export is ready. Check your downloads.
        </p>
      )}
    </div>
  );
}
