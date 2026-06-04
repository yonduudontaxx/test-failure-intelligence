import fp from 'fastify-plugin';
import type { Pool } from 'pg';
import type { ProjectRepository } from '../../domain/ports/project.repository.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import { PgProjectRepository } from '../../infrastructure/repositories/pg-project.repository.js';
import { PgTestRunRepository } from '../../infrastructure/repositories/pg-test-run.repository.js';

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool;
    repos: {
      projects: ProjectRepository;
      testRuns: TestRunRepository;
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
      testRuns: new PgTestRunRepository(pool),
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
