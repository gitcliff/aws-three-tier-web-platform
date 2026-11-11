import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';

/**
 * Minimal forward-only migration runner.
 *
 * - Files in `dir` named `<number>_<name>.sql` are applied in numeric order.
 * - Each file runs in its own transaction together with its bookkeeping row, so a failed
 *   migration leaves no partial schema behind.
 * - A session-level advisory lock serialises concurrent runners (e.g. two replicas starting).
 * - A SHA-256 checksum of every applied file is stored; editing a migration after it has
 *   been applied is an error, because it would make environments silently diverge.
 */

const MIGRATION_FILE = /^(\d+)_[\w-]+\.sql$/;
// Arbitrary constant identifying this application's migration lock.
const ADVISORY_LOCK_ID = 7_314_002;

interface MigrationFile {
  version: string;
  order: number;
  path: string;
}

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

async function listMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const files: MigrationFile[] = [];

  for (const name of entries) {
    const match = MIGRATION_FILE.exec(name);
    if (match?.[1] === undefined) continue;
    files.push({ version: name, order: Number(match[1]), path: join(dir, name) });
  }

  files.sort((a, b) => a.order - b.order);

  for (let i = 1; i < files.length; i++) {
    const prev = files[i - 1];
    const curr = files[i];
    if (prev && curr && prev.order === curr.order) {
      throw new MigrationError(
        `Duplicate migration number ${curr.order}: ${prev.version}, ${curr.version}`,
      );
    }
  }
  return files;
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/** Applies pending migrations and returns the versions applied by this call. */
export async function runMigrations(pool: pg.Pool, dir: string): Promise<string[]> {
  const migrations = await listMigrations(dir);
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT        PRIMARY KEY,
        checksum   TEXT        NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const alreadyApplied = new Map(rows.map((row) => [row.version, row.checksum]));
    const appliedNow: string[] = [];

    for (const migration of migrations) {
      const sql = await readFile(migration.path, 'utf8');
      const sum = checksum(sql);
      const recorded = alreadyApplied.get(migration.version);

      if (recorded !== undefined) {
        if (recorded !== sum) {
          throw new MigrationError(
            `Migration ${migration.version} was modified after being applied. ` +
              'Revert the edit and add a new migration instead.',
          );
        }
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          migration.version,
          sum,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        const reason = err instanceof Error ? err.message : String(err);
        throw new MigrationError(`Migration ${migration.version} failed: ${reason}`, {
          cause: err,
        });
      }
      appliedNow.push(migration.version);
    }

    return appliedNow;
  } finally {
    // Unlock explicitly; if the connection is broken the lock is released with the session.
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
