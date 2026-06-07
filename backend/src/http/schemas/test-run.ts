export const listRunsParamsSchema = {
  type: 'object',
  required: ['projectId'],
  properties: {
    projectId: { type: 'string' },
  },
} as const;

export const runParamsSchema = {
  type: 'object',
  required: ['projectId', 'runId'],
  properties: {
    projectId: { type: 'string' },
    runId: { type: 'string' },
  },
} as const;

export const listRunsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    branch: { type: 'string' },
    environment: { type: 'string' },
    status: {
      type: 'string',
      enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
    },
  },
} as const;

export const runCasesQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['PASSED', 'FAILED', 'SKIPPED', 'ERROR'],
    },
  },
} as const;

export const runResponseSchema = {
  type: 'object',
  required: [
    'id',
    'projectId',
    'sourceType',
    'status',
    'totalTests',
    'passedTests',
    'failedTests',
    'skippedTests',
    'metadata',
    'ingestedAt',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    sourceType: {
      type: 'string',
      enum: ['api', 'junit_xml', 'playwright', 'jest', 'json'],
    },
    status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'PARTIAL'] },
    branch: { type: 'string' },
    environment: { type: 'string' },
    commitSha: { type: 'string' },
    pipelineName: { type: 'string' },
    buildNumber: { type: 'string' },
    externalId: { type: 'string' },
    totalTests: { type: 'integer' },
    passedTests: { type: 'integer' },
    failedTests: { type: 'integer' },
    skippedTests: { type: 'integer' },
    durationMs: { type: 'integer' },
    metadata: { type: 'object', additionalProperties: true },
    executedAt: { type: 'string' },
    ingestedAt: { type: 'string' },
  },
} as const;

export const listRunsResponseSchema = {
  type: 'object',
  required: ['items', 'total', 'page', 'limit'],
  properties: {
    items: { type: 'array', items: runResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
  },
} as const;

export const caseResponseSchema = {
  type: 'object',
  required: [
    'id',
    'projectId',
    'testRunId',
    'fullName',
    'testName',
    'status',
    'retryCount',
    'metadata',
  ],
  properties: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    testRunId: { type: 'string' },
    suiteName: { type: 'string' },
    testName: { type: 'string' },
    fullName: { type: 'string' },
    status: {
      type: 'string',
      enum: ['PASSED', 'FAILED', 'SKIPPED', 'ERROR'],
    },
    durationMs: { type: 'integer' },
    failureMessage: { type: 'string' },
    failureType: { type: 'string' },
    retryCount: { type: 'integer' },
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;

export const runCasesResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: caseResponseSchema },
  },
} as const;

export interface ListRunsParams {
  projectId: string;
}

export interface RunParams {
  projectId: string;
  runId: string;
}

export interface ListRunsQuery {
  page?: number;
  limit?: number;
  branch?: string;
  environment?: string;
  status?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
}

export interface RunCasesQuery {
  status?: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
}

export interface RunResponse {
  id: string;
  projectId: string;
  sourceType: 'api' | 'junit_xml' | 'playwright' | 'jest' | 'json';
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
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
  items: RunResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface CaseResponse {
  id: string;
  projectId: string;
  testRunId: string;
  suiteName?: string;
  testName: string;
  fullName: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  durationMs?: number;
  failureMessage?: string;
  failureType?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}

export interface RunCasesResponse {
  items: CaseResponse[];
}
