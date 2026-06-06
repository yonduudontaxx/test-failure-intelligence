import type { TestCaseStatus } from '../../../domain/enums/test-case-status.js';
import { IngestionFailedError } from '../errors.js';
import { normalizeFullName } from '../normalize.js';
import type { AdapterInput, IngestionAdapter, ParsedTestCase, ParsedTestRun } from '../types.js';

const STATUS_MAP: Record<string, TestCaseStatus> = {
  passed: 'PASSED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
  pending: 'SKIPPED',
  todo: 'SKIPPED',
  disabled: 'SKIPPED',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function parseExecutedAt(value: unknown): Date | undefined {
  if (typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapStatus(raw: unknown): TestCaseStatus {
  if (typeof raw !== 'string' || !(raw in STATUS_MAP)) {
    throw new IngestionFailedError(`Unsupported Jest status "${String(raw)}".`);
  }
  return STATUS_MAP[raw];
}

function collectAncestorTitles(value: unknown): string[] {
  const arr = asArray(value);
  if (!arr) return [];
  const titles: string[] = [];
  for (const entry of arr) {
    const s = asString(entry);
    if (s) titles.push(s);
  }
  return titles;
}

function parseAssertion(raw: unknown): ParsedTestCase {
  if (!isObject(raw)) {
    throw new IngestionFailedError('Jest assertion result must be an object.');
  }
  const title = asString(raw.title);
  if (!title) {
    throw new IngestionFailedError('Jest assertion result is missing a title.');
  }
  const ancestors = collectAncestorTitles(raw.ancestorTitles);
  const suiteName = ancestors.length > 0 ? ancestors.join(' > ') : undefined;
  const status = mapStatus(raw.status);

  const parsed: ParsedTestCase = {
    testName: title,
    fullName: normalizeFullName(suiteName, title),
    status,
    retryCount: 0,
    metadata: {},
  };
  if (suiteName) parsed.suiteName = suiteName;

  const durationMs = asNumber(raw.duration);
  if (durationMs !== undefined) parsed.durationMs = durationMs;

  if (status === 'FAILED') {
    const failureMessages = asArray(raw.failureMessages);
    if (failureMessages && failureMessages.length > 0) {
      const first = asString(failureMessages[0]);
      if (first) parsed.failureMessage = first;
    }
  }

  return parsed;
}

export const jestAdapter: IngestionAdapter = {
  parse(input: AdapterInput): ParsedTestRun {
    if (input.kind !== 'json') {
      throw new IngestionFailedError(`jest adapter expects JSON input, got "${input.kind}".`);
    }

    const body = input.body;
    if (!isObject(body)) {
      throw new IngestionFailedError('Jest report must be an object.');
    }

    const fileResults = asArray(body.testResults);
    if (!fileResults) {
      throw new IngestionFailedError('Jest report has no "testResults" array.');
    }

    const cases: ParsedTestCase[] = [];
    for (const fileResult of fileResults) {
      if (!isObject(fileResult)) {
        throw new IngestionFailedError('Jest testResults entry must be an object.');
      }
      const innerResults = asArray(fileResult.testResults) ?? [];
      for (const assertion of innerResults) {
        cases.push(parseAssertion(assertion));
      }
    }

    const run: ParsedTestRun = {
      metadata: {},
      cases,
    };

    const executedAt = parseExecutedAt(body.startTime);
    if (executedAt !== undefined) run.executedAt = executedAt;

    return run;
  },
};
