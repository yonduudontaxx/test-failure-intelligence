import createError from 'http-errors';
import type { Project } from '../../domain/entities/project.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';

export async function getProject(repo: ProjectRepository, id: string): Promise<Project> {
  const project = await repo.findById(id);
  if (project === null) {
    throw createError(404, 'Project not found');
  }
  return project;
}
