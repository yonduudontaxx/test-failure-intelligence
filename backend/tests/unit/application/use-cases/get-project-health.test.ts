import { describe, it, expect, jest } from '@jest/globals';
import { getProjectHealth } from '../../../../src/application/use-cases/get-project-health.js';
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
  const findFailureTrend = jest.fn<TestRunRepository['findFailureTrend']>();
  const repo: TestRunRepository = {
    create: jest.fn<TestRunRepository['create']>(),
    findById: jest.fn<TestRunRepository['findById']>(),
    listByProject: jest.fn<TestRunRepository['listByProject']>(),
    findMostRecentByProject: jest.fn<TestRunRepository['findMostRecentByProject']>(),
    countByProject: jest.fn<TestRunRepository['countByProject']>(),
    findFailureTrend,
  };
  return { repo, findFailureTrend };
}

function makeCaseRepo() {
  const computeReliabilitySummaries = jest.fn<TestCaseRepository['computeReliabilitySummaries']>();
  const repo: TestCaseRepository = {
    createMany: jest.fn<TestCaseRepository['createMany']>(),
    findByTestRun: jest.fn<TestCaseRepository['findByTestRun']>(),
    findRecentByFullName: jest.fn<TestCaseRepository['findRecentByFullName']>(),
    countByProject: jest.fn<TestCaseRepository['countByProject']>(),
    countByStatus: jest.fn<TestCaseRepository['countByStatus']>(),
    computeReliabilitySummaries,
  };
  return { repo, computeReliabilitySummaries };
}

function makePatternRepo() {
  const listByProject = jest.fn<FailurePatternRepository['listByProject']>();
  const upsertByPattern = jest.fn<FailurePatternRepository['upsertByPattern']>();
  const repo: FailurePatternRepository = { listByProject, upsertByPattern };
  listByProject.mockResolvedValue([]);
  return { repo, listByProject };
}

function samplePattern(overrides: Partial<FailurePattern> = {}): FailurePattern {
  return {
    id: 'pat-1',
    projectId: 'p-1',
    pattern: 'TimeoutError: navigation',
    severity: 'LOW',
    occurrenceCount: 1,
    firstSeenAt: FROZEN,
    lastSeenAt: FROZEN,
    ...overrides,
  };
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

describe('getProjectHealth', () => {
  it('returns a full HealthResponse with windowDays echoed', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 10, failedRuns: 2, passRate: 0.8 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 14,
    });

    expect(result.windowDays).toBe(14);
    expect(result.status).toBeDefined();
    expect(result.totalRuns).toBe(10);
    expect(result.passRate).toBe(80);
    expect(result.failureRate).toBe(20);
    expect(result.brokenTestCount).toBe(0);
    expect(result.flakyTestCount).toBe(0);
  });

  it('classifies HEALTHY when there are no failures, broken, or flaky', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 50, failedRuns: 0, passRate: 1 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'a', passCount: 10, failCount: 0 }),
    ]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 30,
    });
    expect(result.status).toBe('HEALTHY');
  });

  it('classifies WARNING when there is one broken test', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'broken', passCount: 0, failCount: 5 }),
    ]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 30,
    });
    expect(result.status).toBe('WARNING');
    expect(result.brokenTestCount).toBe(1);
  });

  it('classifies CRITICAL when there are 3 broken tests', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'b1', passCount: 0, failCount: 3 }),
      summary({ fullName: 'b2', passCount: 0, failCount: 4 }),
      summary({ fullName: 'b3', passCount: 0, failCount: 5 }),
    ]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 30,
    });
    expect(result.status).toBe('CRITICAL');
    expect(result.brokenTestCount).toBe(3);
  });

  it('returns HEALTHY with passRate=100 / failureRate=0 when totalRuns is 0', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([]);
    computeReliabilitySummaries.mockResolvedValue([]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 30,
    });
    expect(result.status).toBe('HEALTHY');
    expect(result.totalRuns).toBe(0);
    expect(result.passRate).toBe(100);
    expect(result.failureRate).toBe(0);
  });

  it('computes passRate / failureRate as percentages rounded to 1 decimal', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    // 3 failed / 30 total = 10% failure, 90% pass
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 10, failedRuns: 1, passRate: 0.9 },
      { date: '2026-06-02', totalRuns: 20, failedRuns: 2, passRate: 0.9 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 30,
    });
    expect(result.totalRuns).toBe(30);
    expect(result.failureRate).toBe(10);
    expect(result.passRate).toBe(90);
  });

  it('counts FLAKY summaries as flakyTestCount, BROKEN as brokenTestCount, STABLE as neither', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(sampleProject());
    findFailureTrend.mockResolvedValue([
      { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
    ]);
    computeReliabilitySummaries.mockResolvedValue([
      summary({ fullName: 'stable', passCount: 10, failCount: 0 }),
      summary({ fullName: 'flaky-1', passCount: 5, failCount: 2 }),
      summary({ fullName: 'flaky-2', passCount: 7, failCount: 1 }),
      summary({ fullName: 'broken', passCount: 0, failCount: 8 }),
    ]);

    const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
      projectId: 'p-1',
      days: 30,
    });
    expect(result.flakyTestCount).toBe(2);
    expect(result.brokenTestCount).toBe(1);
  });

  it('throws 404 when project does not exist', async () => {
    const { repo: projectRepo, findById } = makeProjectRepo();
    const { repo: runRepo, findFailureTrend } = makeRunRepo();
    const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
    const { repo: patternRepo } = makePatternRepo();
    findById.mockResolvedValue(null);

    await expect(
      getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-missing',
        days: 30,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Project not found',
    });
    expect(findFailureTrend).not.toHaveBeenCalled();
    expect(computeReliabilitySummaries).not.toHaveBeenCalled();
  });

  describe('warnings and critical issues', () => {
    it('returns empty arrays when project is healthy', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, findFailureTrend } = makeRunRepo();
      const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
      const { repo: patternRepo } = makePatternRepo();
      findById.mockResolvedValue(sampleProject());
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([]);

      const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
        days: 30,
      });
      expect(result.warnings).toEqual([]);
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits BROKEN_TESTS_PRESENT warning when one test is BROKEN', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, findFailureTrend } = makeRunRepo();
      const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
      const { repo: patternRepo } = makePatternRepo();
      findById.mockResolvedValue(sampleProject());
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 1, passRate: 0.9 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([
        summary({ fullName: 'broken', passCount: 0, failCount: 5 }),
      ]);

      const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
        days: 30,
      });
      expect(result.warnings.map((w) => w.code)).toContain('BROKEN_TESTS_PRESENT');
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits BROKEN_TESTS_THRESHOLD critical when three tests are BROKEN', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, findFailureTrend } = makeRunRepo();
      const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
      const { repo: patternRepo } = makePatternRepo();
      findById.mockResolvedValue(sampleProject());
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 1, passRate: 0.9 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([
        summary({ fullName: 'b1', passCount: 0, failCount: 3 }),
        summary({ fullName: 'b2', passCount: 0, failCount: 2 }),
        summary({ fullName: 'b3', passCount: 0, failCount: 4 }),
      ]);

      const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
        days: 30,
      });
      expect(result.criticalIssues.map((c) => c.code)).toContain('BROKEN_TESTS_THRESHOLD');
      expect(result.warnings.map((w) => w.code)).toContain('BROKEN_TESTS_PRESENT');
    });

    it('emits HIGH_SEVERITY_PATTERN warning when a HIGH pattern exists', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, findFailureTrend } = makeRunRepo();
      const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
      const { repo: patternRepo, listByProject } = makePatternRepo();
      findById.mockResolvedValue(sampleProject());
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([]);
      listByProject.mockResolvedValue([samplePattern({ severity: 'HIGH', occurrenceCount: 22 })]);

      const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
        days: 30,
      });
      expect(result.warnings.map((w) => w.code)).toContain('HIGH_SEVERITY_PATTERN');
      expect(result.criticalIssues.map((c) => c.code)).not.toContain('CRITICAL_SEVERITY_PATTERN');
    });

    it('emits CRITICAL_SEVERITY_PATTERN critical when a CRITICAL pattern exists', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, findFailureTrend } = makeRunRepo();
      const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
      const { repo: patternRepo, listByProject } = makePatternRepo();
      findById.mockResolvedValue(sampleProject());
      findFailureTrend.mockResolvedValue([
        { date: '2026-06-01', totalRuns: 10, failedRuns: 0, passRate: 1 },
      ]);
      computeReliabilitySummaries.mockResolvedValue([]);
      listByProject.mockResolvedValue([
        samplePattern({ severity: 'CRITICAL', occurrenceCount: 60 }),
      ]);

      const result = await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
        days: 30,
      });
      expect(result.criticalIssues.map((c) => c.code)).toContain('CRITICAL_SEVERITY_PATTERN');
    });

    it('calls patternRepo.listByProject with the correct projectId and a bounded limit', async () => {
      const { repo: projectRepo, findById } = makeProjectRepo();
      const { repo: runRepo, findFailureTrend } = makeRunRepo();
      const { repo: caseRepo, computeReliabilitySummaries } = makeCaseRepo();
      const { repo: patternRepo, listByProject } = makePatternRepo();
      findById.mockResolvedValue(sampleProject());
      findFailureTrend.mockResolvedValue([]);
      computeReliabilitySummaries.mockResolvedValue([]);

      await getProjectHealth(projectRepo, runRepo, caseRepo, patternRepo, {
        projectId: 'p-1',
        days: 30,
      });

      expect(listByProject).toHaveBeenCalledWith('p-1', { limit: 100 });
    });
  });
});
