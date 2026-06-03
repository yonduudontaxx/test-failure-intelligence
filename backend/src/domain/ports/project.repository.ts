import type { Project, NewProject } from '../entities/project.js';

export interface ProjectRepository {
  /** @throws UniqueConstraintError when a project with the same slug already exists. */
  create(input: NewProject): Promise<Project>;

  findById(id: string): Promise<Project | null>;

  findBySlug(slug: string): Promise<Project | null>;

  list(opts: { limit: number; offset: number }): Promise<{ items: Project[]; total: number }>;
}
