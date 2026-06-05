import { describe, it, expect, jest } from '@jest/globals';
import { getProject } from '../../../../src/application/use-cases/get-project.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';

const sampleProject: Project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'my-service',
  name: 'My Service',
  description: 'A test project',
  createdAt: new Date('2026-06-05T12:00:00.000Z'),
  updatedAt: new Date('2026-06-05T12:00:00.000Z'),
};

function makeRepo() {
  const create = jest.fn<ProjectRepository['create']>();
  const findById = jest.fn<ProjectRepository['findById']>();
  const findBySlug = jest.fn<ProjectRepository['findBySlug']>();
  const list = jest.fn<ProjectRepository['list']>();
  const repo: ProjectRepository = { create, findById, findBySlug, list };
  return { repo, findById };
}

describe('getProject', () => {
  it('returns the Project entity when repo.findById finds it', async () => {
    const { repo, findById } = makeRepo();
    findById.mockResolvedValue(sampleProject);

    const result = await getProject(repo, sampleProject.id);

    expect(result).toBe(sampleProject);
  });

  it('forwards the requested id to repo.findById', async () => {
    const { repo, findById } = makeRepo();
    findById.mockResolvedValue(sampleProject);

    await getProject(repo, '22222222-2222-2222-2222-222222222222');

    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('throws a 404 error when repo.findById returns null', async () => {
    const { repo, findById } = makeRepo();
    findById.mockResolvedValue(null);

    await expect(getProject(repo, '33333333-3333-3333-3333-333333333333')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
  });

  it('propagates infrastructure errors from repo.findById unchanged', async () => {
    const { repo, findById } = makeRepo();
    const infraError = new Error('connection lost');
    findById.mockRejectedValue(infraError);

    await expect(getProject(repo, '44444444-4444-4444-4444-444444444444')).rejects.toBe(infraError);
  });
});
