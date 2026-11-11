import { vi } from 'vitest';
import type { Task } from '../src/api/types';

/**
 * In-memory stand-in for the task API behind `fetch`. UI tests run the real API client, hook
 * and components against it, so they exercise the same request/response contract as the
 * backend without a server.
 */

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Failure {
  method: Method;
  status?: number;
  body?: unknown;
  network?: boolean;
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let clock = Date.UTC(2026, 0, 1);
export function makeTask(overrides: Partial<Task> = {}): Task {
  clock += 60_000;
  const at = new Date(clock).toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'A task',
    description: '',
    status: 'pending',
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export function installFakeApi(initial: Task[] = []) {
  let tasks = [...initial];
  const failures: Failure[] = [];
  const requests: { method: Method; path: string; body: unknown }[] = [];

  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const method = (init.method ?? 'GET') as Method;
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: url.pathname + url.search, body });

    const failureIndex = failures.findIndex((f) => f.method === method);
    if (failureIndex >= 0) {
      const [failure] = failures.splice(failureIndex, 1);
      if (failure?.network) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(json(failure?.status ?? 500, failure?.body));
    }

    const id = /^\/api\/tasks\/([^/]+)$/.exec(url.pathname)?.[1];
    const index = id ? tasks.findIndex((t) => t.id === id) : -1;
    const notFound = () => json(404, { error: { code: 'NOT_FOUND', message: 'Task not found' } });

    if (url.pathname === '/api/tasks' && method === 'GET') {
      return Promise.resolve(json(200, { data: tasks }));
    }
    if (url.pathname === '/api/tasks' && method === 'POST') {
      const task = makeTask(body as Partial<Task>);
      tasks = [task, ...tasks];
      return Promise.resolve(json(201, { data: task }));
    }
    if (id && method === 'PATCH') {
      if (index < 0) return Promise.resolve(notFound());
      const updated = { ...tasks[index]!, ...(body as Partial<Task>) };
      tasks[index] = updated;
      return Promise.resolve(json(200, { data: updated }));
    }
    if (id && method === 'DELETE') {
      if (index < 0) return Promise.resolve(notFound());
      tasks.splice(index, 1);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(json(404, { error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    fetch: fetchMock,
    requests,
    get tasks() {
      return tasks;
    },
    /** The next request with this method fails with the given HTTP response. */
    failNext(method: Method, status: number, body?: unknown) {
      failures.push({ method, status, body });
    },
    /** The next request with this method fails at the network level. */
    failNextNetwork(method: Method) {
      failures.push({ method, network: true });
    },
  };
}
