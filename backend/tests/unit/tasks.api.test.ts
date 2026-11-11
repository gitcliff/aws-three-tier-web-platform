import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildTestApp } from '../helpers/build-app.js';

const MISSING_ID = '3f1c2a7e-8b4d-4c6e-9a1b-2d3e4f5a6b7c';

describe('Tasks API', () => {
  let app: Express;

  beforeEach(() => {
    app = buildTestApp();
  });

  async function createTask(body: object) {
    const res = await request(app).post('/api/tasks').send(body).expect(201);
    return res.body.data as { id: string; status: string; updatedAt: string };
  }

  it('starts with an empty list', async () => {
    const res = await request(app).get('/api/tasks').expect(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('creates a task and returns its location', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Write tests', description: 'for the API' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      title: 'Write tests',
      description: 'for the API',
      status: 'pending',
    });
    expect(res.headers.location).toBe(`/api/tasks/${res.body.data.id}`);
  });

  it('fetches a task by id', async () => {
    const task = await createTask({ title: 'Fetch me' });
    const res = await request(app).get(`/api/tasks/${task.id}`).expect(200);
    expect(res.body.data.title).toBe('Fetch me');
  });

  it('lists newest first and filters by status', async () => {
    const first = await createTask({ title: 'first' });
    await createTask({ title: 'second', status: 'completed' });

    const all = await request(app).get('/api/tasks').expect(200);
    expect(all.body.data.map((t: { title: string }) => t.title)).toEqual(['second', 'first']);

    const pending = await request(app).get('/api/tasks?status=pending').expect(200);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0].id).toBe(first.id);
  });

  it('marks a task completed and back to pending', async () => {
    const task = await createTask({ title: 'Toggle me' });

    const done = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'completed' })
      .expect(200);
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.updatedAt).not.toBe(task.updatedAt);

    const undone = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'pending' })
      .expect(200);
    expect(undone.body.data.status).toBe('pending');
  });

  it('updates title and description', async () => {
    const task = await createTask({ title: 'Old' });
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'New', description: 'details' })
      .expect(200);
    expect(res.body.data).toMatchObject({ title: 'New', description: 'details' });
  });

  it('deletes a task', async () => {
    const task = await createTask({ title: 'Delete me' });
    await request(app).delete(`/api/tasks/${task.id}`).expect(204);
    await request(app).get(`/api/tasks/${task.id}`).expect(404);
  });

  describe('errors', () => {
    it('returns 400 with field details for invalid input', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([{ path: 'title', message: 'Title is required' }]);
    });

    it('names unknown fields in the error details', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'ok', priority: 1, id: 'x' })
        .expect(400);
      expect(res.body.error.details).toEqual([
        { path: 'priority', message: 'Unknown field' },
        { path: 'id', message: 'Unknown field' },
      ]);
    });

    it('returns 400 for an invalid status filter', async () => {
      const res = await request(app).get('/api/tasks?status=done').expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for a malformed id', async () => {
      const res = await request(app).get('/api/tasks/not-a-uuid').expect(400);
      expect(res.body.error.details[0].path).toBe('id');
    });

    it('returns 400 for an empty update', async () => {
      const task = await createTask({ title: 'x' });
      await request(app).patch(`/api/tasks/${task.id}`).send({}).expect(400);
    });

    it.each([
      ['GET', 'get'],
      ['PATCH', 'patch'],
      ['DELETE', 'delete'],
    ] as const)('returns 404 for %s on a missing task', async (_name, method) => {
      const res = await request(app)[method](`/api/tasks/${MISSING_ID}`).send({ title: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Task not found' });
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{"title": ')
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('returns 413 for an oversized body', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'x', description: 'y'.repeat(20_000) })
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('returns 404 JSON for unknown routes', async () => {
      const res = await request(app).get('/api/nope').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('HTTP hardening', () => {
    it('sets security headers and hides the framework', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('propagates a well-formed request id and replaces a malformed one', async () => {
      const good = await request(app).get('/health/live').set('X-Request-Id', 'abc-123');
      expect(good.headers['x-request-id']).toBe('abc-123');

      const bad = await request(app).get('/health/live').set('X-Request-Id', 'bad id\twith spaces');
      expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
