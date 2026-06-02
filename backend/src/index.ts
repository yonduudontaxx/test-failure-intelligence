import { buildApp } from './app.js';
import { config } from './config.js';

async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
