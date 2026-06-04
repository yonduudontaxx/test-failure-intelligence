import { buildApp } from './app.js';
import { config } from './config.js';
import { createPool } from './database/create-pool.js';

async function start(): Promise<void> {
  const pool = createPool(config);
  const app = await buildApp({ pool });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutdown initiated');
    try {
      await app.close();
      app.log.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    await pool.end();
    process.exit(1);
  }
}

void start();
