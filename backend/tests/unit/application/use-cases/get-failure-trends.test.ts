import { describe, it, expect, jest } from '@jest/globals';
import { getFailureTrends } from '../../../../src/application/use-cases/get-failure-trends.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { TestRunRepository } from '../../../../src/domain/ports/test-run.repository.js';
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

function makeRunRepo() {
  const findFailureTrend = jest.fn<TestRunRepository['findFailureTrend']>();
  const repo: TestRunRepository = {
    create: jest.fn<TestRunRepository['create']>(),
    findById: jest.fn<TestRunRepository['findById']>(),
    listByProject: jest.fn<TestRunRepository['listByProject']>(),
    findMostRecentByProject: jest.fn<TestRunRepository['findMostRecentByProject']>(),
    countByProject: jest.fn<TestRunRepository['countByProject']>(),
    findFailureTrend,
  };
  return { repo, findFailureTrend };
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

describe('getFailureTrends', () => {
  it('maps DailyFailureBucket[] to FailureTrendItem[] on happy path', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 5, failedRuns: 1, passRate: 0.8 },
      { date: '2026-06-02', totalRuns: 3, failedRuns: 2, passRate: 1 / 3 },
    ]);

    const result = await getFailureTrends(projectRepo, runRepo, {
      projectId: 'p-1',
      days: 30,
      bucketSize: 'day',
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      date: '2026-06-01',
      totalRuns: 5,
      failedRuns: 1,
      passRate: 0.8,
    });
    expect(result.items[1].date).toBe('2026-06-02');
  });

  it('returns { items: [] } when no buckets exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([]);

    const result = await getFailureTrends(projectRepo, runRepo, {
      projectId: 'p-1',
      days: 30,
      bucketSize: 'day',
    });

    expect(result).toEqual({ items: [] });
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    projectFindById.mockResolvedValue(null);

    await expect(
      getFailureTrends(projectRepo, runRepo, {
        projectId: 'p-missing',
        days: 30,
        bucketSize: 'day',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(findFailureTrend).not.toHaveBeenCalled();
  });

  it('forwards days and bucketSize to runRepo.findFailureTrend', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([]);

    await getFailureTrends(projectRepo, runRepo, {
      projectId: 'p-1',
      days: 7,
      bucketSize: 'week',
    });

    expect(findFailureTrend).toHaveBeenCalledWith('p-1', {
      days: 7,
      bucketSize: 'week',
    });
  });
});
