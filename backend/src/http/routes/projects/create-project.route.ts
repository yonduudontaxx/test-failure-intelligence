import type { FastifyInstance } from 'fastify';
import type { Project } from '../../../domain/entities/project.js';
import { createProject } from '../../../application/use-cases/create-project.js';
import { success } from '../../helpers/envelope.js';
import {
  createProjectBodySchema,
  projectResponseSchema,
  type CreateProjectBody,
  type ProjectResponse,
} from '../../schemas/project.js';

const successResponseSchema = {
  type: 'object',
  required: ['data'],
  properties: {
    data: projectResponseSchema,
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

export default async function createProjectRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CreateProjectBody }>(
    '/projects',
    {
      schema: {
        body: createProjectBodySchema,
        response: {
          201: successResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const project = await createProject(request.server.repos.projects, request.body);
      return reply.code(201).send(success(toProjectResponse(project)));
    },
  );
}

function toProjectResponse(project: Project): ProjectResponse {
  const response: ProjectResponse = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
  if (project.description !== undefined) {
    response.description = project.description;
  }
  return response;
}
