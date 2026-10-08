import {
  ImportIssue,
  UploadedImportFile,
} from '../semester-import/semester-import.types';

export const lessonPlanColumns = [
  'unit_sequence',
  'unit_title',
  'unit_description',
  'topic_sequence',
  'topic_title',
  'topic_description',
  'planned_minutes',
  'exam_names',
] as const;

export type LessonPlanRow = {
  rowNumber: number;
  unitSequence: number;
  unitTitle: string;
  unitDescription: string | null;
  topicSequence: number;
  topicTitle: string;
  topicDescription: string | null;
  plannedMinutes: number;
  examNames: string[];
};

export type LessonPlanPreview = {
  valid: boolean;
  fileName: string;
  counts: {
    rows: number;
    units: number;
    topics: number;
    totalPlannedMinutes: number;
  };
  issues: ImportIssue[];
  rows: LessonPlanRow[];
};

export type { ImportIssue, UploadedImportFile };
