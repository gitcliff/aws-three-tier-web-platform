# task-api (application tier)

Express 5 + TypeScript REST API for the task manager, backed by PostgreSQL.

## Layout

```text
src/
├── config/env.ts        # validates environment variables once at startup (Zod)
├── db/pool.ts           # pg connection pool (timeouts, TLS verification)
├── db/migrator.ts       # forward-only SQL migration runner (advisory lock + checksums)
├── http/                # input validation helper, centralised error + 404 handlers
├── tasks/               # schema → routes → service → repository
├── app.ts               # Express app factory (no I/O; used directly by tests)
├── server.ts            # entrypoint: wiring, listen, graceful SIGTERM shutdown
└── migrate.ts           # one-shot migration entrypoint
```

Requests flow `routes` (HTTP, validation) → `service` (business rules, NotFound) →
`repository` (SQL). Every layer depends only on the one below it, through interfaces, which is
what lets the unit tests swap PostgreSQL for an in-memory repository.

## API

| Method | Path                                            | Success                                 | Errors   |
| ------ | ----------------------------------------------- | --------------------------------------- | -------- |
| GET    | `/api/tasks?status=pending\|completed`          | 200 `{ data: Task[] }`                  | 400      |
| POST   | `/api/tasks` `{ title, description?, status? }` | 201 `{ data: Task }`, `Location` header | 400      |
| GET    | `/api/tasks/:id`                                | 200 `{ data: Task }`                    | 400, 404 |
| PATCH  | `/api/tasks/:id` (any subset of fields)         | 200 `{ data: Task }`                    | 400, 404 |
| DELETE | `/api/tasks/:id`                                | 204                                     | 400, 404 |
| GET    | `/health/live`                                  | 200 (process is up)                     |          |
| GET    | `/health/ready`                                 | 200 (database reachable)                | 503      |

Errors always look like
`{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "path": "title", "message": "..." }] } }`.
Unexpected failures return a generic `INTERNAL_ERROR` and are logged with the request id
(echoed in the `X-Request-Id` response header).

## Running locally

Start PostgreSQL from the repository root (needs a filled-in root `.env`):

```bash
docker compose up -d db
```

Then, in `backend/`:

```bash
cp .env.example .env        # set DB_PASSWORD to APP_DB_PASSWORD from the root .env
npm ci
DB_USER=task_owner DB_PASSWORD=<POSTGRES_PASSWORD> npm run migrate:dev   # as schema owner
npm run dev                 # http://localhost:4000, pretty logs, reloads on change
```

## Tests and checks

```bash
npm run typecheck
npm run lint
npm test                    # unit tests, no database needed
npm run test:integration    # needs TEST_DATABASE_URL pointing at a database named *_test
```

Create the integration database once:

```bash
docker compose exec db psql -U task_owner -d taskdb -c 'CREATE DATABASE taskdb_test'
```

## Environment variables

| Variable         | Default                  | Notes                                            |
| ---------------- | ------------------------ | ------------------------------------------------ |
| `NODE_ENV`       | `production`             | `development` \| `test` \| `production`          |
| `PORT`           | `4000`                   |                                                  |
| `LOG_LEVEL`      | `info`                   | pino level, or `silent`                          |
| `DB_HOST`        | required                 |                                                  |
| `DB_PORT`        | `5432`                   |                                                  |
| `DB_NAME`        | required                 |                                                  |
| `DB_USER`        | required                 | app role at runtime; owner role for `migrate`    |
| `DB_PASSWORD`    | required                 | never logged or echoed in config errors          |
| `DB_SSL`         | `false`                  | `true` enables TLS with certificate verification |
| `DB_POOL_MAX`    | `10`                     |                                                  |
| `MIGRATIONS_DIR` | `../database/migrations` | path to the SQL files                            |
