import pg from 'pg';
import type { DbConfig } from '../config/env.js';

export interface PoolOptions {
  /** Server-side cap on any single statement. 0 disables it (used for migrations). */
  statementTimeoutMs?: number;
  /** Overrides the configured pool size (the migration runner needs one connection). */
  max?: number;
  /** Errors on idle clients (e.g. the database restarting) are reported here instead of crashing. */
  onIdleError?: (err: Error) => void;
}

export function createPool(db: DbConfig, options: PoolOptions = {}): pg.Pool {
  const pool = new pg.Pool({
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password,
    // When TLS is on, the server certificate is always verified. For a private CA such as
    // Amazon RDS, supply its bundle through NODE_EXTRA_CA_CERTS rather than disabling checks.
    ssl: db.ssl ? { rejectUnauthorized: true } : false,
    max: options.max ?? db.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: options.statementTimeoutMs ?? 10_000,
    application_name: 'task-api',
  });

  pool.on('error', (err) => options.onIdleError?.(err));
  return pool;
}
