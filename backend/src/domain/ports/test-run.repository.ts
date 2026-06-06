import type { TestRun, NewTestRun } from '../entities/test-run.js';
import type { TxClient } from './tx-client.js';

/** One bucket in the failure-trend time series, keyed by UTC calendar day. */
export interface DailyFailureBucket {
  /** ISO 8601 calendar date in UTC, formatted YYYY-MM-DD. */
  date: string;
  /** Total runs whose execution day matches `date`. */
  totalRuns: number;
  /** Subset of `totalRuns` with status FAILED. */
  failedRuns: number;
}

export interface TestRunRepository {
  /** @throws ForeignKeyError when projectId references a non-existent project. */
  create(input: NewTestRun, client?: TxClient): Promise<TestRun>;

  findById(id: string): Promise<TestRun | null>;

  listByProject(
    projectId: string,
    opts: { limit: number; offset: number; branch?: string; environment?: string },
  ): Promise<{ items: TestRun[]; total: number }>;

  /** Returns the run with the most recent executedAt (NULLS LAST), or null if the project has no runs. */
  findMostRecentByProject(projectId: string): Promise<TestRun | null>;

  /** Returns the total number of test runs for the project. */
  countByProject(projectId: string): Promise<number>;

  /**
   * Returns daily failure-rate buckets across the inclusive `[from, to]` UTC date range.
   * Days with zero runs are omitted from the result. Runs without `executedAt` are
   * bucketed by `ingestedAt::date` instead.
   */
  findFailureTrend(
    projectId: string,
    opts: { from: Date; to: Date },
  ): Promise<DailyFailureBucket[]>;
}
