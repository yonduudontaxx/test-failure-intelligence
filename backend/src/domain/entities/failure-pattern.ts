import type { FailureSeverity } from '../enums/failure-severity.js';

export type FailurePattern = Readonly<{
  id: string;
  projectId: string;
  pattern: string;
  category?: string;
  severity: FailureSeverity;
  firstSeenAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
}>;

export type NewFailurePattern = Omit<FailurePattern, 'id'>;
