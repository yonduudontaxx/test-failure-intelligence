import createError from 'http-errors';
import type { TestCaseStatus } from '../../domain/enums/test-case-status.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type {
  ReliabilitySummary,
  TestCaseRepository,
} from '../../domain/ports/test-case.repository.js';
import { classifyReliability } from '../../domain/services/reliability-classifier.js';
import type { FlakyTestItem, FlakyTestsResponse } from '../../http/schemas/analytics.js';

function synthesizeStatuses(summary: ReliabilitySummary): TestCaseStatus[] {
  const arr: TestCaseStatus[] = [];
  for (let i = 0; i < summary.passCount; i += 1) arr.push('PASSED');
  for (let i = 0; i < summary.failCount; i += 1) arr.push('FAILED');
  return arr;
}

function toFlakyItem(summary: ReliabilitySummary, state: 'FLAKY' | 'BROKEN'): FlakyTestItem {
  return {
    fullName: summary.fullName,
    reliabilityState: state,
    passCount: summary.passCount,
    failCount: summary.failCount,
    runCount: summary.passCount + summary.failCount + summary.skippedCount,
    lastSeenAt: summary.lastExecutedAt ? summary.lastExecutedAt.toISOString() : '',
  };
}

export async function getFlakyTests(
  projectRepo: ProjectRepository,
  caseRepo: TestCaseRepository,
  input: { projectId: string; days: number; limit: number },
): Promise<FlakyTestsResponse> {
  const project = await projectRepo.findById(input.projectId);
  if (!project) throw createError(404, 'Project not found');

  const summaries = await caseRepo.computeReliabilitySummaries(input.projectId, {
    days: input.days,
  });

  const flakyOrBroken: { summary: ReliabilitySummary; state: 'FLAKY' | 'BROKEN' }[] = [];
  for (const summary of summaries) {
    const state = classifyReliability(synthesizeStatuses(summary));
    if (state === 'FLAKY' || state === 'BROKEN') {
      flakyOrBroken.push({ summary, state });
    }
  }

  flakyOrBroken.sort((a, b) => b.summary.failCount - a.summary.failCount);

  const total = flakyOrBroken.length;
  const items = flakyOrBroken
    .slice(0, input.limit)
    .map(({ summary, state }) => toFlakyItem(summary, state));

  return { items, total };
}
