import type { Project } from '../../domain/entities/project.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type {
  ListProjectsQuery,
  ListProjectsResponse,
  ProjectResponse,
} from '../../http/schemas/project.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

export async function listProjects(
  repo: ProjectRepository,
  input: ListProjectsQuery,
): Promise<ListProjectsResponse> {
  const page = input.page ?? DEFAULT_PAGE;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  const result = await repo.list({ limit, offset });

  return {
    items: result.items.map(toProjectResponse),
    total: result.total,
    page,
    limit,
  };
}

function toProjectResponse(project: Project): ProjectResponse {
  const response: ProjectResponse = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
  if (project.description !== undefined) {
    response.description = project.description;
  }
  return response;
}
