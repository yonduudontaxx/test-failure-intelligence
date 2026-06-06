import createError from 'http-errors';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type { TestCaseRepository } from '../../domain/ports/test-case.repository.js';
import type { CaseResponse, RunCasesQuery } from '../../http/schemas/test-run.js';
import { toCaseResponse } from './run-mappers.js';

export async function getRunCases(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  projectId: string,
  runId: string,
  query: RunCasesQuery,
): Promise<CaseResponse[]> {
  const project = await projectRepo.findById(projectId);
  if (!project) throw createError(404, 'Project not found');

  const run = await runRepo.findById(runId);
  if (!run || run.projectId !== projectId) {
    throw createError(404, 'Run not found');
  }

  const allCases = await caseRepo.findByTestRun(runId);
  const filtered =
    query.status === undefined ? allCases : allCases.filter((c) => c.status === query.status);

  return filtered.map(toCaseResponse);
}
