import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { runMigrations } from '../../src/db/migrator.js';
import { createLogger } from '../../src/logger.js';
import { PgTaskRepository } from '../../src/tasks/task.repository.js';
import { createTestPool, MIGRATIONS_DIR, resetSchema } from './test-db.js';

/** End-to-end through HTTP → service → PgTaskRepository → real PostgreSQL. */
describe('Tasks API with PostgreSQL', () => {
  const pool: pg.Pool = createTestPool();
  let app: Express;

  beforeAll(async () => {
    await resetSchema(pool);
    await runMigrations(pool, MIGRATIONS_DIR);
    app = createApp({
      logger: createLogger('silent'),
      taskRepository: new PgTaskRepository(pool),
      checkDatabase: async () => {
        await pool.query('SELECT 1');
      },
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE tasks');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('runs the full create → read → update → delete lifecycle', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Ship phase 2', description: 'backend' })
      .expect(201);
    const task = created.body.data;
    expect(task).toMatchObject({
      title: 'Ship phase 2',
      description: 'backend',
      status: 'pending',
    });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(task.createdAt).toString()).not.toBe('Invalid Date');

    await request(app).get(`/api/tasks/${task.id}`).expect(200);

    const updated = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'completed' })
      .expect(200);
    expect(updated.body.data.status).toBe('completed');
    expect(updated.body.data.title).toBe('Ship phase 2');
    // Maintained by the database trigger.
    expect(new Date(updated.body.data.updatedAt).getTime()).toBeGreaterThan(
      new Date(task.updatedAt).getTime(),
    );

    await request(app).delete(`/api/tasks/${task.id}`).expect(204);
    await request(app).get(`/api/tasks/${task.id}`).expect(404);
    await request(app).delete(`/api/tasks/${task.id}`).expect(404);
  });

  it('lists newest first and filters by status', async () => {
    await request(app).post('/api/tasks').send({ title: 'a' }).expect(201);
    await request(app).post('/api/tasks').send({ title: 'b', status: 'completed' }).expect(201);
    await request(app).post('/api/tasks').send({ title: 'c' }).expect(201);

    const all = await request(app).get('/api/tasks').expect(200);
    expect(all.body.data.map((t: { title: string }) => t.title)).toEqual(['c', 'b', 'a']);

    const completed = await request(app).get('/api/tasks?status=completed').expect(200);
    expect(completed.body.data.map((t: { title: string }) => t.title)).toEqual(['b']);
  });

  it('stores hostile-looking input as plain data (parameterized SQL)', async () => {
    const title = "Robert'); DROP TABLE tasks; --";
    const res = await request(app).post('/api/tasks').send({ title }).expect(201);
    expect(res.body.data.title).toBe(title);

    const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM tasks');
    expect(rows[0]?.count).toBe('1');
  });

  it('keeps unicode text intact', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Café ☕ 日本語', description: 'émoji 🚀' })
      .expect(201);
    const fetched = await request(app).get(`/api/tasks/${res.body.data.id}`).expect(200);
    expect(fetched.body.data).toMatchObject({ title: 'Café ☕ 日本語', description: 'émoji 🚀' });
  });

  it('reports ready when the database answers', async () => {
    await request(app).get('/health/ready').expect(200);
  });
});
