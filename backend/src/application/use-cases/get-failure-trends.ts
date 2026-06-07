import createError from 'http-errors';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type {
  DailyFailureBucket,
  TestRunRepository,
} from '../../domain/ports/test-run.repository.js';
import type { FailureTrendItem, FailureTrendsResponse } from '../../http/schemas/analytics.js';

function toFailureTrendItem(bucket: DailyFailureBucket): FailureTrendItem {
  return {
    date: bucket.date,
    totalRuns: bucket.totalRuns,
    failedRuns: bucket.failedRuns,
    passRate: bucket.passRate,
  };
}

export async function getFailureTrends(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  input: { projectId: string; days: number; bucketSize: 'day' | 'week' },
): Promise<FailureTrendsResponse> {
  const project = await projectRepo.findById(input.projectId);
  if (!project) throw createError(404, 'Project not found');

  const buckets = await runRepo.findFailureTrend(input.projectId, {
    days: input.days,
    bucketSize: input.bucketSize,
  });

  return { items: buckets.map(toFailureTrendItem) };
}
