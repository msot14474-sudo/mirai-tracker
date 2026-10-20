import { LessonPlanPreview, LessonPlanRow } from './lesson-plan.types';

export type ExistingPlan = {
  id: string;
  version: number;
  status: string;
  units: Array<{
    id: string;
    sequence: number;
    title: string;
    description: string | null;
    topics: Array<{
      id: string;
      sequence: number;
      title: string;
      description: string | null;
      plannedMinutes: number;
      examScopes: Array<{ examWindow: { name: string } }>;
    }>;
  }>;
};
const normalized = (value: string | null) => (value ?? '').trim().toLowerCase();

/** Adding a partial file never changes an existing topic or its recorded progress. */
export function additionsFor(preview: LessonPlanPreview, plan?: ExistingPlan) {
  const additions: LessonPlanRow[] = [];
  let unchanged = 0;
  for (const row of preview.rows) {
    const unit = plan?.units.find((u) => u.sequence === row.unitSequence);
    const collision = (message: string) =>
      preview.issues.push({
        sheet: 'Lesson Plan',
        rowNumber: row.rowNumber,
        columnName: 'topic_sequence',
        submittedValue: `${row.unitSequence}:${row.topicSequence}`,
        errorMessage: message,
      });
    if (unit && normalized(unit.title) !== normalized(row.unitTitle)) {
      collision(
        `Unit ${row.unitSequence} is already “${unit.title}”. Use that unit title, or a different unit number for a new unit.`,
      );
      continue;
    }
    const existing = unit?.topics.find((t) => t.sequence === row.topicSequence);
    if (existing) {
      const scopes = new Set(
        existing.examScopes.map((s) => normalized(s.examWindow.name)),
      );
      if (
        normalized(existing.title) !== normalized(row.topicTitle) ||
        existing.plannedMinutes !== row.plannedMinutes ||
        (row.topicDescription &&
          normalized(existing.description) !==
            normalized(row.topicDescription)) ||
        row.examNames.some((name) => !scopes.has(normalized(name)))
      ) {
        collision(
          `Topic ${row.unitSequence}.${row.topicSequence} already exists as “${existing.title}”. Existing topics are preserved; use a new topic number to add a topic, or edit the draft directly.`,
        );
      } else unchanged++;
    } else {
      const duplicate = unit?.topics.find(
        (t) => normalized(t.title) === normalized(row.topicTitle),
      );
      if (duplicate)
        collision(
          `“${row.topicTitle}” already exists at topic ${row.unitSequence}.${duplicate.sequence}. Keep its original number to avoid a duplicate.`,
        );
      else additions.push(row);
    }
  }
  preview.valid = preview.rows.length > 0 && preview.issues.length === 0;
  return { rows: additions, added: additions.length, unchanged };
}
