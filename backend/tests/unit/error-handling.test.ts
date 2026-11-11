import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { TaskRepository } from '../../src/tasks/task.repository.js';
import { buildTestApp } from '../helpers/build-app.js';
import { InMemoryTaskRepository } from '../helpers/in-memory-task-repository.js';

/** A repository whose list() fails with the given error. */
function failingRepository(error: unknown): TaskRepository {
  const repo = new InMemoryTaskRepository();
  repo.list = () => Promise.reject(error);
  return repo;
}

describe('centralised error handling', () => {
  it('hides internal details of unexpected errors', async () => {
    const leak = new Error('relation "tasks" does not exist at db.internal:5432');
    const app = buildTestApp({ taskRepository: failingRepository(leak) });

    const res = await request(app).get('/api/tasks').expect(500);

    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(JSON.stringify(res.body)).not.toContain('db.internal');
  });

  it('maps a database constraint violation to 400', async () => {
    const pgError = Object.assign(new Error('violates check constraint'), { code: '23514' });
    const app = buildTestApp({ taskRepository: failingRepository(pgError) });

    const res = await request(app).get('/api/tasks').expect(400);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });

  it('maps an unreachable database to 503', async () => {
    const connError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const app = buildTestApp({ taskRepository: failingRepository(connError) });

    const res = await request(app).get('/api/tasks').expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('health endpoints', () => {
  it('liveness does not depend on the database', async () => {
    const app = buildTestApp({ checkDatabase: () => Promise.reject(new Error('down')) });
    await request(app).get('/health/live').expect(200, { status: 'ok' });
  });

  it('readiness reports 503 when the database is unreachable', async () => {
    const app = buildTestApp({ checkDatabase: () => Promise.reject(new Error('down')) });
    const res = await request(app).get('/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'unavailable', database: 'unreachable' });
  });

  it('readiness reports 200 when the database answers', async () => {
    const app = buildTestApp();
    await request(app).get('/health/ready').expect(200, { status: 'ok', database: 'ok' });
  });
});
