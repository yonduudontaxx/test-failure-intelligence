import type { FastifyInstance } from 'fastify';
import type { Project } from '../../../domain/entities/project.js';
import { getProject } from '../../../application/use-cases/get-project.js';
import { success } from '../../helpers/envelope.js';
import { projectResponseSchema, type ProjectResponse } from '../../schemas/project.js';

const paramsSchema = {
  type: 'object',
  required: ['projectId'],
  properties: {
    projectId: { type: 'string' },
  },
} as const;

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

interface ProjectIdParams {
  projectId: string;
}

export default async function getProjectRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: ProjectIdParams }>(
    '/projects/:projectId',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const project = await getProject(request.server.repos.projects, request.params.projectId);
      return reply.code(200).send(success(toProjectResponse(project)));
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
