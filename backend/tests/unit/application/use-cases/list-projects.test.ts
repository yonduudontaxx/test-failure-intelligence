import { describe, it, expect, jest } from '@jest/globals';
import { listProjects } from '../../../../src/application/use-cases/list-projects.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';

const sampleProject: Project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'my-service',
  name: 'My Service',
  description: 'A test project',
  createdAt: new Date('2026-06-05T12:00:00.000Z'),
  updatedAt: new Date('2026-06-05T13:00:00.000Z'),
};

function makeRepo() {
  const create = jest.fn<ProjectRepository['create']>();
  const findById = jest.fn<ProjectRepository['findById']>();
  const findBySlug = jest.fn<ProjectRepository['findBySlug']>();
  const list = jest.fn<ProjectRepository['list']>();
  const repo: ProjectRepository = { create, findById, findBySlug, list };
  return { repo, list };
}

describe('listProjects', () => {
  it('returns mapped items, total, page, and limit (happy path)', async () => {
    const { repo, list } = makeRepo();
    list.mockResolvedValue({ items: [sampleProject], total: 1 });

    const result = await listProjects(repo, { page: 1, limit: 50 });

    expect(result).toEqual({
      items: [
        {
          id: sampleProject.id,
          slug: sampleProject.slug,
          name: sampleProject.name,
          description: sampleProject.description,
          createdAt: '2026-06-05T12:00:00.000Z',
          updatedAt: '2026-06-05T13:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
  });

  it('translates page=2, limit=10 into offset=10', async () => {
    const { repo, list } = makeRepo();
    list.mockResolvedValue({ items: [], total: 0 });

    await listProjects(repo, { page: 2, limit: 10 });

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ limit: 10, offset: 10 });
  });

  it('applies defaults (page=1, limit=50) when input is empty and computes offset=0', async () => {
    const { repo, list } = makeRepo();
    list.mockResolvedValue({ items: [], total: 0 });

    await listProjects(repo, {});

    expect(list).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });

  it('returns an empty payload when repo returns no items', async () => {
    const { repo, list } = makeRepo();
    list.mockResolvedValue({ items: [], total: 0 });

    const result = await listProjects(repo, {});

    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
  });

  it('serializes createdAt and updatedAt as ISO 8601 strings', async () => {
    const { repo, list } = makeRepo();
    list.mockResolvedValue({ items: [sampleProject], total: 1 });

    const result = await listProjects(repo, { page: 1, limit: 10 });

    expect(typeof result.items[0].createdAt).toBe('string');
    expect(result.items[0].createdAt).toBe('2026-06-05T12:00:00.000Z');
    expect(typeof result.items[0].updatedAt).toBe('string');
    expect(result.items[0].updatedAt).toBe('2026-06-05T13:00:00.000Z');
  });

  it('echoes back the requested page and limit', async () => {
    const { repo, list } = makeRepo();
    list.mockResolvedValue({ items: [], total: 0 });

    const result = await listProjects(repo, { page: 7, limit: 25 });

    expect(result.page).toBe(7);
    expect(result.limit).toBe(25);
  });

  it('propagates infrastructure errors from repo.list unchanged', async () => {
    const { repo, list } = makeRepo();
    const infraError = new Error('database unavailable');
    list.mockRejectedValue(infraError);

    await expect(listProjects(repo, { page: 1, limit: 50 })).rejects.toBe(infraError);
  });
});
