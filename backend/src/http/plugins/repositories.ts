import fp from 'fastify-plugin';
import type { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool;
  }
}

export interface RepositoriesPluginOptions {
  pool: Pool;
}

export default fp<RepositoriesPluginOptions>(
  async (fastify, { pool }) => {
    fastify.decorate('pool', pool);

    pool.on('error', (err) => {
      fastify.log.error({ err }, 'idle pool client error');
    });

    fastify.addHook('onClose', async () => {
      await pool.end();
    });
  },
  { name: 'repositories' },
);
