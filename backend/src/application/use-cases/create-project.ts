import type { Project } from '../../domain/entities/project.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { CreateProjectBody } from '../../http/schemas/project.js';

export async function createProject(
  repo: ProjectRepository,
  input: CreateProjectBody,
): Promise<Project> {
  return repo.create(input);
}
