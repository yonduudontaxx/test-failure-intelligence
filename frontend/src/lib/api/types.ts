export type SourceType = 'api' | 'junit_xml' | 'playwright' | 'jest' | 'json';
export type TestRunStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';
export type TestCaseStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
export type ReliabilityState = 'STABLE' | 'FLAKY' | 'BROKEN';
export type FailureSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ProjectHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface Project {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListProjectsResponse {
  items: Project[];
  total: number;
  page: number;
  limit: number;
}

export interface TestRun {
  id: string;
  projectId: string;
  sourceType: SourceType;
  status: TestRunStatus;
  branch?: string;
  environment?: string;
  commitSha?: string;
  pipelineName?: string;
  buildNumber?: string;
  externalId?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  durationMs?: number;
  metadata: Record<string, unknown>;
  executedAt?: string;
  ingestedAt: string;
}

export interface ListRunsResponse {
  items: TestRun[];
  total: number;
  page: number;
  limit: number;
}

export interface TestCase {
  id: string;
  projectId: string;
  testRunId: string;
  suiteName?: string;
  testName: string;
  fullName: string;
  status: TestCaseStatus;
  durationMs?: number;
  failureMessage?: string;
  failureType?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}

export interface RunCasesResponse {
  items: TestCase[];
}

export interface FlakyTestItem {
  fullName: string;
  reliabilityState: ReliabilityState;
  passCount: number;
  failCount: number;
  runCount: number;
  lastSeenAt: string;
}

export interface FlakyTestsResponse {
  items: FlakyTestItem[];
  total: number;
}

export interface FailureTrendItem {
  date: string;
  totalRuns: number;
  failedRuns: number;
  passRate: number;
}

export interface FailureTrendsResponse {
  items: FailureTrendItem[];
}

export interface HealthIssueItem {
  code: string;
  message: string;
}

export interface HealthResponse {
  status: ProjectHealthStatus;
  totalRuns: number;
  passRate: number;
  failureRate: number;
  brokenTestCount: number;
  flakyTestCount: number;
  windowDays: number;
  warnings: HealthIssueItem[];
  criticalIssues: HealthIssueItem[];
}

export interface TopFailurePatternItem {
  pattern: string;
  severity: FailureSeverity;
  occurrenceCount: number;
}

export interface OverviewResponse {
  totalRuns: number;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  skippedTestCases: number;
  recentPassRate: number;
  healthStatus: ProjectHealthStatus;
  topFlakyTests: FlakyTestItem[];
  topFailurePatterns: TopFailurePatternItem[];
  topCriticalIssues: HealthIssueItem[];
}

export interface FailurePatternItem {
  id: string;
  pattern: string;
  category?: string;
  severity: FailureSeverity;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface FailurePatternsResponse {
  items: FailurePatternItem[];
}
