import { describe, it, expect, jest } from '@jest/globals';
import { getFailurePatterns } from '../../../../src/application/use-cases/get-failure-patterns.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { FailurePatternRepository } from '../../../../src/domain/ports/failure-pattern.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';
import type { FailurePattern } from '../../../../src/domain/entities/failure-pattern.js';

const FROZEN_FIRST = new Date('2026-05-10T08:00:00.000Z');
const FROZEN_LAST = new Date('2026-06-01T12:00:00.000Z');
const FROZEN_PROJECT = new Date('2026-06-05T12:00:00.000Z');

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

function makePatternRepo() {
  const listByProject = jest.fn<FailurePatternRepository['listByProject']>();
  const upsertByPattern = jest.fn<FailurePatternRepository['upsertByPattern']>();
  const repo: FailurePatternRepository = { listByProject, upsertByPattern };
  return { repo, listByProject, upsertByPattern };
}

function sampleProject(): Project {
  return {
    id: 'p-1',
    slug: 'svc',
    name: 'Svc',
    createdAt: FROZEN_PROJECT,
    updatedAt: FROZEN_PROJECT,
  };
}

function pattern(overrides: Partial<FailurePattern> = {}): FailurePattern {
  return {
    id: 'pat-1',
    projectId: 'p-1',
    pattern: 'TimeoutError',
    severity: 'HIGH',
    firstSeenAt: FROZEN_FIRST,
    lastSeenAt: FROZEN_LAST,
    occurrenceCount: 5,
    ...overrides,
  };
}

describe('getFailurePatterns', () => {
  it('maps patterns to FailurePatternItem[] on happy path', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: patternRepo, listByProject } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue([
      pattern({ id: 'p-1', pattern: 'TimeoutError', category: 'timeout' }),
      pattern({ id: 'p-2', pattern: 'AssertionError', category: undefined }),
    ]);

    const result = await getFailurePatterns(projectRepo, patternRepo, {
      projectId: 'p-1',
      limit: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: 'p-1',
      pattern: 'TimeoutError',
      category: 'timeout',
      severity: 'HIGH',
      occurrenceCount: 5,
      firstSeenAt: '2026-05-10T08:00:00.000Z',
      lastSeenAt: '2026-06-01T12:00:00.000Z',
    });
    // Second item has no category
    expect('category' in result.items[1]).toBe(false);
  });

  it('returns { items: [] } when no patterns exist', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: patternRepo, listByProject } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue([]);

    const result = await getFailurePatterns(projectRepo, patternRepo, {
      projectId: 'p-1',
      limit: 50,
    });

    expect(result).toEqual({ items: [] });
  });

  it('forwards limit to the repository', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: patternRepo, listByProject } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    listByProject.mockResolvedValue([]);

    await getFailurePatterns(projectRepo, patternRepo, {
      projectId: 'p-1',
      limit: 10,
    });

    expect(listByProject).toHaveBeenCalledWith('p-1', { limit: 10 });
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: patternRepo, listByProject } = makePatternRepo();
    findById.mockResolvedValue(null);

    await expect(
      getFailurePatterns(projectRepo, patternRepo, {
        projectId: 'p-missing',
        limit: 50,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(listByProject).not.toHaveBeenCalled();
  });
});
