import { describe, it, expect, jest } from '@jest/globals';
import { createProject } from '../../../../src/application/use-cases/create-project.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';
import { UniqueConstraintError } from '../../../../src/domain/errors/index.js';

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
  return { repo, create };
}

describe('createProject', () => {
  it('returns the Project entity from repo.create', async () => {
    const { repo, create } = makeRepo();
    create.mockResolvedValue(sampleProject);

    const result = await createProject(repo, {
      name: 'My Service',
      slug: 'my-service',
      description: 'A test project',
    });

    expect(result).toBe(sampleProject);
  });

  it('passes name, slug, and description through to repo.create unchanged', async () => {
    const { repo, create } = makeRepo();
    create.mockResolvedValue(sampleProject);
    const input = {
      name: 'Hello World',
      slug: 'hello-world',
      description: 'A descriptive description',
    };

    await createProject(repo, input);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(input);
  });

  it('omits description from the repo.create payload when not provided', async () => {
    const { repo, create } = makeRepo();
    create.mockResolvedValue({ ...sampleProject, description: undefined });
    const input = { name: 'No Description', slug: 'no-description' };

    await createProject(repo, input);

    expect(create).toHaveBeenCalledTimes(1);
    const callArg = create.mock.calls[0][0];
    expect(callArg).toEqual(input);
    expect('description' in callArg).toBe(false);
  });

  it('propagates UniqueConstraintError from repo.create without wrapping', async () => {
    const { repo, create } = makeRepo();
    const error = new UniqueConstraintError(
      'projects_slug_key',
      'Key (slug)=(taken) already exists.',
    );
    create.mockRejectedValue(error);

    await expect(createProject(repo, { name: 'Taken', slug: 'taken' })).rejects.toBe(error);
  });
});
