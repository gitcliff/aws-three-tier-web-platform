import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationError, runMigrations } from '../../src/db/migrator.js';
import { createTestPool, MIGRATIONS_DIR, resetSchema } from './test-db.js';

describe('migration runner', () => {
  const pool: pg.Pool = createTestPool();
  let scratch: string;

  beforeEach(async () => {
    await resetSchema(pool);
    scratch = await mkdtemp(join(tmpdir(), 'migrations-'));
    await cp(MIGRATIONS_DIR, scratch, { recursive: true });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies pending migrations once, then is a no-op', async () => {
    expect(await runMigrations(pool, MIGRATIONS_DIR)).toEqual(['001_create_tasks.sql']);
    expect(await runMigrations(pool, MIGRATIONS_DIR)).toEqual([]);

    const { rows } = await pool.query('SELECT version FROM schema_migrations');
    expect(rows).toEqual([{ version: '001_create_tasks.sql' }]);
  });

  it('is safe when two runners start at the same time', async () => {
    const results = await Promise.all([
      runMigrations(pool, MIGRATIONS_DIR),
      runMigrations(pool, MIGRATIONS_DIR),
    ]);
    expect(results.flat()).toEqual(['001_create_tasks.sql']);
  });

  it('refuses to continue when an applied migration was edited', async () => {
    await runMigrations(pool, scratch);
    await writeFile(join(scratch, '001_create_tasks.sql'), '-- edited\nSELECT 1;');

    await expect(runMigrations(pool, scratch)).rejects.toThrow(/was modified after being applied/);
  });

  it('rolls back a failing migration completely', async () => {
    await writeFile(
      join(scratch, '002_broken.sql'),
      'CREATE TABLE should_not_exist (id int);\nSELECT 1 / 0;',
    );

    await expect(runMigrations(pool, scratch)).rejects.toBeInstanceOf(MigrationError);

    const { rows } = await pool.query<{ exists: boolean; recorded: string[] }>(`
      SELECT to_regclass('should_not_exist') IS NOT NULL AS exists,
             array(SELECT version FROM schema_migrations ORDER BY version) AS recorded
    `);
    // 001 committed in its own transaction; 002 left no trace.
    expect(rows[0]).toEqual({ exists: false, recorded: ['001_create_tasks.sql'] });
  });

  it('rejects two migrations with the same number', async () => {
    await writeFile(join(scratch, '001_duplicate.sql'), 'SELECT 1;');
    await expect(runMigrations(pool, scratch)).rejects.toThrow(/Duplicate migration number 1/);
  });
});
