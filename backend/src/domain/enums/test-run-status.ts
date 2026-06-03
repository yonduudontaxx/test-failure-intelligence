export const TEST_RUN_STATUSES = ['SUCCESS', 'FAILED', 'PARTIAL'] as const;

export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];

export function isTestRunStatus(value: unknown): value is TestRunStatus {
  return typeof value === 'string' && (TEST_RUN_STATUSES as readonly string[]).includes(value);
}
