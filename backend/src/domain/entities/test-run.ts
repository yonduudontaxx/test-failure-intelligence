import type { SourceType } from '../enums/source-type.js';
import type { TestRunStatus } from '../enums/test-run-status.js';

export type TestRun = Readonly<{
  id: string;
  projectId: string;
  externalId?: string;
  sourceType: SourceType;
  pipelineName?: string;
  buildNumber?: string;
  branch?: string;
  commitSha?: string;
  environment?: string;
  status: TestRunStatus;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs?: number;
  metadata: Record<string, unknown>;
  ingestedAt: Date;
  executedAt?: Date;
}>;

export type NewTestRun = Omit<TestRun, 'id' | 'ingestedAt'>;
