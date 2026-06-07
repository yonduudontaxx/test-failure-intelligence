import { describe, it, expect, jest } from '@jest/globals';
import { extractFailurePatterns } from '../../../../src/application/use-cases/extract-failure-patterns.js';
import type { FailurePatternRepository } from '../../../../src/domain/ports/failure-pattern.repository.js';
import type { ParsedTestCase } from '../../../../src/application/ingestion/types.js';
import type { TestCaseStatus } from '../../../../src/domain/enums/test-case-status.js';
import type { TxClient } from '../../../../src/domain/ports/tx-client.js';

function makeRepo() {
  const listByProject = jest.fn<FailurePatternRepository['listByProject']>();
  const upsertByPattern = jest.fn<FailurePatternRepository['upsertByPattern']>();
  const repo: FailurePatternRepository = { listByProject, upsertByPattern };
  upsertByPattern.mockResolvedValue({
    id: 'pat-1',
    projectId: 'p-1',
    pattern: '',
    severity: 'LOW',
    occurrenceCount: 1,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });
  return { repo, upsertByPattern };
}

function testCase(overrides: Partial<ParsedTestCase> & { status: TestCaseStatus }): ParsedTestCase {
  const testName = overrides.testName ?? 't';
  return {
    testName,
    fullName: overrides.fullName ?? testName,
    retryCount: 0,
    metadata: {},
    ...overrides,
  };
}

describe('extractFailurePatterns', () => {
  it('upserts one row per distinct pattern from FAILED cases', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({
          status: 'FAILED',
          failureMessage: 'TimeoutError: navigation timeout',
          failureType: 'TimeoutError',
          testName: 't1',
        }),
        testCase({
          status: 'FAILED',
          failureMessage: 'AssertionError: expected x to equal y',
          failureType: 'AssertionError',
          testName: 't2',
        }),
        testCase({
          status: 'FAILED',
          failureMessage: 'fetch failed',
          failureType: 'TypeError',
          testName: 't3',
        }),
      ],
      'p-1',
    );

    expect(upsertByPattern).toHaveBeenCalledTimes(3);
    const patterns = upsertByPattern.mock.calls.map((args) => args[0].pattern);
    expect(new Set(patterns).size).toBe(3);
  });

  it('deduplicates within a batch: 2 cases sharing a pattern → 1 upsert call', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({
          status: 'FAILED',
          failureMessage: 'Cannot read property "x" at /app/src/foo.ts:10:5',
          failureType: 'TypeError',
          testName: 'first',
        }),
        testCase({
          status: 'FAILED',
          failureMessage: 'Cannot read property "x" at /app/src/foo.ts:42:5',
          failureType: 'TypeError',
          testName: 'second',
        }),
      ],
      'p-1',
    );

    expect(upsertByPattern).toHaveBeenCalledTimes(1);
  });

  it('ignores PASSED and SKIPPED cases', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({ status: 'PASSED', testName: 'p' }),
        testCase({ status: 'SKIPPED', testName: 's' }),
        testCase({
          status: 'PASSED',
          failureMessage: 'should be ignored',
          failureType: 'IgnoredError',
          testName: 'p2',
        }),
      ],
      'p-1',
    );

    expect(upsertByPattern).not.toHaveBeenCalled();
  });

  it('processes ERROR cases the same as FAILED cases', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({
          status: 'ERROR',
          failureMessage: 'unhandled rejection',
          failureType: 'UnhandledRejection',
          testName: 't',
        }),
      ],
      'p-1',
    );

    expect(upsertByPattern).toHaveBeenCalledTimes(1);
  });

  it('skips FAILED cases with no failureMessage AND no failureType (no signal)', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(repo, [testCase({ status: 'FAILED', testName: 't' })], 'p-1');

    expect(upsertByPattern).not.toHaveBeenCalled();
  });

  it('skips FAILED cases with whitespace-only failureMessage AND no failureType', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [testCase({ status: 'FAILED', failureMessage: '   \n  ', testName: 't' })],
      'p-1',
    );

    expect(upsertByPattern).not.toHaveBeenCalled();
  });

  it('processes a FAILED case with failureType only (no message)', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [testCase({ status: 'FAILED', failureType: 'TimeoutError', testName: 't' })],
      'p-1',
    );

    expect(upsertByPattern).toHaveBeenCalledTimes(1);
    expect(upsertByPattern.mock.calls[0][0].pattern).toBe('TimeoutError in t');
  });

  it('processes a FAILED case with failureMessage only (no type)', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [testCase({ status: 'FAILED', failureMessage: 'something broke', testName: 't' })],
      'p-1',
    );

    expect(upsertByPattern).toHaveBeenCalledTimes(1);
    expect(upsertByPattern.mock.calls[0][0].pattern).toBe('something broke');
  });

  it('passes the TxClient through to every upsertByPattern call', async () => {
    const { repo, upsertByPattern } = makeRepo();
    const tx = { query: jest.fn() } as unknown as TxClient;
    await extractFailurePatterns(
      repo,
      [
        testCase({
          status: 'FAILED',
          failureMessage: 'a',
          failureType: 'A',
          testName: 't1',
        }),
        testCase({
          status: 'FAILED',
          failureMessage: 'b',
          failureType: 'B',
          testName: 't2',
        }),
      ],
      'p-1',
      tx,
    );

    expect(upsertByPattern).toHaveBeenCalledTimes(2);
    expect(upsertByPattern.mock.calls[0][1]).toBe(tx);
    expect(upsertByPattern.mock.calls[1][1]).toBe(tx);
  });

  it('does not call upsertByPattern at all when cases is empty', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(repo, [], 'p-1');
    expect(upsertByPattern).not.toHaveBeenCalled();
  });

  it('does not call upsertByPattern when every case is filtered out', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({ status: 'PASSED', testName: 'p1' }),
        testCase({ status: 'SKIPPED', testName: 'p2' }),
        testCase({ status: 'FAILED', testName: 'no-signal' }),
      ],
      'p-1',
    );
    expect(upsertByPattern).not.toHaveBeenCalled();
  });

  it('escalates severity when batch occurrence count crosses a threshold', async () => {
    const { repo, upsertByPattern } = makeRepo();
    // 5 cases sharing the same pattern → batch count 5 → MEDIUM per assignSeverity
    const cases: ParsedTestCase[] = Array.from({ length: 5 }, (_, i) =>
      testCase({
        status: 'FAILED',
        failureMessage: 'identical error',
        failureType: 'CommonError',
        testName: `t${i}`,
      }),
    );
    await extractFailurePatterns(repo, cases, 'p-1');

    expect(upsertByPattern).toHaveBeenCalledTimes(1);
    expect(upsertByPattern.mock.calls[0][0].severity).toBe('MEDIUM');
  });

  it('keeps severity LOW for a small batch (below MEDIUM threshold)', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({
          status: 'FAILED',
          failureMessage: 'one off',
          failureType: 'E',
          testName: 't',
        }),
      ],
      'p-1',
    );

    expect(upsertByPattern.mock.calls[0][0].severity).toBe('LOW');
  });

  it('forwards extracted category to the repo (timeout)', async () => {
    const { repo, upsertByPattern } = makeRepo();
    await extractFailurePatterns(
      repo,
      [
        testCase({
          status: 'FAILED',
          failureMessage: 'Navigation timeout exceeded',
          failureType: 'TimeoutError',
          testName: 't',
        }),
      ],
      'p-1',
    );

    expect(upsertByPattern.mock.calls[0][0].category).toBe('timeout');
  });
});
