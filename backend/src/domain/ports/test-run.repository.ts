import type { TestRun, NewTestRun } from '../entities/test-run.js';
import type { TxClient } from './tx-client.js';

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
}
