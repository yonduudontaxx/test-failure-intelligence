import type { FastifyInstance } from 'fastify';
import { listProjects } from '../../../application/use-cases/list-projects.js';
import { success } from '../../helpers/envelope.js';
import {
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  type ListProjectsQuery,
} from '../../schemas/project.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: {
    data: listProjectsResponseSchema,
  },
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

export default async function listProjectsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ListProjectsQuery }>(
    '/projects',
    {
      schema: {
        querystring: listProjectsQuerySchema,
        response: {
          200: successResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await listProjects(request.server.repos.projects, request.query);
      return reply.code(200).send(success(result));
    },
  );
}
