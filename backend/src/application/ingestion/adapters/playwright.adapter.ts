import type { TestCaseStatus } from '../../../domain/enums/test-case-status.js';
import { IngestionFailedError } from '../errors.js';
import { normalizeFullName } from '../normalize.js';
import type { AdapterInput, IngestionAdapter, ParsedTestCase, ParsedTestRun } from '../types.js';

const STATUS_MAP: Record<string, TestCaseStatus> = {
  passed: 'PASSED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
  timedOut: 'FAILED',
  interrupted: 'FAILED',
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

function parseExecutedAt(stats: unknown): Date | undefined {
  if (!isObject(stats)) return undefined;
  const raw = stats.startTime;
  if (typeof raw !== 'string') return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapStatus(raw: unknown): TestCaseStatus {
  if (typeof raw !== 'string' || !(raw in STATUS_MAP)) {
    throw new IngestionFailedError(`Unsupported Playwright status "${String(raw)}".`);
  }
  return STATUS_MAP[raw];
}

function failureMessageFromResult(result: Record<string, unknown>): string | undefined {
  const errors = asArray(result.errors);
  if (errors && errors.length > 0 && isObject(errors[0])) {
    const firstMessage = asString(errors[0].message);
    if (firstMessage) return firstMessage;
  }
  if (isObject(result.error)) {
    const message = asString(result.error.message);
    if (message) return message;
  }
  return undefined;
}

function walkSuite(suiteValue: unknown, ancestorTitles: string[], cases: ParsedTestCase[]): void {
  if (!isObject(suiteValue)) {
    throw new IngestionFailedError('Playwright suite must be an object.');
  }
  const title = asString(suiteValue.title) ?? '';
  const newAncestors = title ? [...ancestorTitles, title] : ancestorTitles;
  const suiteName = newAncestors.length > 0 ? newAncestors.join(' > ') : undefined;

  const specs = asArray(suiteValue.specs);
  if (specs) {
    for (const specValue of specs) {
      if (!isObject(specValue)) {
        throw new IngestionFailedError('Playwright spec must be an object.');
      }
      const specTitle = asString(specValue.title);
      if (!specTitle) {
        throw new IngestionFailedError('Playwright spec is missing a title.');
      }
      const tests = asArray(specValue.tests) ?? [];
      for (const testValue of tests) {
        if (!isObject(testValue)) {
          throw new IngestionFailedError('Playwright test must be an object.');
        }
        const results = asArray(testValue.results) ?? [];
        if (results.length === 0) {
          throw new IngestionFailedError('Playwright test has no results entries.');
        }
        const lastResult = results[results.length - 1];
        if (!isObject(lastResult)) {
          throw new IngestionFailedError('Playwright test result must be an object.');
        }
        const status = mapStatus(lastResult.status);

        const parsed: ParsedTestCase = {
          testName: specTitle,
          fullName: normalizeFullName(suiteName, specTitle),
          status,
          retryCount: results.length - 1,
          metadata: {},
        };
        if (suiteName) parsed.suiteName = suiteName;

        const durationMs = asNumber(lastResult.duration);
        if (durationMs !== undefined) parsed.durationMs = durationMs;

        if (status === 'FAILED') {
          const failureMessage = failureMessageFromResult(lastResult);
          if (failureMessage) parsed.failureMessage = failureMessage;
        }

        cases.push(parsed);
      }
    }
  }

  const childSuites = asArray(suiteValue.suites);
  if (childSuites) {
    for (const child of childSuites) {
      walkSuite(child, newAncestors, cases);
    }
  }
}

export const playwrightAdapter: IngestionAdapter = {
  parse(input: AdapterInput): ParsedTestRun {
    if (input.kind !== 'json') {
      throw new IngestionFailedError(`playwright adapter expects JSON input, got "${input.kind}".`);
    }

    const body = input.body;
    if (!isObject(body)) {
      throw new IngestionFailedError('Playwright report must be an object.');
    }

    const suites = asArray(body.suites);
    if (!suites) {
      throw new IngestionFailedError('Playwright report has no "suites" array.');
    }

    const cases: ParsedTestCase[] = [];
    for (const suite of suites) {
      walkSuite(suite, [], cases);
    }

    const run: ParsedTestRun = {
      metadata: {},
      cases,
    };

    const executedAt = parseExecutedAt(body.stats);
    if (executedAt !== undefined) run.executedAt = executedAt;

    return run;
  },
};
