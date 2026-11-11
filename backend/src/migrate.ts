/**
 * One-shot migration entrypoint (`npm run migrate`). Runs as its own short-lived process,
 * normally with the schema-owner credentials, so the long-running API never needs DDL rights.
 */
import { resolve } from 'node:path';
import { ConfigError, loadConfig } from './config/env.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrator.js';
import { createLogger } from './logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const dir = resolve(config.migrationsDir);
  const pool = createPool(config.db, { statementTimeoutMs: 0, max: 1 });

  try {
    const applied = await runMigrations(pool, dir);
    logger.info(
      { applied, dir },
      applied.length > 0 ? 'migrations applied' : 'database schema is up to date',
    );
  } catch (err) {
    logger.fatal({ err }, 'migration failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exitCode = 1;
});
