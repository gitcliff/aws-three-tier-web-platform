import { useMemo, useState } from 'react';
import { FilterTabs, type TaskFilter } from './components/FilterTabs';
import { TaskForm } from './components/TaskForm';
import { TaskItem } from './components/TaskItem';
import { buttonStyles, cardStyles } from './components/ui';
import { useTasks } from './hooks/useTasks';

const EMPTY_MESSAGES: Record<TaskFilter, string> = {
  all: 'No tasks yet. Add your first one above.',
  pending: 'Nothing pending. Nice work!',
  completed: 'No completed tasks yet.',
};

export function App() {
  const { tasks, loadState, loadError, reload, createTask, updateTask, deleteTask } = useTasks();
  const [filter, setFilter] = useState<TaskFilter>('all');

  // The full list is small, so filtering client-side keeps the tab counts exact and
  // switching tabs instant, without extra requests.
  const counts = useMemo(() => {
    const completed = tasks.filter((t) => t.status === 'completed').length;
    return { all: tasks.length, pending: tasks.length - completed, completed };
  }, [tasks]);

  const visible = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tasks</h1>
        {loadState === 'ready' && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {counts.pending} pending · {counts.completed} completed
          </p>
        )}
      </header>

      <main className="space-y-6">
        <section aria-labelledby="new-task-heading" className={`${cardStyles} p-4 sm:p-6`}>
          <h2 id="new-task-heading" className="mb-3 text-base font-semibold">
            New task
          </h2>
          <TaskForm
            submitLabel="Add task"
            submittingLabel="Adding…"
            onSubmit={createTask}
            resetOnSuccess
          />
        </section>

        <section aria-labelledby="task-list-heading" className={`${cardStyles} p-4 sm:p-6`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="task-list-heading" className="text-base font-semibold">
              Your tasks
            </h2>
            {loadState === 'ready' && (
              <FilterTabs value={filter} counts={counts} onChange={setFilter} />
            )}
          </div>

          {loadState === 'loading' && (
            <div role="status" aria-label="Loading tasks" className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          )}

          {loadState === 'error' && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              <span>Could not load tasks. {loadError}</span>
              <button type="button" className={buttonStyles.secondary} onClick={reload}>
                Try again
              </button>
            </div>
          )}

          {loadState === 'ready' &&
            (visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {EMPTY_MESSAGES[filter]}
              </p>
            ) : (
              <ul className="space-y-3" aria-label={`${filter} tasks`}>
                {visible.map((task) => (
                  <TaskItem key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} />
                ))}
              </ul>
            ))}
        </section>
      </main>
    </div>
  );
}
