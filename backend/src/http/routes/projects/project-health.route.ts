import type { FastifyInstance } from 'fastify';
import { getProjectHealth } from '../../../application/use-cases/get-project-health.js';
import { success } from '../../helpers/envelope.js';
import {
  analyticsParamsSchema,
  healthQuerySchema,
  healthResponseSchema,
  type AnalyticsParams,
  type HealthQuery,
} from '../../schemas/analytics.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: healthResponseSchema },
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

export default async function projectHealthRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: AnalyticsParams; Querystring: HealthQuery }>(
    '/projects/:projectId/health',
    {
      schema: {
        params: analyticsParamsSchema,
        querystring: healthQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const days = request.query.days ?? 30;
      const result = await getProjectHealth(
        request.server.repos.projects,
        request.server.repos.testRuns,
        request.server.repos.testCases,
        { projectId: request.params.projectId, days },
      );
      return reply.code(200).send(success(result));
    },
  );
}
