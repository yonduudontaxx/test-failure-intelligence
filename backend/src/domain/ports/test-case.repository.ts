import type { TestCaseResult, NewTestCaseResult } from '../entities/test-case-result.js';
import type { TestCaseStatus } from '../enums/test-case-status.js';
import type { TxClient } from './tx-client.js';

/** Rollup of one test's executions across a rolling window (one row per `fullName`). */
export interface ReliabilitySummary {
  fullName: string;
  suiteName?: string;
  testName: string;
  /** Number of PASSED executions in the window. */
  passCount: number;
  /** Number of FAILED + ERROR executions in the window. */
  failCount: number;
  /** Number of SKIPPED executions in the window. */
  skippedCount: number;
  /** Status of the most recent execution (any status). */
  lastStatus: TestCaseStatus;
  /** `executedAt` of the most recent execution, or undefined when the parent run has no executedAt. */
  lastExecutedAt?: Date;
}

export interface TestCaseRepository {
  /** @throws ForeignKeyError when projectId or testRunId references a non-existent row. */
  createMany(inputs: NewTestCaseResult[], client?: TxClient): Promise<void>;

  findByTestRun(testRunId: string): Promise<TestCaseResult[]>;

  /**
   * Returns up to `limit` most recent test case results for `fullName` within `projectId`,
   * ordered by the parent run's executedAt DESC (NULLS LAST).
   */
  findRecentByFullName(
    projectId: string,
    fullName: string,
    limit: number,
  ): Promise<TestCaseResult[]>;

  /** Returns the total number of test case results for the project. */
  countByProject(projectId: string): Promise<number>;

  /** Returns the number of test case results for the project filtered by status. */
  countByStatus(projectId: string, status: TestCaseStatus): Promise<number>;

  /**
   * Returns one `ReliabilitySummary` per unique `fullName` in the project,
   * computed from the last `window` executions (sorted by parent run's
   * `executedAt DESC, ingestedAt DESC`).
   */
  computeReliabilitySummaries(projectId: string, window: number): Promise<ReliabilitySummary[]>;
}
