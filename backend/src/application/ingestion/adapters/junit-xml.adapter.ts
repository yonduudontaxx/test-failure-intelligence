import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { TestCaseStatus } from '../../../domain/enums/test-case-status.js';
import { IngestionFailedError } from '../errors.js';
import { normalizeFullName } from '../normalize.js';
import type { AdapterInput, IngestionAdapter, ParsedTestCase, ParsedTestRun } from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function elementText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (isObject(value)) {
    const text = asString(value['#text']);
    if (text) {
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
  }
  return undefined;
}

function elementAttr(value: unknown, attr: string): string | undefined {
  if (isObject(value)) {
    return asString(value[`@_${attr}`]);
  }
  return undefined;
}

function parseDuration(time: string | undefined): number | undefined {
  if (time === undefined) return undefined;
  const parsed = parseFloat(time);
  if (Number.isNaN(parsed)) return undefined;
  return Math.round(parsed * 1000);
}

function parseTimestamp(value: unknown): Date | undefined {
  const ts = elementAttr(value, 'timestamp');
  if (!ts) return undefined;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseTestcase(testcase: unknown, suiteName: string | undefined): ParsedTestCase {
  if (!isObject(testcase)) {
    throw new IngestionFailedError('JUnit testcase must be an element.');
  }
  const testName = asString(testcase['@_name']);
  if (!testName) {
    throw new IngestionFailedError('JUnit testcase is missing the "name" attribute.');
  }

  let status: TestCaseStatus;
  let failureMessage: string | undefined;
  let failureType: string | undefined;

  const failure = testcase.failure;
  const errorEl = testcase.error;
  const skippedEl = testcase.skipped;
  const statusAttr = asString(testcase['@_status']);

  if (failure !== undefined) {
    status = 'FAILED';
    const f = Array.isArray(failure) ? failure[0] : failure;
    failureMessage = elementText(f) ?? elementAttr(f, 'message');
    failureType = elementAttr(f, 'type');
  } else if (errorEl !== undefined) {
    status = 'FAILED';
    const e = Array.isArray(errorEl) ? errorEl[0] : errorEl;
    failureMessage = elementText(e) ?? elementAttr(e, 'message');
    failureType = elementAttr(e, 'type');
  } else if (skippedEl !== undefined || statusAttr === 'skipped') {
    status = 'SKIPPED';
  } else {
    status = 'PASSED';
  }

  const parsed: ParsedTestCase = {
    testName,
    fullName: normalizeFullName(suiteName, testName),
    status,
    retryCount: 0,
    metadata: {},
  };
  if (suiteName) parsed.suiteName = suiteName;

  const durationMs = parseDuration(asString(testcase['@_time']));
  if (durationMs !== undefined) parsed.durationMs = durationMs;

  if (failureMessage) parsed.failureMessage = failureMessage;
  if (failureType) parsed.failureType = failureType;

  return parsed;
}

function walkTestsuite(testsuite: unknown, cases: ParsedTestCase[]): void {
  if (!isObject(testsuite)) {
    throw new IngestionFailedError('JUnit testsuite must be an element.');
  }
  const suiteName = asString(testsuite['@_name']);

  const testcases = toArray(testsuite.testcase);
  for (const tc of testcases) {
    cases.push(parseTestcase(tc, suiteName));
  }

  const nested = toArray(testsuite.testsuite);
  for (const n of nested) {
    walkTestsuite(n, cases);
  }
}

export const junitXmlAdapter: IngestionAdapter = {
  parse(input: AdapterInput): ParsedTestRun {
    if (input.kind !== 'xml') {
      throw new IngestionFailedError(`junit-xml adapter expects XML input, got "${input.kind}".`);
    }

    const validation = XMLValidator.validate(input.text);
    if (validation !== true) {
      const reason = validation.err?.msg ?? 'invalid XML';
      throw new IngestionFailedError(`JUnit XML is not well-formed: ${reason}.`);
    }

    let parsed: unknown;
    try {
      parsed = parser.parse(input.text);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new IngestionFailedError(`JUnit XML is not well-formed: ${reason}.`);
    }

    if (!isObject(parsed)) {
      throw new IngestionFailedError('JUnit XML root must be an XML element.');
    }

    const cases: ParsedTestCase[] = [];
    let executedAt: Date | undefined;

    const testsuitesRoot = parsed.testsuites;
    const testsuiteRoot = parsed.testsuite;

    if (testsuitesRoot !== undefined) {
      executedAt = parseTimestamp(testsuitesRoot);
      const suites = isObject(testsuitesRoot) ? toArray(testsuitesRoot.testsuite) : [];
      for (const suite of suites) {
        walkTestsuite(suite, cases);
        if (!executedAt) {
          executedAt = parseTimestamp(suite);
        }
      }
    } else if (testsuiteRoot !== undefined) {
      const suites = toArray(testsuiteRoot);
      for (const suite of suites) {
        walkTestsuite(suite, cases);
        if (!executedAt) {
          executedAt = parseTimestamp(suite);
        }
      }
    } else {
      throw new IngestionFailedError('JUnit XML has no <testsuite> or <testsuites> root.');
    }

    const run: ParsedTestRun = {
      metadata: {},
      cases,
    };
    if (executedAt !== undefined) run.executedAt = executedAt;

    return run;
  },
};
