import type { FieldIssue, Task, TaskInput, TaskStatus, TaskUpdate } from './types';

/**
 * Same-origin, relative base path. In development Vite proxies it to the API, and in
 * containers nginx does. The browser never needs to know where the API actually runs, and
 * since requests stay same-origin, the API needs no CORS configuration.
 */
const API_BASE = '/api';

/** An API failure in a form the UI can show: a message, plus per-field issues for 400s. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

function isFieldIssue(value: unknown): value is FieldIssue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FieldIssue).path === 'string' &&
    typeof (value as FieldIssue).message === 'string'
  );
}

function toApiError(status: number, body: unknown): ApiError {
  const error = (body as ErrorEnvelope | null)?.error;
  const code = typeof error?.code === 'string' ? error.code : 'HTTP_ERROR';
  const message =
    typeof error?.message === 'string'
      ? error.message
      : status >= 500
        ? 'The server had a problem. Please try again.'
        : `Request failed (${status})`;
  const details = Array.isArray(error?.details) ? error.details.filter(isFieldIssue) : [];
  return new ApiError(status, code, message, details);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  if (response.status === 204) return undefined as T;

  // A proxy can answer with HTML (e.g. a 502 page), so a JSON parse failure is not fatal here.
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);
const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

export const tasksApi = {
  async list(status?: TaskStatus): Promise<Task[]> {
    const query = status ? `?status=${status}` : '';
    return (await request<{ data: Task[] }>(`/tasks${query}`)).data;
  },

  async create(input: TaskInput): Promise<Task> {
    return (await request<{ data: Task }>('/tasks', { method: 'POST', body: json(input) })).data;
  },

  async update(id: string, patch: TaskUpdate): Promise<Task> {
    return (await request<{ data: Task }>(taskPath(id), { method: 'PATCH', body: json(patch) }))
      .data;
  },

  async remove(id: string): Promise<void> {
    await request<void>(taskPath(id), { method: 'DELETE' });
  },
};

export type TasksApi = typeof tasksApi;
