import { describe, it, expect, jest } from '@jest/globals';
import { getRunCases } from '../../../../src/application/use-cases/get-run-cases.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { TestRunRepository } from '../../../../src/domain/ports/test-run.repository.js';
import type { TestCaseRepository } from '../../../../src/domain/ports/test-case.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';
import type { TestRun } from '../../../../src/domain/entities/test-run.js';
import type { TestCaseResult } from '../../../../src/domain/entities/test-case-result.js';

const FROZEN = new Date('2026-06-05T12:00:00.000Z');

function makeProjectRepo() {
  const findById = jest.fn<ProjectRepository['findById']>();
  const repo: ProjectRepository = {
    create: jest.fn<ProjectRepository['create']>(),
    findById,
    findBySlug: jest.fn<ProjectRepository['findBySlug']>(),
    list: jest.fn<ProjectRepository['list']>(),
  };
  return { repo, findById };
}

function makeRunRepo() {
  const findById = jest.fn<TestRunRepository['findById']>();
  const repo: TestRunRepository = {
    create: jest.fn<TestRunRepository['create']>(),
    findById,
    listByProject: jest.fn<TestRunRepository['listByProject']>(),
    findMostRecentByProject: jest.fn<TestRunRepository['findMostRecentByProject']>(),
    countByProject: jest.fn<TestRunRepository['countByProject']>(),
    findFailureTrend: jest.fn<TestRunRepository['findFailureTrend']>(),
  };
  return { repo, findById };
}

function makeCaseRepo() {
  const findByTestRun = jest.fn<TestCaseRepository['findByTestRun']>();
  const repo: TestCaseRepository = {
    createMany: jest.fn<TestCaseRepository['createMany']>(),
    findByTestRun,
    findRecentByFullName: jest.fn<TestCaseRepository['findRecentByFullName']>(),
    countByProject: jest.fn<TestCaseRepository['countByProject']>(),
    countByStatus: jest.fn<TestCaseRepository['countByStatus']>(),
    computeReliabilitySummaries: jest.fn<TestCaseRepository['computeReliabilitySummaries']>(),
  };
  return { repo, findByTestRun };
}

function sampleProject(): Project {
  return {
    id: 'p-1',
    slug: 'svc',
    name: 'Svc',
    createdAt: FROZEN,
    updatedAt: FROZEN,
  };
}

function sampleRun(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: 'r-1',
    projectId: 'p-1',
    sourceType: 'api',
    status: 'SUCCESS',
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    metadata: {},
    ingestedAt: FROZEN,
    ...overrides,
  };
}

function sampleCase(overrides: Partial<TestCaseResult> = {}): TestCaseResult {
  return {
    id: 'c-1',
    projectId: 'p-1',
    testRunId: 'r-1',
    testName: 'test',
    fullName: 'Suite > test',
    status: 'PASSED',
    retryCount: 0,
    metadata: {},
    ...overrides,
  };
}

describe('getRunCases', () => {
  it('returns mapped CaseResponse[] on happy path', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    const { repo: caseRepo, findByTestRun } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(sampleRun());
    findByTestRun.mockResolvedValue([
      sampleCase({ id: 'c-1', testName: 'a' }),
      sampleCase({ id: 'c-2', testName: 'b' }),
    ]);

    const result = await getRunCases(projectRepo, runRepo, caseRepo, 'p-1', 'r-1', {});

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'c-1',
      testName: 'a',
      fullName: 'Suite > test',
    });
    expect(findByTestRun).toHaveBeenCalledWith('r-1');
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo } = makeRunRepo();
    const { repo: caseRepo, findByTestRun } = makeCaseRepo();
    projectFindById.mockResolvedValue(null);

    await expect(
      getRunCases(projectRepo, runRepo, caseRepo, 'p-missing', 'r-1', {}),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(findByTestRun).not.toHaveBeenCalled();
  });

  it('throws 404 when the run is not found', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    const { repo: caseRepo, findByTestRun } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(null);

    await expect(
      getRunCases(projectRepo, runRepo, caseRepo, 'p-1', 'r-missing', {}),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Run not found',
    });
    expect(findByTestRun).not.toHaveBeenCalled();
  });

  it('throws 404 when the run belongs to a different project', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    const { repo: caseRepo } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(sampleRun({ projectId: 'other-project' }));

    await expect(
      getRunCases(projectRepo, runRepo, caseRepo, 'p-1', 'r-1', {}),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Run not found',
    });
  });

  it('filters by status when provided', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    const { repo: caseRepo, findByTestRun } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(sampleRun());
    findByTestRun.mockResolvedValue([
      sampleCase({ id: 'c-pass', status: 'PASSED' }),
      sampleCase({ id: 'c-fail', status: 'FAILED' }),
      sampleCase({ id: 'c-skip', status: 'SKIPPED' }),
    ]);

    const result = await getRunCases(projectRepo, runRepo, caseRepo, 'p-1', 'r-1', {
      status: 'FAILED',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c-fail');
  });

  it('returns all cases when query.status is omitted', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    const { repo: caseRepo, findByTestRun } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(sampleRun());
    findByTestRun.mockResolvedValue([
      sampleCase({ id: 'c-pass', status: 'PASSED' }),
      sampleCase({ id: 'c-fail', status: 'FAILED' }),
    ]);

    const result = await getRunCases(projectRepo, runRepo, caseRepo, 'p-1', 'r-1', {});
    expect(result).toHaveLength(2);
  });
});
