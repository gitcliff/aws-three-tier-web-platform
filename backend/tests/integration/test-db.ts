import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../database/migrations', import.meta.url),
);

/**
 * Opens a pool to the integration-test database. The tests drop and truncate tables, so as a
 * guard against pointing them at real data the database name must end in "_test".
 */
export function createTestPool(): pg.Pool {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need a disposable PostgreSQL database, ' +
        'e.g. postgres://user:pass@localhost:5432/taskdb_test',
    );
  }

  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${database}": name must end in _test`,
    );
  }

  return new pg.Pool({ connectionString: url, max: 4 });
}

/** Removes every object the migrations create, returning the database to empty. */
export async function resetSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS tasks, schema_migrations, should_not_exist CASCADE;
    DROP FUNCTION IF EXISTS set_updated_at();
  `);
}
