import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { config } from './config.js';
import healthRoutes from './http/routes/health.js';

export async function buildApp(opts?: FastifyServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    ...opts,
  });

  app.register(sensible);
  app.register(cors);
  app.register(healthRoutes);

  await app.ready();
  return app;
}
