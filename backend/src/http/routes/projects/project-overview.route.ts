import type { FastifyInstance } from 'fastify';
import { getProjectOverview } from '../../../application/use-cases/get-project-overview.js';
import { success } from '../../helpers/envelope.js';
import {
  analyticsParamsSchema,
  overviewResponseSchema,
  type AnalyticsParams,
} from '../../schemas/analytics.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: overviewResponseSchema },
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

export default async function projectOverviewRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: AnalyticsParams }>(
    '/projects/:projectId/overview',
    {
      schema: {
        params: analyticsParamsSchema,
        response: {
          200: successResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getProjectOverview(
        request.server.repos.projects,
        request.server.repos.testRuns,
        request.server.repos.testCases,
        request.server.repos.failurePatterns,
        { projectId: request.params.projectId },
      );
      return reply.code(200).send(success(result));
    },
  );
}
