import createError from 'http-errors';
import type { TestCaseStatus } from '../../domain/enums/test-case-status.js';
import type { FailurePattern } from '../../domain/entities/failure-pattern.js';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type {
  ReliabilitySummary,
  TestCaseRepository,
} from '../../domain/ports/test-case.repository.js';
import type { FailurePatternRepository } from '../../domain/ports/failure-pattern.repository.js';
import { classifyReliability } from '../../domain/services/reliability-classifier.js';
import { evaluateHealth } from '../../domain/services/health-evaluator.js';
import type {
  FlakyTestItem,
  OverviewResponse,
  TopFailurePatternItem,
} from '../../http/schemas/analytics.js';

const DEFAULT_DAYS = 30;
const TOP_FLAKY_LIMIT = 5;
const TOP_PATTERNS_LIMIT = 5;

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

function toTopFailurePatternItem(p: FailurePattern): TopFailurePatternItem {
  return {
    pattern: p.pattern,
    severity: p.severity,
    occurrenceCount: p.occurrenceCount,
  };
}

export async function getProjectOverview(
  projectRepo: ProjectRepository,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  patternRepo: FailurePatternRepository,
  input: { projectId: string; days?: number },
): Promise<OverviewResponse> {
  const project = await projectRepo.findById(input.projectId);
  if (!project) throw createError(404, 'Project not found');

  const days = input.days ?? DEFAULT_DAYS;

  const [
    totalRuns,
    totalTestCases,
    passedTestCases,
    failedTestCases,
    skippedTestCases,
    trendBuckets,
    summaries,
    patterns,
  ] = await Promise.all([
    runRepo.countByProject(input.projectId),
    caseRepo.countByProject(input.projectId),
    caseRepo.countByStatus(input.projectId, 'PASSED'),
    caseRepo.countByStatus(input.projectId, 'FAILED'),
    caseRepo.countByStatus(input.projectId, 'SKIPPED'),
    runRepo.findFailureTrend(input.projectId, { days, bucketSize: 'day' }),
    caseRepo.computeReliabilitySummaries(input.projectId, { days }),
    patternRepo.listByProject(input.projectId, { limit: TOP_PATTERNS_LIMIT }),
  ]);

  let trendRuns = 0;
  let trendFailed = 0;
  for (const b of trendBuckets) {
    trendRuns += b.totalRuns;
    trendFailed += b.failedRuns;
  }
  const recentPassRate = trendRuns === 0 ? 1 : (trendRuns - trendFailed) / trendRuns;
  const recentFailureRate = 1 - recentPassRate;

  const flakyOrBroken: {
    summary: ReliabilitySummary;
    state: 'FLAKY' | 'BROKEN';
  }[] = [];
  let brokenTestCount = 0;
  let flakyTestCount = 0;
  for (const summary of summaries) {
    const state = classifyReliability(synthesizeStatuses(summary));
    if (state === 'BROKEN') {
      brokenTestCount += 1;
      flakyOrBroken.push({ summary, state });
    } else if (state === 'FLAKY') {
      flakyTestCount += 1;
      flakyOrBroken.push({ summary, state });
    }
  }
  flakyOrBroken.sort((a, b) => b.summary.failCount - a.summary.failCount);
  const topFlakyTests = flakyOrBroken
    .slice(0, TOP_FLAKY_LIMIT)
    .map(({ summary, state }) => toFlakyItem(summary, state));

  const healthStatus = evaluateHealth({
    totalRuns: trendRuns,
    recentFailureRate,
    brokenTestCount,
    flakyTestCount,
  });

  return {
    totalRuns,
    totalTestCases,
    passedTestCases,
    failedTestCases,
    skippedTestCases,
    recentPassRate,
    healthStatus,
    topFlakyTests,
    topFailurePatterns: patterns.map(toTopFailurePatternItem),
  };
}
