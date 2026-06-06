import type { TestRun, NewTestRun } from '../entities/test-run.js';
import type { TestRunStatus } from '../enums/test-run-status.js';
import type { TxClient } from './tx-client.js';

/**
 * One bucket in the failure-trend time series. `date` is the truncated UTC
 * start of the bucket (the day itself when bucketing by day; the Monday of
 * the ISO week when bucketing by week).
 */
export interface DailyFailureBucket {
  /** ISO 8601 calendar date (UTC) of the bucket start, formatted YYYY-MM-DD. */
  date: string;
  /** Total runs whose execution date falls inside this bucket. */
  totalRuns: number;
  /** Subset of `totalRuns` with status FAILED. */
  failedRuns: number;
  /** (totalRuns - failedRuns) / totalRuns as a 0.0–1.0 ratio. */
  passRate: number;
}

export interface TestRunRepository {
  /** @throws ForeignKeyError when projectId references a non-existent project. */
  create(input: NewTestRun, client?: TxClient): Promise<TestRun>;

  findById(id: string): Promise<TestRun | null>;

  listByProject(
    projectId: string,
    opts: {
      limit: number;
      offset: number;
      branch?: string;
      environment?: string;
      status?: TestRunStatus;
    },
  ): Promise<{ items: TestRun[]; total: number }>;

  /** Returns the run with the most recent executedAt (NULLS LAST), or null if the project has no runs. */
  findMostRecentByProject(projectId: string): Promise<TestRun | null>;

  /** Returns the total number of test runs for the project. */
  countByProject(projectId: string): Promise<number>;

  /**
   * Returns failure-rate buckets across the trailing `opts.days` UTC time
   * window. Buckets are formed by `DATE_TRUNC(opts.bucketSize, …)`. Empty
   * buckets (windows with no runs) are NOT synthesised. Runs without
   * `executedAt` are bucketed by `ingestedAt` instead. Ordered by bucket
   * date ascending (oldest first).
   */
  findFailureTrend(
    projectId: string,
    opts: { days: number; bucketSize: 'day' | 'week' },
  ): Promise<DailyFailureBucket[]>;
}
