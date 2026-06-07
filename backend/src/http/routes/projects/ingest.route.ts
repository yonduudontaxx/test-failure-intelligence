import type { FastifyInstance } from 'fastify';
import type { SourceType } from '../../../domain/enums/source-type.js';
import { canonicalJsonAdapter } from '../../../application/ingestion/adapters/canonical-json.adapter.js';
import { playwrightAdapter } from '../../../application/ingestion/adapters/playwright.adapter.js';
import { jestAdapter } from '../../../application/ingestion/adapters/jest.adapter.js';
import { junitXmlAdapter } from '../../../application/ingestion/adapters/junit-xml.adapter.js';
import { IngestionFailedError } from '../../../application/ingestion/errors.js';
import type { AdapterInput, IngestionAdapter } from '../../../application/ingestion/types.js';
import { ingestTestRun } from '../../../application/use-cases/ingest-test-run.js';
import { failure, success } from '../../helpers/envelope.js';
import {
  ingestApiBodySchema,
  ingestParamsSchema,
  ingestResponseSchema,
  type IngestApiBody,
  type IngestParams,
} from '../../schemas/ingest.js';

const adaptersBySourceType: Record<SourceType, IngestionAdapter> = {
  api: canonicalJsonAdapter,
  json: canonicalJsonAdapter,
  playwright: playwrightAdapter,
  jest: jestAdapter,
  junit_xml: junitXmlAdapter,
};

const FORMAT_TO_SOURCE_TYPE: Record<string, SourceType> = {
  json: 'json',
  playwright: 'playwright',
  jest: 'jest',
  'junit-xml': 'junit_xml',
};

const OVERRIDE_FIELDS = [
  'branch',
  'environment',
  'commitSha',
  'pipelineName',
  'buildNumber',
  'externalId',
] as const;

type OverrideField = (typeof OVERRIDE_FIELDS)[number];

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: ingestResponseSchema },
} as const;

const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

export default async function ingestRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: IngestParams; Body: IngestApiBody }>(
    '/projects/:projectId/ingest',
    {
      schema: {
        params: ingestParamsSchema,
        body: ingestApiBodySchema,
        response: {
          201: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
      // Defer validation rejection to the handler so the multipart branch
      // (which legitimately has no JSON body) is not pre-rejected by the
      // body schema.
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.isMultipart()) {
        let fileBuffer: Buffer | undefined;
        let format: string | undefined;
        const overrides: Partial<Record<OverrideField, string>> = {};

        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname === 'file') {
              fileBuffer = await part.toBuffer();
            } else {
              // unknown file field — drain to avoid hanging
              await part.toBuffer();
            }
          } else {
            const value = String(part.value);
            if (part.fieldname === 'format') {
              format = value;
            } else if ((OVERRIDE_FIELDS as readonly string[]).includes(part.fieldname)) {
              overrides[part.fieldname as OverrideField] = value;
            }
          }
        }

        if (!fileBuffer) {
          return reply.code(400).send(failure('VALIDATION_ERROR', 'Missing required "file" part.'));
        }
        if (!format) {
          return reply
            .code(400)
            .send(failure('VALIDATION_ERROR', 'Missing required "format" field.'));
        }
        const sourceType = FORMAT_TO_SOURCE_TYPE[format];
        if (!sourceType) {
          return reply
            .code(400)
            .send(
              failure(
                'VALIDATION_ERROR',
                `Unknown format "${format}". Allowed: json, playwright, jest, junit-xml.`,
              ),
            );
        }

        const adapter = adaptersBySourceType[sourceType];
        let raw: AdapterInput;
        if (sourceType === 'junit_xml') {
          raw = { kind: 'xml', text: fileBuffer.toString('utf8') };
        } else {
          let parsed: unknown;
          try {
            parsed = JSON.parse(fileBuffer.toString('utf8'));
          } catch {
            throw new IngestionFailedError('File is not valid JSON.');
          }
          raw = { kind: 'json', body: parsed };
        }

        const result = await ingestTestRun(
          request.server.pool,
          request.server.repos.testRuns,
          request.server.repos.testCases,
          request.server.repos.failurePatterns,
          adapter,
          {
            projectId: request.params.projectId,
            sourceType,
            raw,
            overrides,
          },
        );

        return reply.code(201).send(success(result));
      }

      // JSON path — surface any deferred Ajv validation error against the body schema.
      if (request.validationError) {
        return reply.code(400).send(failure('VALIDATION_ERROR', request.validationError.message));
      }

      const adapter = adaptersBySourceType.api;
      const result = await ingestTestRun(
        request.server.pool,
        request.server.repos.testRuns,
        request.server.repos.testCases,
        request.server.repos.failurePatterns,
        adapter,
        {
          projectId: request.params.projectId,
          sourceType: 'api',
          raw: { kind: 'json', body: request.body },
          overrides: {},
        },
      );

      return reply.code(201).send(success(result));
    },
  );
}
