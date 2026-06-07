import createError from 'http-errors';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type { ListRunsQuery, ListRunsResponse } from '../../http/schemas/test-run.js';
import { toRunResponse } from './run-mappers.js';

export async function listRuns(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  input: ListRunsQuery & { projectId: string },
): Promise<ListRunsResponse> {
  const project = await projectRepo.findById(input.projectId);
  if (!project) throw createError(404, 'Project not found');

  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const offset = (page - 1) * limit;

  const { items, total } = await runRepo.listByProject(input.projectId, {
    limit,
    offset,
    branch: input.branch,
    environment: input.environment,
    status: input.status,
  });

  return {
    items: items.map(toRunResponse),
    total,
    page,
    limit,
  };
}
