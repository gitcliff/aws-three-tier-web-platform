export type TaskFilter = 'all' | 'pending' | 'completed';

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

interface FilterTabsProps {
  value: TaskFilter;
  counts: Record<TaskFilter, number>;
  onChange: (filter: TaskFilter) => void;
}

export function FilterTabs({ value, counts, onChange }: FilterTabsProps) {
  return (
    <div
      role="group"
      aria-label="Filter tasks"
      className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
    >
      {FILTERS.map((filter) => {
        const active = filter.value === value;
        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {filter.label}
            <span className="ml-1.5 text-xs text-slate-400 tabular-nums">
              {counts[filter.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
