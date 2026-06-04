import fp from 'fastify-plugin';
import type { Pool } from 'pg';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import { PgProjectRepository } from '../../infrastructure/repositories/pg-project.repository.js';

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool;
    repos: {
      projects: ProjectRepository;
    };
  }
}

export interface RepositoriesPluginOptions {
  pool: Pool;
}

export default fp<RepositoriesPluginOptions>(
  async (fastify, { pool }) => {
    fastify.decorate('pool', pool);
    fastify.decorate('repos', {
      projects: new PgProjectRepository(pool),
    });

    pool.on('error', (err) => {
      fastify.log.error({ err }, 'idle pool client error');
    });

    fastify.addHook('onClose', async () => {
      await pool.end();
    });
  },
  { name: 'repositories' },
);
