import { describe, it, expect, jest } from '@jest/globals';
import { listRuns } from '../../../../src/application/use-cases/list-runs.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { TestRunRepository } from '../../../../src/domain/ports/test-run.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';
import type { TestRun } from '../../../../src/domain/entities/test-run.js';

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
  const listByProject = jest.fn<TestRunRepository['listByProject']>();
  const repo: TestRunRepository = {
    create: jest.fn<TestRunRepository['create']>(),
    findById: jest.fn<TestRunRepository['findById']>(),
    listByProject,
    findMostRecentByProject: jest.fn<TestRunRepository['findMostRecentByProject']>(),
    countByProject: jest.fn<TestRunRepository['countByProject']>(),
    findFailureTrend: jest.fn<TestRunRepository['findFailureTrend']>(),
  };
  return { repo, listByProject };
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
    totalTests: 5,
    passedTests: 5,
    failedTests: 0,
    skippedTests: 0,
    metadata: {},
    ingestedAt: FROZEN,
    ...overrides,
  };
}

describe('listRuns', () => {
  it('returns mapped items, total, page, limit on happy path', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, listByProject } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue({
      items: [sampleRun({ id: 'r-1' }), sampleRun({ id: 'r-2', status: 'FAILED' })],
      total: 2,
    });

    const result = await listRuns(projectRepo, runRepo, {
      projectId: 'p-1',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.items[0]).toMatchObject({
      id: 'r-1',
      status: 'SUCCESS',
      ingestedAt: '2026-06-05T12:00:00.000Z',
    });
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, listByProject } = makeRunRepo();
    projectFindById.mockResolvedValue(null);

    await expect(listRuns(projectRepo, runRepo, { projectId: 'p-missing' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(listByProject).not.toHaveBeenCalled();
  });

  it('translates page=2, limit=10 to offset=10', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, listByProject } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue({ items: [], total: 0 });

    await listRuns(projectRepo, runRepo, {
      projectId: 'p-1',
      page: 2,
      limit: 10,
    });

    expect(listByProject).toHaveBeenCalledWith('p-1', {
      limit: 10,
      offset: 10,
      branch: undefined,
      environment: undefined,
      status: undefined,
    });
  });

  it('applies defaults page=1, limit=20 when input omits them', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, listByProject } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue({ items: [], total: 0 });

    const result = await listRuns(projectRepo, runRepo, { projectId: 'p-1' });

    expect(listByProject).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('forwards branch, environment, status filters to runRepo.listByProject', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, listByProject } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue({ items: [], total: 0 });

    await listRuns(projectRepo, runRepo, {
      projectId: 'p-1',
      branch: 'main',
      environment: 'ci',
      status: 'FAILED',
    });

    expect(listByProject).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({
        branch: 'main',
        environment: 'ci',
        status: 'FAILED',
      }),
    );
  });
});
