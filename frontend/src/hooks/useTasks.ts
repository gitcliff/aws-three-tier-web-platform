import { useCallback, useEffect, useState } from 'react';
import { ApiError, tasksApi, type TasksApi } from '../api/client';
import type { Task, TaskInput, TaskUpdate } from '../api/types';

export type LoadState = 'loading' | 'ready' | 'error';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Owns the task list. The server is the source of truth: each mutation waits for the API's
 * response and then stores the returned task, so the UI never shows a state the server
 * rejected. Mutations reject with ApiError so the component that started them can show the
 * error next to the relevant form or task.
 */
export function useTasks(api: TasksApi = tasksApi) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Ignore a response that arrives after unmount or after a newer reload started.
    let current = true;
    api.list().then(
      (list) => {
        if (!current) return;
        setTasks(list);
        setLoadState('ready');
      },
      (err: unknown) => {
        if (!current) return;
        setLoadError(messageOf(err));
        setLoadState('error');
      },
    );
    return () => {
      current = false;
    };
  }, [api, reloadKey]);

  const reload = useCallback(() => {
    setLoadState('loading');
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const createTask = useCallback(
    async (input: TaskInput) => {
      const task = await api.create(input);
      setTasks((list) => [task, ...list]);
    },
    [api],
  );

  const updateTask = useCallback(
    async (id: string, patch: TaskUpdate) => {
      const task = await api.update(id, patch);
      setTasks((list) => list.map((t) => (t.id === id ? task : t)));
    },
    [api],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await api.remove(id);
      } catch (err) {
        // Already gone on the server (e.g. deleted in another tab): treat as success.
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      setTasks((list) => list.filter((t) => t.id !== id));
    },
    [api],
  );

  return { tasks, loadState, loadError, reload, createTask, updateTask, deleteTask };
}
