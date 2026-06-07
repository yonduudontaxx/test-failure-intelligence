import { describe, it, expect, jest } from '@jest/globals';
import { getRun } from '../../../../src/application/use-cases/get-run.js';
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

describe('getRun', () => {
  it('returns RunResponse on happy path', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(sampleRun({ id: 'r-1' }));

    const result = await getRun(projectRepo, runRepo, 'p-1', 'r-1');
    expect(result.id).toBe('r-1');
    expect(result.projectId).toBe('p-1');
    expect(result.ingestedAt).toBe('2026-06-05T12:00:00.000Z');
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    projectFindById.mockResolvedValue(null);

    await expect(getRun(projectRepo, runRepo, 'p-missing', 'r-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(runFindById).not.toHaveBeenCalled();
  });

  it('throws 404 Run not found when runRepo.findById returns null', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(null);

    await expect(getRun(projectRepo, runRepo, 'p-1', 'r-missing')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Run not found',
    });
  });

  it('throws 404 Run not found when the run belongs to a different project', async () => {
    const { repo: projectRepo, findById: projectFindById } = makeProjectRepo();
    const { repo: runRepo, findById: runFindById } = makeRunRepo();
    projectFindById.mockResolvedValue(sampleProject());
    runFindById.mockResolvedValue(sampleRun({ projectId: 'other-project' }));

    await expect(getRun(projectRepo, runRepo, 'p-1', 'r-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Run not found',
    });
  });
});
