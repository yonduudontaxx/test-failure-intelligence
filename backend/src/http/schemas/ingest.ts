export const ingestParamsSchema = {
  type: 'object',
  required: ['projectId'],
  properties: {
    projectId: { type: 'string' },
  },
} as const;

export const ingestApiBodySchema = {
  type: 'object',
  required: ['sourceType', 'testRun', 'testCases'],
  additionalProperties: false,
  properties: {
    sourceType: {
      type: 'string',
      enum: ['api'],
    },
    testRun: {
      type: 'object',
      additionalProperties: false,
      properties: {
        branch: { type: 'string', maxLength: 200 },
        environment: { type: 'string', maxLength: 100 },
        commitSha: { type: 'string', maxLength: 100 },
        pipelineName: { type: 'string', maxLength: 200 },
        buildNumber: { type: 'string', maxLength: 100 },
        executedAt: { type: 'string', format: 'date-time' },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['testName', 'status'],
        additionalProperties: false,
        properties: {
          suiteName: { type: 'string', maxLength: 500 },
          testName: { type: 'string', minLength: 1, maxLength: 500 },
          status: {
            type: 'string',
            enum: ['PASSED', 'FAILED', 'SKIPPED', 'ERROR'],
          },
          durationMs: { type: 'integer', minimum: 0 },
          failureMessage: { type: 'string', maxLength: 10000 },
          failureType: { type: 'string', maxLength: 200 },
          retryCount: { type: 'integer', minimum: 0, default: 0 },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
} as const;

export const ingestResponseSchema = {
  type: 'object',
  required: ['runId', 'testCaseCount'],
  properties: {
    runId: { type: 'string' },
    testCaseCount: { type: 'integer' },
  },
} as const;

export interface IngestParams {
  projectId: string;
}

export interface IngestApiBodyTestCase {
  suiteName?: string;
  testName: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  durationMs?: number;
  failureMessage?: string;
  failureType?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

export interface IngestApiBodyTestRun {
  branch?: string;
  environment?: string;
  commitSha?: string;
  pipelineName?: string;
  buildNumber?: string;
  executedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestApiBody {
  sourceType: 'api';
  testRun: IngestApiBodyTestRun;
  testCases: IngestApiBodyTestCase[];
}

export interface IngestResponse {
  runId: string;
  testCaseCount: number;
}
