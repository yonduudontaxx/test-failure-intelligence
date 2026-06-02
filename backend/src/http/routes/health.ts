import { type FastifyInstance } from 'fastify';
import { testConnection } from '../../database/client.js';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'] },
              database: { type: 'string', enum: ['connected', 'disconnected'] },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['status', 'database', 'timestamp'],
          },
        },
      },
    },
    async () => {
      const connected = await testConnection();
      return {
        status: 'ok' as const,
        database: connected ? ('connected' as const) : ('disconnected' as const),
        timestamp: new Date().toISOString(),
      };
    },
  );
}
