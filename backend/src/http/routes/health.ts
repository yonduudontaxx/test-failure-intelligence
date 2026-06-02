import { type FastifyInstance } from 'fastify';

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
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['status', 'timestamp'],
          },
        },
      },
    },
    async () => {
      return { status: 'ok' as const, timestamp: new Date().toISOString() };
    },
  );
}
