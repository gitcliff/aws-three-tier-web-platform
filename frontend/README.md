# task-web (presentation tier)

React 19 + TypeScript + Tailwind CSS 4 single-page app, built with Vite.

## Layout

```text
src/
├── api/client.ts        # typed fetch wrapper → ApiError (message + per-field details)
├── api/types.ts         # wire types matching the backend API
├── hooks/useTasks.ts    # task list state + create/update/delete actions
├── lib/validation.ts    # client-side checks mirroring the API limits
├── components/          # TaskForm (create + edit), TaskItem, FilterTabs, shared styles
├── App.tsx              # page layout, filtering, loading / empty / error states
└── main.tsx
tests/                   # Vitest + Testing Library, against an in-memory fake API
```

## How it talks to the API

The browser always calls the **relative** path `/api/...`:

- in development, the Vite dev server proxies `/api` to `API_PROXY_TARGET`;
- in containers (Phase 4), nginx serves the built files and proxies `/api` to the backend.

So the bundle contains no URLs, hostnames or secrets, the same build runs in every
environment, and browser requests are same-origin, which means the API needs no CORS setup.

The server is the source of truth: the UI waits for each API response before updating, and
shows errors where they happened (next to a form field, under a task, or as a retryable
load error).

## Running locally

With the API running on port 4000 (see `backend/README.md`):

```bash
npm ci
npm run dev        # http://localhost:5173
```

If the API is elsewhere, copy `.env.example` to `.env` and set `API_PROXY_TARGET`.

## Scripts

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | dev server with hot reload and the `/api` proxy |
| `npm run build`     | type-check, then build static files to `dist/`  |
| `npm run typecheck` | `tsc --noEmit`                                  |
| `npm run lint`      | ESLint (type-aware + React hooks rules)         |
| `npm test`          | Vitest component and client tests               |

## Environment variables

| Variable           | Default                 | Used by                                 |
| ------------------ | ----------------------- | --------------------------------------- |
| `API_PROXY_TARGET` | `http://localhost:4000` | Vite dev server only; not in the bundle |
