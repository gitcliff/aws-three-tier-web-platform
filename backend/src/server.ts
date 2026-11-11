/**
 * Process entrypoint: wires real dependencies, starts listening, and shuts down cleanly on
 * SIGTERM (what `docker stop` and orchestrators send) so in-flight requests can finish.
 */
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createPool } from './db/pool.js';
import { createLogger } from './logger.js';
import { PgTaskRepository } from './tasks/task.repository.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const pool = createPool(config.db, {
    onIdleError: (err) => logger.error({ err }, 'idle database client error'),
  });

  const app = createApp({
    logger,
    taskRepository: new PgTaskRepository(pool),
    checkDatabase: async () => {
      await pool.query('SELECT 1');
    },
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'task-api listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Hard stop if connections refuse to drain in time.
    setTimeout(() => {
      logger.error('graceful shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close((closeErr) => {
      if (closeErr) logger.error({ err: closeErr }, 'error closing HTTP server');
      pool
        .end()
        .catch((err: unknown) => logger.error({ err }, 'error closing database pool'))
        .finally(() => {
          logger.info('shutdown complete');
          process.exit(closeErr ? 1 : 0);
        });
    });
    server.closeIdleConnections();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

try {
  main();
} catch (err) {
  // Config errors are expected operator mistakes: print the message, not a stack trace.
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}
