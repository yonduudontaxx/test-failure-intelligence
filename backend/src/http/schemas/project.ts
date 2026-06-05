export const createProjectBodySchema = {
  type: 'object',
  required: ['name', 'slug'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    slug: {
      type: 'string',
      pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
      minLength: 1,
      maxLength: 63,
    },
    description: { type: 'string', maxLength: 500 },
  },
} as const;

export const listProjectsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
} as const;

export const projectResponseSchema = {
  type: 'object',
  required: ['id', 'slug', 'name', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

export const listProjectsResponseSchema = {
  type: 'object',
  required: ['items', 'total', 'page', 'limit'],
  properties: {
    items: { type: 'array', items: projectResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
  },
} as const;

export interface CreateProjectBody {
  name: string;
  slug: string;
  description?: string;
}

export interface ListProjectsQuery {
  page?: number;
  limit?: number;
}

export interface ProjectResponse {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListProjectsResponse {
  items: ProjectResponse[];
  total: number;
  page: number;
  limit: number;
}
