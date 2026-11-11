import { useState } from 'react';
import { ApiError } from '../api/client';
import type { Task, TaskInput, TaskUpdate } from '../api/types';
import { TaskForm } from './TaskForm';
import { buttonStyles } from './ui';

interface TaskItemProps {
  task: Task;
  onUpdate: (id: string, patch: TaskUpdate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type Mode = 'view' | 'edit' | 'confirm-delete';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function TaskItem({ task, onUpdate, onDelete }: TaskItemProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = task.status === 'completed';

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const toggle = () =>
    run(
      () => onUpdate(task.id, { status: completed ? 'pending' : 'completed' }),
      'Could not update the task.',
    );

  const remove = () =>
    run(async () => {
      await onDelete(task.id);
    }, 'Could not delete the task.');

  async function save(values: TaskInput) {
    await onUpdate(task.id, values); // errors are shown by TaskForm
    setMode('view');
  }

  if (mode === 'edit') {
    return (
      <li className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
        <TaskForm
          initialValues={{ title: task.title, description: task.description }}
          submitLabel="Save"
          submittingLabel="Saving…"
          onSubmit={save}
          onCancel={() => setMode('view')}
          autoFocus
        />
      </li>
    );
  }

  return (
    <li
      className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      aria-busy={busy}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-indigo-600 disabled:cursor-wait"
            checked={completed}
            onChange={toggle}
            disabled={busy}
            aria-label={`Mark "${task.title}" as ${completed ? 'pending' : 'completed'}`}
          />
          <div className="min-w-0 flex-1">
            <p
              className={`font-medium break-words ${completed ? 'text-slate-400 line-through dark:text-slate-500' : ''}`}
            >
              {task.title}
            </p>
            {task.description && (
              <p className="mt-1 text-sm break-words whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                {task.description}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Created{' '}
              <time dateTime={task.createdAt}>{dateFormat.format(new Date(task.createdAt))}</time>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1">
          {mode === 'confirm-delete' ? (
            <>
              <span className="mr-1 text-sm text-slate-600 dark:text-slate-400">Delete?</span>
              <button
                type="button"
                className={buttonStyles.danger}
                onClick={remove}
                disabled={busy}
                aria-label={`Confirm delete "${task.title}"`}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={() => setMode('view')}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={buttonStyles.ghost}
                onClick={() => setMode('edit')}
                disabled={busy}
                aria-label={`Edit "${task.title}"`}
              >
                Edit
              </button>
              <button
                type="button"
                className={buttonStyles.dangerGhost}
                onClick={() => setMode('confirm-delete')}
                disabled={busy}
                aria-label={`Delete "${task.title}"`}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}
