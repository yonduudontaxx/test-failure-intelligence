export const FAILURE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type FailureSeverity = (typeof FAILURE_SEVERITIES)[number];

export function isFailureSeverity(value: unknown): value is FailureSeverity {
  return typeof value === 'string' && (FAILURE_SEVERITIES as readonly string[]).includes(value);
}
