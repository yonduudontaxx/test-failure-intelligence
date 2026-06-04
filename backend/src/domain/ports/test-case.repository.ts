import type { TestCaseResult, NewTestCaseResult } from '../entities/test-case-result.js';
import type { TxClient } from './tx-client.js';

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
}
