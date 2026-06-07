export const analyticsParamsSchema = {
  type: 'object',
  required: ['projectId'],
  properties: {
    projectId: { type: 'string' },
  },
} as const;

export const flakyTestsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const;

export const flakyTestItemSchema = {
  type: 'object',
  required: ['fullName', 'reliabilityState', 'passCount', 'failCount', 'runCount', 'lastSeenAt'],
  properties: {
    fullName: { type: 'string' },
    reliabilityState: {
      type: 'string',
      enum: ['STABLE', 'FLAKY', 'BROKEN'],
    },
    passCount: { type: 'integer' },
    failCount: { type: 'integer' },
    runCount: { type: 'integer' },
    lastSeenAt: { type: 'string' },
  },
} as const;

export const flakyTestsResponseSchema = {
  type: 'object',
  required: ['items', 'total'],
  properties: {
    items: { type: 'array', items: flakyTestItemSchema },
    total: { type: 'integer' },
  },
} as const;

export const failureTrendQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
    bucketSize: {
      type: 'string',
      enum: ['day', 'week'],
      default: 'day',
    },
  },
} as const;

export const failureTrendItemSchema = {
  type: 'object',
  required: ['date', 'totalRuns', 'failedRuns', 'passRate'],
  properties: {
    date: { type: 'string' },
    totalRuns: { type: 'integer' },
    failedRuns: { type: 'integer' },
    passRate: { type: 'number' },
  },
} as const;

export const failureTrendsResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: failureTrendItemSchema },
  },
} as const;

export const healthQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
  },
} as const;

export const healthIssueItemSchema = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

export const healthResponseSchema = {
  type: 'object',
  required: [
    'status',
    'totalRuns',
    'passRate',
    'failureRate',
    'brokenTestCount',
    'flakyTestCount',
    'windowDays',
    'warnings',
    'criticalIssues',
  ],
  properties: {
    status: { type: 'string', enum: ['HEALTHY', 'WARNING', 'CRITICAL'] },
    totalRuns: { type: 'integer' },
    passRate: { type: 'number' },
    failureRate: { type: 'number' },
    brokenTestCount: { type: 'integer' },
    flakyTestCount: { type: 'integer' },
    windowDays: { type: 'integer' },
    warnings: { type: 'array', items: healthIssueItemSchema },
    criticalIssues: { type: 'array', items: healthIssueItemSchema },
  },
} as const;

export const topFailurePatternItemSchema = {
  type: 'object',
  required: ['pattern', 'severity', 'occurrenceCount'],
  properties: {
    pattern: { type: 'string' },
    severity: {
      type: 'string',
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    },
    occurrenceCount: { type: 'integer' },
  },
} as const;

export const overviewResponseSchema = {
  type: 'object',
  required: [
    'totalRuns',
    'totalTestCases',
    'passedTestCases',
    'failedTestCases',
    'skippedTestCases',
    'recentPassRate',
    'healthStatus',
    'topFlakyTests',
    'topFailurePatterns',
  ],
  properties: {
    totalRuns: { type: 'integer' },
    totalTestCases: { type: 'integer' },
    passedTestCases: { type: 'integer' },
    failedTestCases: { type: 'integer' },
    skippedTestCases: { type: 'integer' },
    recentPassRate: { type: 'number' },
    healthStatus: {
      type: 'string',
      enum: ['HEALTHY', 'WARNING', 'CRITICAL'],
    },
    topFlakyTests: { type: 'array', items: flakyTestItemSchema },
    topFailurePatterns: {
      type: 'array',
      items: topFailurePatternItemSchema,
    },
  },
} as const;

export const failurePatternsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
} as const;

export const failurePatternItemSchema = {
  type: 'object',
  required: ['id', 'pattern', 'severity', 'occurrenceCount', 'firstSeenAt', 'lastSeenAt'],
  properties: {
    id: { type: 'string' },
    pattern: { type: 'string' },
    category: { type: 'string' },
    severity: {
      type: 'string',
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    },
    occurrenceCount: { type: 'integer' },
    firstSeenAt: { type: 'string' },
    lastSeenAt: { type: 'string' },
  },
} as const;

export const failurePatternsResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: failurePatternItemSchema },
  },
} as const;

export interface AnalyticsParams {
  projectId: string;
}

export interface FlakyTestsQuery {
  days?: number;
  limit?: number;
}

export interface FlakyTestItem {
  fullName: string;
  reliabilityState: 'STABLE' | 'FLAKY' | 'BROKEN';
  passCount: number;
  failCount: number;
  runCount: number;
  lastSeenAt: string;
}

export interface FlakyTestsResponse {
  items: FlakyTestItem[];
  total: number;
}

export interface FailureTrendQuery {
  days?: number;
  bucketSize?: 'day' | 'week';
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

export interface HealthQuery {
  days?: number;
}

export interface HealthIssueItem {
  code: string;
  message: string;
}

export interface HealthResponse {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
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
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  occurrenceCount: number;
}

export interface OverviewResponse {
  totalRuns: number;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  skippedTestCases: number;
  recentPassRate: number;
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  topFlakyTests: FlakyTestItem[];
  topFailurePatterns: TopFailurePatternItem[];
}

export interface FailurePatternsQuery {
  limit?: number;
}

export interface FailurePatternItem {
  id: string;
  pattern: string;
  category?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface FailurePatternsResponse {
  items: FailurePatternItem[];
}
