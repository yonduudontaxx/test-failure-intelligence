import createError from 'http-errors';
import type { TestCaseStatus } from '../../domain/enums/test-case-status.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type {
  ReliabilitySummary,
  TestCaseRepository,
} from '../../domain/ports/test-case.repository.js';
import { classifyReliability } from '../../domain/services/reliability-classifier.js';
import { evaluateHealth } from '../../domain/services/health-evaluator.js';
import type { HealthResponse } from '../../http/schemas/analytics.js';

function synthesizeStatuses(summary: ReliabilitySummary): TestCaseStatus[] {
  const arr: TestCaseStatus[] = [];
  for (let i = 0; i < summary.passCount; i += 1) arr.push('PASSED');
  for (let i = 0; i < summary.failCount; i += 1) arr.push('FAILED');
  return arr;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function getProjectHealth(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  input: { projectId: string; days: number },
): Promise<HealthResponse> {
  const project = await projectRepo.findById(input.projectId);
  if (!project) throw createError(404, 'Project not found');

  const [trendBuckets, summaries] = await Promise.all([
    runRepo.findFailureTrend(input.projectId, {
      days: input.days,
      bucketSize: 'day',
    }),
    caseRepo.computeReliabilitySummaries(input.projectId, {
      days: input.days,
    }),
  ]);

  let totalRuns = 0;
  let totalFailedRuns = 0;
  for (const bucket of trendBuckets) {
    totalRuns += bucket.totalRuns;
    totalFailedRuns += bucket.failedRuns;
  }

  const recentFailureRate = totalRuns === 0 ? 0 : totalFailedRuns / totalRuns;

  let brokenTestCount = 0;
  let flakyTestCount = 0;
  for (const summary of summaries) {
    const state = classifyReliability(synthesizeStatuses(summary));
    if (state === 'BROKEN') brokenTestCount += 1;
    else if (state === 'FLAKY') flakyTestCount += 1;
  }

  const status = evaluateHealth({
    totalRuns,
    recentFailureRate,
    brokenTestCount,
    flakyTestCount,
  });

  return {
    status,
    totalRuns,
    passRate: round1((1 - recentFailureRate) * 100),
    failureRate: round1(recentFailureRate * 100),
    brokenTestCount,
    flakyTestCount,
    windowDays: input.days,
  };
}
