import { useMemo, useState } from 'react';
import { SubjectProgress } from './progress';
import {
  buildRecoveryPlan,
  buildRecoveryPlanCsv,
  RecoveryTarget,
} from './recoveryPlan';

const statusLabels = {
  ON_TRACK: 'ON TRACK',
  TIGHT: 'TIGHT',
  DANGER: 'DANGER',
  COMPLETE: 'COMPLETE',
} as const;

export function RecoveryPlanner({ subjects }: { subjects: SubjectProgress[] }) {
  const [target, setTarget] = useState<RecoveryTarget>('ON_TRACK');
  const [proposedHours, setProposedHours] = useState<Record<string, number>>(
    {},
  );
  const rows = useMemo(
    () => buildRecoveryPlan(subjects, target, proposedHours),
    [subjects, target, proposedHours],
  );
  const proposedTotal = rows.reduce(
    (total, row) => total + row.scenario.proposedExtraHours,
    0,
  );
  const meetingTarget = rows.filter((row) => row.scenario.meetsTarget).length;

  function applyMinimumPlan() {
    setProposedHours((current) => ({
      ...current,
      ...Object.fromEntries(
        rows.map((row) => [row.subject.id, row.scenario.recommendedExtraHours]),
      ),
    }));
  }

  function downloadPlan() {
    const blob = new Blob([buildRecoveryPlanCsv(rows)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mirai-recovery-plan-${target.toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="recovery-planner" aria-labelledby="recovery-title">
      <div className="recovery-heading">
        <div>
          <p className="step-label">M20 · Decision support</p>
          <h3 id="recovery-title">What-if recovery planner</h3>
          <p>
            Test extra teaching capacity before editing the timetable. The
            calculation uses each subject's own remaining hours and thresholds.
          </p>
        </div>
        <label>
          Recovery target
          <select
            value={target}
            onChange={(event) =>
              setTarget(event.target.value as RecoveryTarget)
            }
          >
            <option value="ON_TRACK">On track</option>
            <option value="TIGHT">Tight or better</option>
          </select>
        </label>
      </div>

      <div className="scenario-note" role="note">
        <strong>Safe scenario</strong>
        <span>
          Planning only. No timetable, lesson plan or progress record is
          changed.
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="recovery-empty">
          <strong>No intervention needed</strong>
          <span>Every visible subject already meets the selected target.</span>
        </div>
      ) : (
        <>
          <div className="recovery-summary" aria-live="polite">
            <div>
              <span>Priority subjects</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Meeting target</span>
              <strong>
                {meetingTarget} of {rows.length}
              </strong>
            </div>
            <div>
              <span>Proposed capacity</span>
              <strong>{formatHours(proposedTotal)}</strong>
            </div>
            <div className="recovery-actions">
              <button type="button" onClick={applyMinimumPlan}>
                Apply minimum plan
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={downloadPlan}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.print()}
              >
                Print plan
              </button>
            </div>
          </div>

          <div className="recovery-grid">
            {rows.map(({ subject, scenario }, index) => (
              <article className="recovery-card" key={subject.id}>
                <header>
                  <span className="recovery-rank">Priority {index + 1}</span>
                  <div>
                    <small>
                      {subject.subject.code} · {subject.campus.name}
                    </small>
                    <strong className="recovery-subject-name">
                      {subject.subject.name}
                    </strong>
                    <span>{subject.batch.name}</span>
                  </div>
                  <span
                    className={`progress-status ${subject.status.toLowerCase()}`}
                  >
                    {statusLabels[subject.status]}
                  </span>
                </header>

                <dl className="recovery-metrics">
                  <div>
                    <dt>Remaining</dt>
                    <dd>{formatHours(subject.remainingHours)}</dd>
                  </div>
                  <div>
                    <dt>Available</dt>
                    <dd>{formatHours(subject.availableHours)}</dd>
                  </div>
                  <div>
                    <dt>Minimum extra</dt>
                    <dd>{formatHours(scenario.recommendedExtraHours)}</dd>
                  </div>
                </dl>

                <div className="recovery-input-row">
                  <label htmlFor={`extra-hours-${subject.id}`}>
                    Proposed extra hours
                  </label>
                  <div>
                    <input
                      id={`extra-hours-${subject.id}`}
                      aria-label={`Extra hours for ${subject.subject.name}`}
                      type="number"
                      min="0"
                      max="500"
                      step="0.5"
                      value={proposedHours[subject.id] ?? 0}
                      onChange={(event) => {
                        const value = Math.max(
                          0,
                          Math.min(500, Number(event.target.value) || 0),
                        );
                        setProposedHours((current) => ({
                          ...current,
                          [subject.id]: value,
                        }));
                      }}
                    />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setProposedHours((current) => ({
                          ...current,
                          [subject.id]: scenario.recommendedExtraHours,
                        }))
                      }
                    >
                      Use minimum
                    </button>
                  </div>
                </div>

                <div
                  className={`recovery-result ${scenario.meetsTarget ? 'ready' : 'short'}`}
                >
                  <div>
                    <span>Projected result</span>
                    <strong>{statusLabels[scenario.projectedStatus]}</strong>
                  </div>
                  <div>
                    <span>Projected buffer ratio</span>
                    <strong>
                      {scenario.projectedBufferRatio === null
                        ? 'Complete'
                        : `${formatNumber(scenario.projectedBufferRatio)}×`}
                    </strong>
                  </div>
                  <p>
                    {scenario.meetsTarget
                      ? `Selected ${targetLabel(target)} target is met.`
                      : `${formatHours(scenario.shortfallHours)} more capacity needed.`}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function targetLabel(target: RecoveryTarget) {
  return target === 'ON_TRACK' ? 'on-track' : 'tight-or-better';
}

function formatHours(value: number) {
  return `${formatNumber(value)}h`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
    value,
  );
}
