import { describe, it, expect, jest } from '@jest/globals';
import type { Pool, PoolClient } from '../../../../src/infrastructure/database/types.js';
import { ingestTestRun } from '../../../../src/application/use-cases/ingest-test-run.js';
import type { TestRunRepository } from '../../../../src/domain/ports/test-run.repository.js';
import type { TestCaseRepository } from '../../../../src/domain/ports/test-case.repository.js';
import type { TestRun } from '../../../../src/domain/entities/test-run.js';
import type {
  IngestionAdapter,
  ParsedTestRun,
} from '../../../../src/application/ingestion/types.js';
import { IngestionFailedError } from '../../../../src/application/ingestion/errors.js';
import { ForeignKeyError, UniqueConstraintError } from '../../../../src/domain/errors/index.js';

const FROZEN_NOW = new Date('2026-06-05T12:00:00.000Z');

function makeStubClient(): PoolClient {
  return {
    query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  } as unknown as PoolClient;
}

function makeStubPool(client: PoolClient): Pool {
  return {
    connect: jest.fn<() => Promise<PoolClient>>().mockResolvedValue(client),
  } as unknown as Pool;
}

function makeRepos() {
  const runCreate = jest.fn<TestRunRepository['create']>();
  const runRepo: TestRunRepository = {
    create: runCreate,
    findById: jest.fn<TestRunRepository['findById']>(),
    listByProject: jest.fn<TestRunRepository['listByProject']>(),
    findMostRecentByProject: jest.fn<TestRunRepository['findMostRecentByProject']>(),
  };

  const caseCreateMany = jest.fn<TestCaseRepository['createMany']>();
  const caseRepo: TestCaseRepository = {
    createMany: caseCreateMany,
    findByTestRun: jest.fn<TestCaseRepository['findByTestRun']>(),
    findRecentByFullName: jest.fn<TestCaseRepository['findRecentByFullName']>(),
  };

  return { runRepo, runCreate, caseRepo, caseCreateMany };
}

function makeAdapter(parsed: ParsedTestRun): IngestionAdapter {
  return { parse: jest.fn(() => parsed) };
}

function sampleRun(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    sourceType: 'api',
    status: 'SUCCESS',
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    metadata: {},
    ingestedAt: FROZEN_NOW,
    ...overrides,
  };
}

describe('ingestTestRun', () => {
  it('persists the run and cases atomically and returns { runId, testCaseCount }', async () => {
    const client = makeStubClient();
    const pool = makeStubPool(client);
    const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();

    const created = sampleRun({
      id: 'run-1',
      totalTests: 3,
      passedTests: 3,
    });
    runCreate.mockResolvedValue(created);
    caseCreateMany.mockResolvedValue();

    const adapter = makeAdapter({
      metadata: {},
      cases: [
        {
          testName: 't1',
          fullName: 't1',
          status: 'PASSED',
          retryCount: 0,
          metadata: {},
        },
        {
          testName: 't2',
          fullName: 't2',
          status: 'PASSED',
          retryCount: 0,
          metadata: {},
        },
        {
          testName: 't3',
          fullName: 't3',
          status: 'PASSED',
          retryCount: 0,
          metadata: {},
        },
      ],
    });

    const result = await ingestTestRun(pool, runRepo, caseRepo, adapter, {
      projectId: 'p-1',
      sourceType: 'api',
      raw: { kind: 'json', body: {} },
    });

    expect(result).toEqual({ runId: 'run-1', testCaseCount: 3 });
    expect(runCreate).toHaveBeenCalledTimes(1);
    expect(caseCreateMany).toHaveBeenCalledTimes(1);
  });

  describe('derived run fields', () => {
    it('counts PASSED/FAILED/SKIPPED and sets status = FAILED when any failed', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
          {
            testName: 'b',
            fullName: 'b',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
          {
            testName: 'c',
            fullName: 'c',
            status: 'FAILED',
            retryCount: 0,
            metadata: {},
          },
          {
            testName: 'd',
            fullName: 'd',
            status: 'SKIPPED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-1',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.totalTests).toBe(4);
      expect(callArg.passedTests).toBe(2);
      expect(callArg.failedTests).toBe(1);
      expect(callArg.skippedTests).toBe(1);
      expect(callArg.status).toBe('FAILED');
    });

    it('counts ERROR toward failedTests', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'ERROR',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-1',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.failedTests).toBe(1);
      expect(callArg.status).toBe('FAILED');
    });

    it('sets status = PARTIAL when only skipped cases are present', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 's1',
            fullName: 's1',
            status: 'SKIPPED',
            retryCount: 0,
            metadata: {},
          },
          {
            testName: 's2',
            fullName: 's2',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-1',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.status).toBe('PARTIAL');
    });

    it('sets status = SUCCESS when all cases are PASSED', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'p',
            fullName: 'p',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-1',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.status).toBe('SUCCESS');
    });
  });

  describe('field injection from input', () => {
    it('uses projectId and sourceType from input, not from adapter output', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'project-from-input',
        sourceType: 'junit_xml',
        raw: { kind: 'json', body: {} },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.projectId).toBe('project-from-input');
      expect(callArg.sourceType).toBe('junit_xml');
    });

    it('attaches projectId and the created testRunId to every case', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();
      runCreate.mockResolvedValue(sampleRun({ id: 'created-run' }));

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
          {
            testName: 'b',
            fullName: 'b',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-xyz',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      const caseInputs = caseCreateMany.mock.calls[0][0];
      expect(caseInputs).toHaveLength(2);
      for (const ci of caseInputs) {
        expect(ci.projectId).toBe('p-xyz');
        expect(ci.testRunId).toBe('created-run');
      }
    });
  });

  describe('overrides merging', () => {
    it('uses overrides.branch when supplied', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({ metadata: {}, cases: [] });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-1',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
        overrides: { branch: 'release-1.0' },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.branch).toBe('release-1.0');
    });

    it('uses overrides.environment when supplied', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({ metadata: {}, cases: [] });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p-1',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
        overrides: { environment: 'staging' },
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.environment).toBe('staging');
    });

    it('does not allow overrides to override projectId — input.projectId wins', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({ metadata: {}, cases: [] });

      const evilInput = {
        projectId: 'p-from-input',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
        overrides: { branch: 'main', projectId: 'p-from-override' },
      } as unknown as Parameters<typeof ingestTestRun>[4];

      await ingestTestRun(pool, runRepo, caseRepo, adapter, evilInput);

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.projectId).toBe('p-from-input');
      expect(callArg.branch).toBe('main');
    });

    it('does not allow overrides to override status — derived status wins', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'FAILED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      const evilInput = {
        projectId: 'p',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
        overrides: { status: 'SUCCESS' },
      } as unknown as Parameters<typeof ingestTestRun>[4];

      await ingestTestRun(pool, runRepo, caseRepo, adapter, evilInput);

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.status).toBe('FAILED');
    });

    it('empty overrides preserves parsed branch and environment', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        branch: 'from-parsed',
        environment: 'ci',
        cases: [],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
        overrides: {},
      });

      const callArg = runCreate.mock.calls[0][0];
      expect(callArg.branch).toBe('from-parsed');
      expect(callArg.environment).toBe('ci');
    });
  });

  describe('transactional persistence', () => {
    it('passes the same TxClient to both runRepo.create and caseRepo.createMany', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      const runClient = runCreate.mock.calls[0][1];
      const caseClient = caseCreateMany.mock.calls[0][1];
      expect(runClient).toBeDefined();
      expect(runClient).toBe(caseClient);
    });

    it('opens exactly one transaction (pool.connect called once)', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo } = makeRepos();
      runCreate.mockResolvedValue(sampleRun());

      const adapter = makeAdapter({ metadata: {}, cases: [] });

      await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      expect(pool.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty cases', () => {
    it('returns testCaseCount: 0 and calls createMany with an empty array', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();
      runCreate.mockResolvedValue(sampleRun({ id: 'empty-run' }));

      const adapter = makeAdapter({ metadata: {}, cases: [] });

      const result = await ingestTestRun(pool, runRepo, caseRepo, adapter, {
        projectId: 'p',
        sourceType: 'api',
        raw: { kind: 'json', body: {} },
      });

      expect(result).toEqual({ runId: 'empty-run', testCaseCount: 0 });
      expect(caseCreateMany).toHaveBeenCalledTimes(1);
      expect(caseCreateMany.mock.calls[0][0]).toEqual([]);
    });
  });

  describe('error propagation', () => {
    it('propagates IngestionFailedError from adapter.parse without calling repos', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();

      const adapter: IngestionAdapter = {
        parse: jest.fn(() => {
          throw new IngestionFailedError('boom');
        }),
      };

      await expect(
        ingestTestRun(pool, runRepo, caseRepo, adapter, {
          projectId: 'p',
          sourceType: 'api',
          raw: { kind: 'json', body: {} },
        }),
      ).rejects.toBeInstanceOf(IngestionFailedError);

      expect(runCreate).not.toHaveBeenCalled();
      expect(caseCreateMany).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('propagates ForeignKeyError from runRepo.create unchanged', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();

      const fkError = new ForeignKeyError(
        'test_runs_project_id_fkey',
        'Key (project_id)=(p) is not present in table "projects".',
      );
      runCreate.mockRejectedValue(fkError);

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await expect(
        ingestTestRun(pool, runRepo, caseRepo, adapter, {
          projectId: 'p',
          sourceType: 'api',
          raw: { kind: 'json', body: {} },
        }),
      ).rejects.toBe(fkError);

      expect(caseCreateMany).not.toHaveBeenCalled();
    });

    it('propagates errors from caseRepo.createMany unchanged', async () => {
      const client = makeStubClient();
      const pool = makeStubPool(client);
      const { runRepo, runCreate, caseRepo, caseCreateMany } = makeRepos();

      runCreate.mockResolvedValue(sampleRun());
      const dbError = new UniqueConstraintError('test_case_results_pkey', 'some constraint');
      caseCreateMany.mockRejectedValue(dbError);

      const adapter = makeAdapter({
        metadata: {},
        cases: [
          {
            testName: 'a',
            fullName: 'a',
            status: 'PASSED',
            retryCount: 0,
            metadata: {},
          },
        ],
      });

      await expect(
        ingestTestRun(pool, runRepo, caseRepo, adapter, {
          projectId: 'p',
          sourceType: 'api',
          raw: { kind: 'json', body: {} },
        }),
      ).rejects.toBe(dbError);
    });
  });
});
