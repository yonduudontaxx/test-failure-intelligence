import type { FastifyInstance } from 'fastify';
import { listRuns } from '../../../application/use-cases/list-runs.js';
import { success } from '../../helpers/envelope.js';
import {
  listRunsParamsSchema,
  listRunsQuerySchema,
  listRunsResponseSchema,
  type ListRunsParams,
  type ListRunsQuery,
} from '../../schemas/test-run.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: listRunsResponseSchema },
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

export default async function listRunsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: ListRunsParams; Querystring: ListRunsQuery }>(
    '/projects/:projectId/runs',
    {
      schema: {
        params: listRunsParamsSchema,
        querystring: listRunsQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await listRuns(request.server.repos.projects, request.server.repos.testRuns, {
        ...request.query,
        projectId: request.params.projectId,
      });
      return reply.code(200).send(success(result));
    },
  );
}
