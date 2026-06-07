import type { FastifyInstance } from 'fastify';
import { getFlakyTests } from '../../../application/use-cases/get-flaky-tests.js';
import { success } from '../../helpers/envelope.js';
import {
  analyticsParamsSchema,
  flakyTestsQuerySchema,
  flakyTestsResponseSchema,
  type AnalyticsParams,
  type FlakyTestsQuery,
} from '../../schemas/analytics.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: flakyTestsResponseSchema },
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

export default async function flakyTestsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: AnalyticsParams; Querystring: FlakyTestsQuery }>(
    '/projects/:projectId/flaky-tests',
    {
      schema: {
        params: analyticsParamsSchema,
        querystring: flakyTestsQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const days = request.query.days ?? 30;
      const limit = request.query.limit ?? 20;
      const result = await getFlakyTests(
        request.server.repos.projects,
        request.server.repos.testCases,
        { projectId: request.params.projectId, days, limit },
      );
      return reply.code(200).send(success(result));
    },
  );
}
