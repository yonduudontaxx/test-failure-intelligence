import createError from 'http-errors';
import type { FailurePattern } from '../../domain/entities/failure-pattern.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { FailurePatternRepository } from '../../domain/ports/failure-pattern.repository.js';
import type { FailurePatternItem, FailurePatternsResponse } from '../../http/schemas/analytics.js';

function toFailurePatternItem(p: FailurePattern): FailurePatternItem {
  const item: FailurePatternItem = {
    id: p.id,
    pattern: p.pattern,
    severity: p.severity,
    occurrenceCount: p.occurrenceCount,
    firstSeenAt: p.firstSeenAt.toISOString(),
    lastSeenAt: p.lastSeenAt.toISOString(),
  };
  if (p.category !== undefined) item.category = p.category;
  return item;
}

export async function getFailurePatterns(
  projectRepo: ProjectRepository,
  patternRepo: FailurePatternRepository,
  input: { projectId: string; limit: number },
): Promise<FailurePatternsResponse> {
  const project = await projectRepo.findById(input.projectId);
  if (!project) throw createError(404, 'Project not found');

  const patterns = await patternRepo.listByProject(input.projectId, {
    limit: input.limit,
  });

  return { items: patterns.map(toFailurePatternItem) };
}
