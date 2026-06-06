import type { TestCaseStatus } from '../../../domain/enums/test-case-status.js';
import { IngestionFailedError } from '../errors.js';
import { normalizeFullName } from '../normalize.js';
import type { AdapterInput, IngestionAdapter, ParsedTestCase, ParsedTestRun } from '../types.js';

const VALID_STATUSES: readonly TestCaseStatus[] = ['PASSED', 'FAILED', 'SKIPPED', 'ERROR'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asMetadata(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function parseExecutedAt(raw: unknown): Date | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') {
    throw new IngestionFailedError('testRun.executedAt must be an ISO 8601 string.');
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new IngestionFailedError(`testRun.executedAt is not a valid date: "${raw}".`);
  }
  return date;
}

function parseStatus(raw: unknown): TestCaseStatus {
  if (typeof raw !== 'string' || !VALID_STATUSES.includes(raw as TestCaseStatus)) {
    throw new IngestionFailedError(`Unsupported test case status "${String(raw)}".`);
  }
  return raw as TestCaseStatus;
}

function parseCase(raw: unknown, index: number): ParsedTestCase {
  if (!isObject(raw)) {
    throw new IngestionFailedError(`testCases[${index}] must be an object.`);
  }
  const testName = asString(raw.testName);
  if (!testName) {
    throw new IngestionFailedError(`testCases[${index}] must have a testName.`);
  }
  const suiteName = asString(raw.suiteName);
  const status = parseStatus(raw.status);

  const parsed: ParsedTestCase = {
    testName,
    fullName: normalizeFullName(suiteName, testName),
    status,
    retryCount: asNumber(raw.retryCount) ?? 0,
    metadata: asMetadata(raw.metadata),
  };
  if (suiteName !== undefined) parsed.suiteName = suiteName;

  const durationMs = asNumber(raw.durationMs);
  if (durationMs !== undefined) parsed.durationMs = durationMs;

  const failureMessage = asString(raw.failureMessage);
  if (failureMessage !== undefined) parsed.failureMessage = failureMessage;

  const failureType = asString(raw.failureType);
  if (failureType !== undefined) parsed.failureType = failureType;

  return parsed;
}

export const canonicalJsonAdapter: IngestionAdapter = {
  parse(input: AdapterInput): ParsedTestRun {
    if (input.kind !== 'json') {
      throw new IngestionFailedError(
        `canonical-json adapter expects JSON input, got "${input.kind}".`,
      );
    }

    const body = input.body;
    if (!isObject(body)) {
      throw new IngestionFailedError('Request body must be an object.');
    }

    const testRunRaw = body.testRun;
    if (testRunRaw !== undefined && !isObject(testRunRaw)) {
      throw new IngestionFailedError('testRun must be an object.');
    }
    const testRun = (testRunRaw ?? {}) as Record<string, unknown>;

    const testCasesRaw = body.testCases;
    if (!Array.isArray(testCasesRaw)) {
      throw new IngestionFailedError('Canonical JSON has no "testCases" array.');
    }

    const cases = testCasesRaw.map(parseCase);

    const run: ParsedTestRun = {
      metadata: asMetadata(testRun.metadata),
      cases,
    };

    const branch = asString(testRun.branch);
    if (branch !== undefined) run.branch = branch;

    const environment = asString(testRun.environment);
    if (environment !== undefined) run.environment = environment;

    const commitSha = asString(testRun.commitSha);
    if (commitSha !== undefined) run.commitSha = commitSha;

    const pipelineName = asString(testRun.pipelineName);
    if (pipelineName !== undefined) run.pipelineName = pipelineName;

    const buildNumber = asString(testRun.buildNumber);
    if (buildNumber !== undefined) run.buildNumber = buildNumber;

    const executedAt = parseExecutedAt(testRun.executedAt);
    if (executedAt !== undefined) run.executedAt = executedAt;

    return run;
  },
};
