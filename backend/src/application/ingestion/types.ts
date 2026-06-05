import type { SourceType } from '../../domain/enums/source-type.js';
import type { TestCaseStatus } from '../../domain/enums/test-case-status.js';

export interface ParsedTestCase {
  suiteName?: string;
  testName: string;
  fullName: string;
  status: TestCaseStatus;
  durationMs?: number;
  failureMessage?: string;
  failureType?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}

export interface ParsedTestRun {
  externalId?: string;
  pipelineName?: string;
  buildNumber?: string;
  branch?: string;
  commitSha?: string;
  environment?: string;
  executedAt?: Date;
  durationMs?: number;
  metadata: Record<string, unknown>;
  cases: ParsedTestCase[];
}

export type AdapterInput = { kind: 'json'; body: unknown } | { kind: 'xml'; text: string };

export interface IngestionAdapter {
  /** @throws IngestionFailedError when the input cannot be normalized. */
  parse(input: AdapterInput): ParsedTestRun;
}

export interface IngestTestRunInput {
  projectId: string;
  sourceType: SourceType;
  raw: AdapterInput;
  overrides?: {
    pipelineName?: string;
    buildNumber?: string;
    branch?: string;
    commitSha?: string;
    environment?: string;
    externalId?: string;
  };
}
