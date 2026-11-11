# Implementation Plan

The platform is built in reviewable phases. Each phase ends in a working, verified state
and is committed on its own.

## Target repository structure

```text
aws-three-tier-web-platform/
├── .github/workflows/
│   └── ci-cd.yml               # quality → security scans → image build/scan → ECR push (OIDC)
├── backend/                    # Application tier: Node.js + Express + TypeScript REST API
│   ├── src/
│   │   ├── config/             # env parsing and validation (fails fast on bad config)
│   │   ├── db/                 # pg Pool, migration runner
│   │   ├── middleware/         # error handler, request validation, 404
│   │   ├── tasks/              # routes → service → repository (parameterized SQL)
│   │   ├── app.ts              # Express app factory (no listen; testable)
│   │   └── server.ts           # process entrypoint, graceful shutdown
│   ├── tests/                  # unit tests + integration tests against real PostgreSQL
│   ├── .env.example
│   └── package.json / package-lock.json
├── frontend/                   # Presentation tier: React + TypeScript + Tailwind (Vite)
│   ├── src/
│   │   ├── api/                # typed API client
│   │   ├── components/         # TaskForm, TaskList, TaskItem, filters
│   │   └── hooks/              # useTasks state hook
│   ├── tests/
│   └── package.json / package-lock.json
├── database/
│   ├── init/                   # one-time role bootstrap (least-privilege app role)
│   └── migrations/             # versioned, forward-only SQL migrations
├── docker/
│   ├── backend.Dockerfile      # multi-stage, node:alpine, non-root
│   ├── frontend.Dockerfile     # multi-stage, unprivileged nginx, non-root
│   └── nginx.conf              # serves SPA, proxies /api to backend, security headers
├── infra/terraform/            # ECR repos + GitHub OIDC provider + least-privilege IAM role
├── docs/                       # architecture decisions, this plan, runbooks
├── docker-compose.yml          # db + migrate (one-shot) + api + web
├── .env.example                # compose-level variables (no real secrets)
├── .gitleaks.toml / .trivyignore
└── README.md
```

`infra/terraform/` is an addition to the requested layout: ECR repositories and IAM need to
be created somehow, and doing it as code is reviewable and repeatable, where console clicks are not.

## Phases

| Phase | Scope                                                                                           | Verified by                                                     |
| ----- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1     | Repo scaffold, Prettier, env example, PostgreSQL in Compose, roles, first migration             | DB healthy, migration applies, app role is DML-only             |
| 2     | Backend API: config, pool, migration runner, CRUD routes, validation, error handling            | ESLint, unit + integration tests (Vitest + Supertest), curl     |
| 3     | Frontend: Vite React app, Tailwind UI, API client, create/edit/toggle/delete/filter             | ESLint, component tests (Vitest + Testing Library), browser run |
| 4     | Containerization: multi-stage Dockerfiles, nginx, full Compose with health checks + migrate job | `docker compose up`, end-to-end smoke test, local Trivy scan    |
| 5     | CI/CD: GitHub Actions with Prettier, lint, tests, Gitleaks, Trivy SCA/fs/config/image, ECR push | `actionlint`, local dry runs of each scanner                    |
| 6     | AWS: Terraform for ECR (scan on push, immutable tags) + OIDC provider + least-privilege role    | `terraform validate` / `fmt` / plan                             |
| 7     | Documentation: full README with Mermaid diagram, env reference, pipeline, AWS setup, security   | Review                                                          |

## Key decisions

**Separate lockfiles per tier (no npm workspaces).** Each tier is built and containerized
independently. A Docker build of `backend/` needs only `backend/package-lock.json`, so image
builds stay small and cache well, and a frontend dependency change never invalidates the
backend image.

**Plain SQL migrations plus a small runner.** Migrations are reviewable `.sql` files in
`database/migrations`. The backend ships a ~50-line runner that applies pending files in
order, each inside a transaction, recording them in `schema_migrations` under an advisory
lock so concurrent starts are safe. In Compose this runs as a one-shot `migrate` service
before the API starts, so the long-running API process never needs DDL rights. Migrations
are forward-only: a change is undone with a new migration, which matches how production
databases are actually changed.

**Two database roles.**

- `POSTGRES_USER` (owner) owns the schema and runs migrations.
- `APP_DB_USER` is what the API uses: `CONNECT` plus `SELECT/INSERT/UPDATE/DELETE` through
  default privileges. It cannot create, alter or drop objects.

A SQL injection bug in the API therefore cannot drop tables or change the schema.

**Validation in two layers.** The API validates input with Zod and returns clean 400s. The
database repeats the important rules as `CHECK` constraints (non-blank title, length limits,
status enum), so bad data cannot get in through any other path either.

**`status` as `TEXT` + `CHECK`, not a PostgreSQL `ENUM`.** It is just as strict, and adding a
value later is a one-line constraint change rather than an `ALTER TYPE`, which has
transaction caveats.

**`updated_at` maintained by trigger**, so it is correct whatever code path writes the row.

**Secrets only through the environment.** Compose reads them from a git-ignored `.env`, and
`${VAR:?}` makes Compose refuse to start if one is missing rather than silently using a
default. Images never contain `.env` files (see `.dockerignore` in Phase 4). The database
port is bound to `127.0.0.1` only.
