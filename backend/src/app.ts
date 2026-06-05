import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import type { Pool } from 'pg';
import { config } from './config.js';
import swaggerPlugin from './http/plugins/swagger.js';
import repositoriesPlugin from './http/plugins/repositories.js';
import errorHandlerPlugin from './http/plugins/error-handler.js';
import healthRoutes from './http/routes/health.js';
import createProjectRoute from './http/routes/projects/create-project.route.js';

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
  app.register(healthRoutes);
  app.register(createProjectRoute, { prefix: '/api/v1' });

  await app.ready();
  return app;
}
