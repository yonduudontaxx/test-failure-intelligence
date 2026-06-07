import createError from 'http-errors';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type { RunResponse } from '../../http/schemas/test-run.js';
import { toRunResponse } from './run-mappers.js';

export async function getRun(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  projectId: string,
  runId: string,
): Promise<RunResponse> {
  const project = await projectRepo.findById(projectId);
  if (!project) throw createError(404, 'Project not found');

  const run = await runRepo.findById(runId);
  if (!run || run.projectId !== projectId) {
    throw createError(404, 'Run not found');
  }

  return toRunResponse(run);
}
