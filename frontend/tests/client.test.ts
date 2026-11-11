import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, tasksApi } from '../src/api/client';
import { installFakeApi, makeTask } from './fake-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tasksApi', () => {
  it('lists tasks from the data envelope', async () => {
    const task = makeTask({ title: 'Listed' });
    installFakeApi([task]);
    await expect(tasksApi.list()).resolves.toEqual([task]);
  });

  it('passes the status filter as a query parameter', async () => {
    const api = installFakeApi();
    await tasksApi.list('completed');
    expect(api.requests[0]?.path).toBe('/api/tasks?status=completed');
  });

  it('sends JSON with the right headers when creating', async () => {
    const api = installFakeApi();
    const task = await tasksApi.create({ title: 'New', description: 'd' });

    expect(task).toMatchObject({ title: 'New', description: 'd' });
    const [, init] = api.fetch.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(api.requests[0]?.body).toEqual({ title: 'New', description: 'd' });
  });

  it('resolves a 204 delete with no body', async () => {
    const task = makeTask();
    installFakeApi([task]);
    await expect(tasksApi.remove(task.id)).resolves.toBeUndefined();
  });

  it('encodes the task id in the URL', async () => {
    const api = installFakeApi();
    await tasksApi.remove('a/b?c').catch(() => undefined);
    expect(api.requests[0]?.path).toBe('/api/tasks/a%2Fb%3Fc');
  });

  it('turns an error envelope into an ApiError with field details', async () => {
    const api = installFakeApi();
    api.failNext('POST', 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ path: 'title', message: 'Title is required' }],
      },
    });

    const error = await tasksApi.create({ title: '', description: '' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'title', message: 'Title is required' }],
    });
  });

  it('copes with a non-JSON error page from a proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>Bad Gateway</html>', { status: 502 }))),
    );
    await expect(tasksApi.list()).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'The server had a problem. Please try again.',
    });
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    const api = installFakeApi();
    api.failNextNetwork('GET');
    await expect(tasksApi.list()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
