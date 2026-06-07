import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { Pool } from 'pg';
import { config } from './config.js';
import swaggerPlugin from './http/plugins/swagger.js';
import repositoriesPlugin from './http/plugins/repositories.js';
import errorHandlerPlugin from './http/plugins/error-handler.js';
import healthRoutes from './http/routes/health.js';
import createProjectRoute from './http/routes/projects/create-project.route.js';
import getProjectRoute from './http/routes/projects/get-project.route.js';
import listProjectsRoute from './http/routes/projects/list-projects.route.js';
import ingestRoute from './http/routes/projects/ingest.route.js';
import listRunsRoute from './http/routes/projects/list-runs.route.js';
import getRunRoute from './http/routes/projects/get-run.route.js';
import getRunCasesRoute from './http/routes/projects/get-run-cases.route.js';

export interface BuildAppOptions extends FastifyServerOptions {
  pool: Pool;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { pool, ...fastifyOpts } = opts;
  const app = Fastify({
    logger: { level: config.logLevel },
    ajv: { customOptions: { removeAdditional: false } },
    ...fastifyOpts,
  });

  await app.register(repositoriesPlugin, { pool });
  app.register(sensible);
  app.register(cors);
  app.register(swaggerPlugin);
  app.register(errorHandlerPlugin);
  app.register(multipart, {
    attachFieldsToBody: false,
    limits: { fileSize: 5_242_880 },
  });
  app.register(healthRoutes);
  app.register(createProjectRoute, { prefix: '/api/v1' });
  app.register(getProjectRoute, { prefix: '/api/v1' });
  app.register(listProjectsRoute, { prefix: '/api/v1' });
  app.register(ingestRoute, { prefix: '/api/v1' });
  app.register(listRunsRoute, { prefix: '/api/v1' });
  app.register(getRunRoute, { prefix: '/api/v1' });
  app.register(getRunCasesRoute, { prefix: '/api/v1' });

  await app.ready();
  return app;
}
