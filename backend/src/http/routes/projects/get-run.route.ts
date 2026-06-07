import type { FastifyInstance } from 'fastify';
import { getRun } from '../../../application/use-cases/get-run.js';
import { success } from '../../helpers/envelope.js';
import { runParamsSchema, runResponseSchema, type RunParams } from '../../schemas/test-run.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: { data: runResponseSchema },
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

export default async function getRunRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: RunParams }>(
    '/projects/:projectId/runs/:runId',
    {
      schema: {
        params: runParamsSchema,
        response: {
          200: successResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getRun(
        request.server.repos.projects,
        request.server.repos.testRuns,
        request.params.projectId,
        request.params.runId,
      );
      return reply.code(200).send(success(result));
    },
  );
}
