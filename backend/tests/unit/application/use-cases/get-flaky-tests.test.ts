import { describe, it, expect, jest } from '@jest/globals';
import { getFlakyTests } from '../../../../src/application/use-cases/get-flaky-tests.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type {
  ReliabilitySummary,
  TestCaseRepository,
} from '../../../../src/domain/ports/test-case.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';

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

function makeCaseRepo() {
  const computeReliabilitySummaries = jest.fn<TestCaseRepository['computeReliabilitySummaries']>();
  const repo: TestCaseRepository = {
    createMany: jest.fn<TestCaseRepository['createMany']>(),
    findByTestRun: jest.fn<TestCaseRepository['findByTestRun']>(),
    findRecentByFullName: jest.fn<TestCaseRepository['findRecentByFullName']>(),
    countByProject: jest.fn<TestCaseRepository['countByProject']>(),
    countByStatus: jest.fn<TestCaseRepository['countByStatus']>(),
    computeReliabilitySummaries,
  };
  return { repo, computeReliabilitySummaries };
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

function summary(overrides: Partial<ReliabilitySummary> = {}): ReliabilitySummary {
  return {
    fullName: 'Suite > test',
    suiteName: 'Suite',
    testName: 'test',
    passCount: 0,
    failCount: 0,
    skippedCount: 0,
    lastStatus: 'PASSED',
    lastExecutedAt: FROZEN,
    ...overrides,
  };
}

describe('getFlakyTests', () => {
  it('returns FLAKY and BROKEN items, excludes STABLE', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'stable', passCount: 10, failCount: 0 }),
      summary({ fullName: 'flaky', passCount: 6, failCount: 4 }),
      summary({ fullName: 'broken', passCount: 0, failCount: 5 }),
    ]);

    const result = await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 30,
      limit: 20,
    });

    expect(result.items.map((i) => i.fullName).sort()).toEqual(['broken', 'flaky']);
    expect(result.total).toBe(2);
  });

  it('classifies states correctly (FLAKY for mixed, BROKEN for all failed)', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'flaky', passCount: 3, failCount: 2 }),
      summary({ fullName: 'broken', passCount: 0, failCount: 7 }),
    ]);

    const result = await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 30,
      limit: 20,
    });

    const byFullName = Object.fromEntries(
      result.items.map((i) => [i.fullName, i.reliabilityState]),
    );
    expect(byFullName.flaky).toBe('FLAKY');
    expect(byFullName.broken).toBe('BROKEN');
  });

  it('sorts by failCount DESC (most failing first)', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'low', passCount: 9, failCount: 1 }),
      summary({ fullName: 'high', passCount: 1, failCount: 9 }),
      summary({ fullName: 'medium', passCount: 5, failCount: 5 }),
    ]);

    const result = await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 30,
      limit: 20,
    });

    expect(result.items.map((i) => i.fullName)).toEqual(['high', 'medium', 'low']);
  });

  it('applies limit while total reflects pre-limit count', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 't1', passCount: 1, failCount: 5 }),
      summary({ fullName: 't2', passCount: 1, failCount: 4 }),
      summary({ fullName: 't3', passCount: 1, failCount: 3 }),
      summary({ fullName: 't4', passCount: 1, failCount: 2 }),
      summary({ fullName: 't5', passCount: 1, failCount: 1 }),
    ]);

    const result = await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 30,
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(5);
    expect(result.items.map((i) => i.fullName)).toEqual(['t1', 't2', 't3']);
  });

  it('computes runCount as passCount + failCount + skippedCount', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([
      summary({
        fullName: 'flaky',
        passCount: 3,
        failCount: 2,
        skippedCount: 4,
      }),
    ]);

    const result = await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 30,
      limit: 20,
    });

    expect(result.items[0].runCount).toBe(9);
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(null);

    await expect(
      getFlakyTests(projectRepo, caseRepo, {
        projectId: 'p-missing',
        days: 30,
        limit: 20,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(computeReliabilitySummaries).not.toHaveBeenCalled();
  });

  it('returns empty result when no summaries exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([]);

    const result = await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 30,
      limit: 20,
    });

    expect(result).toEqual({ items: [], total: 0 });
  });

  it('forwards the days argument to computeReliabilitySummaries', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    projectFindById.mockResolvedValue(sampleProject());
    computeReliabilitySummaries.mockResolvedValue([]);

    await getFlakyTests(projectRepo, caseRepo, {
      projectId: 'p-1',
      days: 7,
      limit: 20,
    });

    expect(computeReliabilitySummaries).toHaveBeenCalledWith('p-1', {
      days: 7,
    });
  });
});
