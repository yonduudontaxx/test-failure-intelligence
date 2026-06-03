export const TEST_CASE_STATUSES = ['PASSED', 'FAILED', 'SKIPPED', 'ERROR'] as const;

export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export function isTestCaseStatus(value: unknown): value is TestCaseStatus {
  return typeof value === 'string' && (TEST_CASE_STATUSES as readonly string[]).includes(value);
}
