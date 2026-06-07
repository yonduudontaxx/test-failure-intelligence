import type { FastifyInstance } from 'fastify';
import { getFailureTrends } from '../../../application/use-cases/get-failure-trends.js';
import { success } from '../../helpers/envelope.js';
import {
  analyticsParamsSchema,
  failureTrendQuerySchema,
  failureTrendsResponseSchema,
  type AnalyticsParams,
  type FailureTrendQuery,
} from '../../schemas/analytics.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: failureTrendsResponseSchema },
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

export default async function failureTrendsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: AnalyticsParams; Querystring: FailureTrendQuery }>(
    '/projects/:projectId/failure-trends',
    {
      schema: {
        params: analyticsParamsSchema,
        querystring: failureTrendQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const days = request.query.days ?? 30;
      const bucketSize = request.query.bucketSize ?? 'day';
      const result = await getFailureTrends(
        request.server.repos.projects,
        request.server.repos.testRuns,
        { projectId: request.params.projectId, days, bucketSize },
      );
      return reply.code(200).send(success(result));
    },
  );
}
