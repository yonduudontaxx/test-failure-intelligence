import type { FastifyInstance } from 'fastify';
import { getFailurePatterns } from '../../../application/use-cases/get-failure-patterns.js';
import { success } from '../../helpers/envelope.js';
import {
  analyticsParamsSchema,
  failurePatternsQuerySchema,
  failurePatternsResponseSchema,
  type AnalyticsParams,
  type FailurePatternsQuery,
} from '../../schemas/analytics.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: failurePatternsResponseSchema },
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

export default async function failurePatternsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: AnalyticsParams; Querystring: FailurePatternsQuery }>(
    '/projects/:projectId/failure-patterns',
    {
      schema: {
        params: analyticsParamsSchema,
        querystring: failurePatternsQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? 50;
      const result = await getFailurePatterns(
        request.server.repos.projects,
        request.server.repos.failurePatterns,
        { projectId: request.params.projectId, limit },
      );
      return reply.code(200).send(success(result));
    },
  );
}
