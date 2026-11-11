/** Shared Tailwind class sets, so buttons and inputs look the same everywhere. */

const buttonBase =
  'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const buttonStyles = {
  primary: `${buttonBase} bg-indigo-600 text-white hover:bg-indigo-500`,
  secondary:
    `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 ` +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  ghost:
    `${buttonBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900 ` +
    'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger: `${buttonBase} bg-red-600 text-white hover:bg-red-500`,
  dangerGhost: `${buttonBase} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`,
};

export const inputStyles =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm ' +
  'placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 ' +
  'focus:ring-indigo-500/30 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/30 ' +
  'dark:border-slate-700 dark:bg-slate-900';

export const cardStyles =
  'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';
