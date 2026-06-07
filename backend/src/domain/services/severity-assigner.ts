import type { FailureSeverity } from '../enums/failure-severity.js';

const MS_PER_DAY = 86_400_000;

export const SEVERITY_THRESHOLDS = {
  critical: 50,
  criticalCategoryBoost: 25,
  criticalCategories: ['timeout', 'network', 'database'] as const,
  high: 20,
  medium: 5,
  staleAfterDays: 30,
};

export interface AssignSeverityInput {
  occurrenceCount: number;
  category: string;
  lastSeenAt: Date;
  now?: Date;
}

export function assignSeverity(input: AssignSeverityInput): FailureSeverity {
  const now = input.now ?? new Date();
  const daysSinceLastSeen = (now.getTime() - input.lastSeenAt.getTime()) / MS_PER_DAY;

  if (daysSinceLastSeen > SEVERITY_THRESHOLDS.staleAfterDays) return 'LOW';

  if (input.occurrenceCount >= SEVERITY_THRESHOLDS.critical) return 'CRITICAL';

  if (
    input.occurrenceCount >= SEVERITY_THRESHOLDS.criticalCategoryBoost &&
    (SEVERITY_THRESHOLDS.criticalCategories as readonly string[]).includes(input.category)
  ) {
    return 'CRITICAL';
  }

  if (input.occurrenceCount >= SEVERITY_THRESHOLDS.high) return 'HIGH';
  if (input.occurrenceCount >= SEVERITY_THRESHOLDS.medium) return 'MEDIUM';
  return 'LOW';
}
