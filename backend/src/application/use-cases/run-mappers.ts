import type { TestRun } from '../../domain/entities/test-run.js';
import type { TestCaseResult } from '../../domain/entities/test-case-result.js';
import type { CaseResponse, RunResponse } from '../../http/schemas/test-run.js';

export function toRunResponse(run: TestRun): RunResponse {
  const r: RunResponse = {
    id: run.id,
    projectId: run.projectId,
    sourceType: run.sourceType,
    status: run.status,
    totalTests: run.totalTests,
    passedTests: run.passedTests,
    failedTests: run.failedTests,
    skippedTests: run.skippedTests,
    metadata: run.metadata,
    ingestedAt: run.ingestedAt.toISOString(),
  };
  if (run.branch !== undefined) r.branch = run.branch;
  if (run.environment !== undefined) r.environment = run.environment;
  if (run.commitSha !== undefined) r.commitSha = run.commitSha;
  if (run.pipelineName !== undefined) r.pipelineName = run.pipelineName;
  if (run.buildNumber !== undefined) r.buildNumber = run.buildNumber;
  if (run.externalId !== undefined) r.externalId = run.externalId;
  if (run.durationMs !== undefined) r.durationMs = run.durationMs;
  if (run.executedAt !== undefined) r.executedAt = run.executedAt.toISOString();
  return r;
}

export function toCaseResponse(c: TestCaseResult): CaseResponse {
  const r: CaseResponse = {
    id: c.id,
    projectId: c.projectId,
    testRunId: c.testRunId,
    testName: c.testName,
    fullName: c.fullName,
    status: c.status,
    retryCount: c.retryCount,
    metadata: c.metadata,
  };
  if (c.suiteName !== undefined) r.suiteName = c.suiteName;
  if (c.durationMs !== undefined) r.durationMs = c.durationMs;
  if (c.failureMessage !== undefined) r.failureMessage = c.failureMessage;
  if (c.failureType !== undefined) r.failureType = c.failureType;
  return r;
}
