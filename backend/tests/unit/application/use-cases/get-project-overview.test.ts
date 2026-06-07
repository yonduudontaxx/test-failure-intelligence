import { describe, it, expect, jest } from '@jest/globals';
import { getProjectOverview } from '../../../../src/application/use-cases/get-project-overview.js';
import type { ProjectRepository } from '../../../../src/domain/ports/project.repository.js';
import type { TestRunRepository } from '../../../../src/domain/ports/test-run.repository.js';
import type {
  ReliabilitySummary,
  TestCaseRepository,
} from '../../../../src/domain/ports/test-case.repository.js';
import type { FailurePatternRepository } from '../../../../src/domain/ports/failure-pattern.repository.js';
import type { Project } from '../../../../src/domain/entities/project.js';
import type { FailurePattern } from '../../../../src/domain/entities/failure-pattern.js';

const FROZEN = new Date('2026-06-05T12:00:00.000Z');

function makeProjectRepo() {
  const findById = jest.fn<ProjectRepository['findById']>();
  const repo: ProjectRepository = {
    create: jest.fn<ProjectRepository['create']>(),
    findById,
    findBySlug: jest.fn<ProjectRepository['findBySlug']>(),
    list: jest.fn<ProjectRepository['list']>(),
  };
  return { repo, findById };
}

function makeRunRepo() {
  const countByProject = jest.fn<TestRunRepository['countByProject']>();
  const findFailureTrend = jest.fn<TestRunRepository['findFailureTrend']>();
  const repo: TestRunRepository = {
    create: jest.fn<TestRunRepository['create']>(),
    findById: jest.fn<TestRunRepository['findById']>(),
    listByProject: jest.fn<TestRunRepository['listByProject']>(),
    findMostRecentByProject: jest.fn<TestRunRepository['findMostRecentByProject']>(),
    countByProject,
    findFailureTrend,
  };
  return { repo, countByProject, findFailureTrend };
}

function makeCaseRepo() {
  const countByProject = jest.fn<TestCaseRepository['countByProject']>();
  const countByStatus = jest.fn<TestCaseRepository['countByStatus']>();
  const computeReliabilitySummaries = jest.fn<TestCaseRepository['computeReliabilitySummaries']>();
  const repo: TestCaseRepository = {
    createMany: jest.fn<TestCaseRepository['createMany']>(),
    findByTestRun: jest.fn<TestCaseRepository['findByTestRun']>(),
    findRecentByFullName: jest.fn<TestCaseRepository['findRecentByFullName']>(),
    countByProject,
    countByStatus,
    computeReliabilitySummaries,
  };
  return { repo, countByProject, countByStatus, computeReliabilitySummaries };
}

function makePatternRepo() {
  const listByProject = jest.fn<FailurePatternRepository['listByProject']>();
  const upsertByPattern = jest.fn<FailurePatternRepository['upsertByPattern']>();
  const repo: FailurePatternRepository = { listByProject, upsertByPattern };
  return { repo, listByProject, upsertByPattern };
}

function sampleProject(): Project {
  return {
    id: 'p-1',
    slug: 'svc',
    name: 'Svc',
    createdAt: FROZEN,
    updatedAt: FROZEN,
  };
}

function summary(overrides: Partial<ReliabilitySummary> = {}): ReliabilitySummary {
  return {
    fullName: 't',
    suiteName: undefined,
    testName: 't',
    passCount: 0,
    failCount: 0,
    skippedCount: 0,
    lastStatus: 'PASSED',
    lastExecutedAt: FROZEN,
    ...overrides,
  };
}

describe('getProjectOverview', () => {
  it('returns OverviewResponse with all counts, rates, status, and lists', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
    const {
      repo: caseRepo,
      countByProject: caseCount,
      countByStatus,
      computeReliabilitySummaries,
    } = makeCaseRepo();
    const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

    findById.mockResolvedValue(sampleProject());
    runCount.mockResolvedValue(100);
    caseCount.mockResolvedValue(500);
    countByStatus.mockImplementation(async (_id, status) => {
      if (status === 'PASSED') return 450;
      if (status === 'FAILED') return 40;
      if (status === 'SKIPPED') return 10;
      return 0;
    });
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 10, failedRuns: 2, passRate: 0.8 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'flaky', passCount: 6, failCount: 4 }),
      summary({ fullName: 'broken', passCount: 0, failCount: 5 }),
    ]);
    patternList.mockResolvedValue([]);

    const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
    });

    expect(result.totalRuns).toBe(100);
    expect(result.totalTestCases).toBe(500);
    expect(result.passedTestCases).toBe(450);
    expect(result.failedTestCases).toBe(40);
    expect(result.skippedTestCases).toBe(10);
    expect(result.recentPassRate).toBeCloseTo(0.8, 5);
    expect(result.healthStatus).toBeDefined();
    expect(result.topFlakyTests).toHaveLength(2);
    expect(result.topFailurePatterns).toEqual([]);
  });

  it('returns zero counts, recentPassRate=1.0, HEALTHY when project is empty', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
    const {
      repo: caseRepo,
      countByProject: caseCount,
      countByStatus,
      computeReliabilitySummaries,
    } = makeCaseRepo();
    const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

    findById.mockResolvedValue(sampleProject());
    runCount.mockResolvedValue(0);
    caseCount.mockResolvedValue(0);
    countByStatus.mockResolvedValue(0);
    findFailureTrend.mockResolvedValue([]);
    computeReliabilitySummaries.mockResolvedValue([]);
    patternList.mockResolvedValue([]);

    const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
    });

    expect(result.totalRuns).toBe(0);
    expect(result.totalTestCases).toBe(0);
    expect(result.recentPassRate).toBe(1);
    expect(result.healthStatus).toBe('HEALTHY');
    expect(result.topFlakyTests).toEqual([]);
    expect(result.topFailurePatterns).toEqual([]);
  });

  it('limits topFlakyTests to 5 items, sorted by failCount DESC', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
    const {
      repo: caseRepo,
      countByProject: caseCount,
      countByStatus,
      computeReliabilitySummaries,
    } = makeCaseRepo();
    const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

    findById.mockResolvedValue(sampleProject());
    runCount.mockResolvedValue(0);
    caseCount.mockResolvedValue(0);
    countByStatus.mockResolvedValue(0);
    findFailureTrend.mockResolvedValue([]);
    // 7 flaky tests — top 5 should be returned
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 't1', passCount: 1, failCount: 1 }),
      summary({ fullName: 't2', passCount: 1, failCount: 2 }),
      summary({ fullName: 't3', passCount: 1, failCount: 3 }),
      summary({ fullName: 't4', passCount: 1, failCount: 4 }),
      summary({ fullName: 't5', passCount: 1, failCount: 5 }),
      summary({ fullName: 't6', passCount: 1, failCount: 6 }),
      summary({ fullName: 't7', passCount: 1, failCount: 7 }),
    ]);
    patternList.mockResolvedValue([]);

    const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
    });

    expect(result.topFlakyTests).toHaveLength(5);
    expect(result.topFlakyTests.map((t) => t.fullName)).toEqual(['t7', 't6', 't5', 't4', 't3']);
  });

  it('maps topFailurePatterns to 3-field subset (pattern, severity, occurrenceCount)', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
    const {
      repo: caseRepo,
      countByProject: caseCount,
      countByStatus,
      computeReliabilitySummaries,
    } = makeCaseRepo();
    const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

    const pattern: FailurePattern = {
      id: 'pat-1',
      projectId: 'p-1',
      pattern: 'TimeoutError',
      category: 'timeout',
      severity: 'HIGH',
      firstSeenAt: FROZEN,
      lastSeenAt: FROZEN,
      occurrenceCount: 23,
    };

    findById.mockResolvedValue(sampleProject());
    runCount.mockResolvedValue(0);
    caseCount.mockResolvedValue(0);
    countByStatus.mockResolvedValue(0);
    findFailureTrend.mockResolvedValue([]);
    computeReliabilitySummaries.mockResolvedValue([]);
    patternList.mockResolvedValue([pattern]);

    const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
    });

    expect(result.topFailurePatterns).toEqual([
      { pattern: 'TimeoutError', severity: 'HIGH', occurrenceCount: 23 },
    ]);
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, countByProject: runCount } = makeRunRepo();
    const { repo: caseRepo } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(null);

    await expect(
      getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-missing',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(runCount).not.toHaveBeenCalled();
  });

  describe('topFailurePatterns and topCriticalIssues', () => {
    it('limits topFailurePatterns to 5 even when more patterns exist', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
      const {
        repo: caseRepo,
        countByProject: caseCount,
        countByStatus,
        computeReliabilitySummaries,
      } = makeCaseRepo();
      const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

      findById.mockResolvedValue(sampleProject());
      runCount.mockResolvedValue(0);
      caseCount.mockResolvedValue(0);
      countByStatus.mockResolvedValue(0);
      findFailureTrend.mockResolvedValue([]);
      computeReliabilitySummaries.mockResolvedValue([]);

      // 8 patterns, sorted DESC by occurrenceCount as the repo would return them
      const patterns: FailurePattern[] = Array.from({ length: 8 }, (_, i) => ({
        id: `p-${i}`,
        projectId: 'p-1',
        pattern: `pattern-${i}`,
        severity: 'LOW',
        firstSeenAt: FROZEN,
        lastSeenAt: FROZEN,
        occurrenceCount: 100 - i,
      }));
      patternList.mockResolvedValue(patterns);

      const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
      });

      expect(result.topFailurePatterns).toHaveLength(5);
      expect(result.topFailurePatterns.map((p) => p.pattern)).toEqual([
        'pattern-0',
        'pattern-1',
        'pattern-2',
        'pattern-3',
        'pattern-4',
      ]);
    });

    it('asks patternRepo for 50 patterns even though only 5 are surfaced', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
      const {
        repo: caseRepo,
        countByProject: caseCount,
        countByStatus,
        computeReliabilitySummaries,
      } = makeCaseRepo();
      const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

      findById.mockResolvedValue(sampleProject());
      runCount.mockResolvedValue(0);
      caseCount.mockResolvedValue(0);
      countByStatus.mockResolvedValue(0);
      findFailureTrend.mockResolvedValue([]);
      computeReliabilitySummaries.mockResolvedValue([]);
      patternList.mockResolvedValue([]);

      await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
      });

      expect(patternList).toHaveBeenCalledWith('p-1', { limit: 50 });
    });

    it('topFailurePatterns is empty when no patterns exist', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
      const {
        repo: caseRepo,
        countByProject: caseCount,
        countByStatus,
        computeReliabilitySummaries,
      } = makeCaseRepo();
      const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

      findById.mockResolvedValue(sampleProject());
      runCount.mockResolvedValue(0);
      caseCount.mockResolvedValue(0);
      countByStatus.mockResolvedValue(0);
      findFailureTrend.mockResolvedValue([]);
      computeReliabilitySummaries.mockResolvedValue([]);
      patternList.mockResolvedValue([]);

      const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
      });

      expect(result.topFailurePatterns).toEqual([]);
      expect(result.topCriticalIssues).toEqual([]);
    });

    it('populates topCriticalIssues when CRITICAL conditions fire', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
      const {
        repo: caseRepo,
        countByProject: caseCount,
        countByStatus,
        computeReliabilitySummaries,
      } = makeCaseRepo();
      const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

      findById.mockResolvedValue(sampleProject());
      runCount.mockResolvedValue(0);
      caseCount.mockResolvedValue(0);
      countByStatus.mockResolvedValue(0);
      // Drive PASS_RATE_CRITICAL and BROKEN_TESTS_THRESHOLD
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 5, passRate: 0.5 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([
        {
          fullName: 'b1',
          testName: 'b1',
          passCount: 0,
          failCount: 5,
          skippedCount: 0,
          lastStatus: 'FAILED',
        },
        {
          fullName: 'b2',
          testName: 'b2',
          passCount: 0,
          failCount: 5,
          skippedCount: 0,
          lastStatus: 'FAILED',
        },
        {
          fullName: 'b3',
          testName: 'b3',
          passCount: 0,
          failCount: 5,
          skippedCount: 0,
          lastStatus: 'FAILED',
        },
      ]);
      patternList.mockResolvedValue([
        {
          id: 'p1',
          projectId: 'p-1',
          pattern: 'crit',
          severity: 'CRITICAL',
          occurrenceCount: 60,
          firstSeenAt: FROZEN,
          lastSeenAt: FROZEN,
        },
      ]);

      const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
      });

      const codes = result.topCriticalIssues.map((c) => c.code);
      expect(codes).toContain('PASS_RATE_CRITICAL');
      expect(codes).toContain('BROKEN_TESTS_THRESHOLD');
      expect(codes).toContain('CRITICAL_SEVERITY_PATTERN');
    });

    it('slices topCriticalIssues to 3 even when more critical conditions fire', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
      const {
        repo: caseRepo,
        countByProject: caseCount,
        countByStatus,
        computeReliabilitySummaries,
      } = makeCaseRepo();
      const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

      findById.mockResolvedValue(sampleProject());
      runCount.mockResolvedValue(0);
      caseCount.mockResolvedValue(0);
      countByStatus.mockResolvedValue(0);
      // PASS_RATE_CRITICAL + BROKEN_TESTS_THRESHOLD + FLAKY_TESTS_HIGH + 3 CRITICAL_SEVERITY_PATTERN = 6 critical
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 5, passRate: 0.5 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([
        ...Array.from({ length: 3 }, (_, i) => ({
          fullName: `b${i}`,
          testName: `b${i}`,
          passCount: 0,
          failCount: 5,
          skippedCount: 0,
          lastStatus: 'FAILED' as const,
        })),
        ...Array.from({ length: 20 }, (_, i) => ({
          fullName: `f${i}`,
          testName: `f${i}`,
          passCount: 5,
          failCount: 3,
          skippedCount: 0,
          lastStatus: 'FAILED' as const,
        })),
      ]);
      patternList.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          id: `p${i}`,
          projectId: 'p-1',
          pattern: `crit-${i}`,
          severity: 'CRITICAL' as const,
          occurrenceCount: 60 + i,
          firstSeenAt: FROZEN,
          lastSeenAt: FROZEN,
        })),
      );

      const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
      });

      expect(result.topCriticalIssues).toHaveLength(3);
    });

    it('topCriticalIssues is empty when project is healthy', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, countByProject: runCount, findFailureTrend } = makeRunRepo();
      const {
        repo: caseRepo,
        countByProject: caseCount,
        countByStatus,
        computeReliabilitySummaries,
      } = makeCaseRepo();
      const { repo: patternRepo, listByProject: patternList } = makePatternRepo();

      findById.mockResolvedValue(sampleProject());
      runCount.mockResolvedValue(10);
      caseCount.mockResolvedValue(20);
      countByStatus.mockResolvedValue(0);
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([]);
      patternList.mockResolvedValue([]);

      const result = await getProjectOverview(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
      });

      expect(result.topCriticalIssues).toEqual([]);
    });
  });
});
