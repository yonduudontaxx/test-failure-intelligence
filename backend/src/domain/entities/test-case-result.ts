import type { TestCaseStatus } from '../enums/test-case-status.js';

export type TestCaseResult = Readonly<{
  id: string;
  projectId: string;
  testRunId: string;
  suiteName?: string;
  testName: string;
  fullName: string;
  status: TestCaseStatus;
  durationMs?: number;
  failureMessage?: string;
  failureType?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}>;

export type NewTestCaseResult = Omit<TestCaseResult, 'id'>;
