import type { FastifyInstance } from 'fastify';
import { getRunCases } from '../../../application/use-cases/get-run-cases.js';
import { success } from '../../helpers/envelope.js';
import {
  runCasesQuerySchema,
  runCasesResponseSchema,
  runParamsSchema,
  type RunCasesQuery,
  type RunParams,
} from '../../schemas/test-run.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: runCasesResponseSchema },
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

export default async function getRunCasesRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: RunParams; Querystring: RunCasesQuery }>(
    '/projects/:projectId/runs/:runId/cases',
    {
      schema: {
        params: runParamsSchema,
        querystring: runCasesQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const items = await getRunCases(
        request.server.repos.projects,
        request.server.repos.testRuns,
        request.server.repos.testCases,
        request.params.projectId,
        request.params.runId,
        request.query,
      );
      return reply.code(200).send(success({ items }));
    },
  );
}
