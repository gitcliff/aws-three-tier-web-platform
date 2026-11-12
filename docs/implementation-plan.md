# Implementation plan and decisions

The platform was built in reviewable phases. Each phase ended in a working, verified state
and was committed on its own. This document records what each phase delivered, how it was
verified, and the decisions behind it. The [README](../README.md) describes the result.

## Final repository structure

```text
aws-three-tier-web-platform/
├── .github/
│   ├── workflows/ci-cd.yml       # app: quality + security gates → image build/scan → ECR push (OIDC)
│   ├── workflows/terraform.yml   # infra: validate/test/scan → plan → approved apply
│   └── dependabot.yml
├── backend/                      # Application tier (Express 5 + TypeScript)
│   ├── src/
│   │   ├── config/               # env validation (fails fast, never echoes values)
│   │   ├── db/                   # pg pool, migration runner
│   │   ├── http/                 # input validation helper, error + 404 handlers
│   │   ├── tasks/                # schema → routes → service → repository
│   │   ├── app.ts                # Express app factory (no I/O; used by tests)
│   │   ├── server.ts             # entrypoint, graceful shutdown
│   │   └── migrate.ts            # one-shot migration entrypoint
│   └── tests/{unit,integration}/
├── frontend/                     # Presentation tier (Vite + React 19 + Tailwind 4)
│   ├── src/{api,hooks,lib,components}/
│   └── tests/
├── database/
│   ├── init/                     # first-boot creation of the least-privilege app role
│   └── migrations/               # forward-only SQL
├── docker/
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   └── nginx/                    # site template + security-header snippet
├── infra/
│   ├── bootstrap/                # admin-applied: state bucket, OIDC provider, pipeline roles, boundary
│   └── terraform/                # pipeline-applied: ECR repositories + image push role
├── docs/
├── docker-compose.yml
└── .env.example, .gitleaks.toml, .dockerignore, .prettierrc.json, .editorconfig, .nvmrc
```

Compared with the requested layout, `infra/` was added. ECR and IAM have to be created
somehow, and as code they are reviewable, tested and repeatable.

## Phases

| Phase | Delivered                                                                                              | Verified by                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1     | Scaffold, Prettier, env example, PostgreSQL in Compose, owner/app roles, first migration               | fresh-volume run: migration applies, app role DML-only (`DROP`/`CREATE`/`TRUNCATE` refused), data persists |
| 2     | Backend: config, pool, migration runner, CRUD API, validation, central error handling, health, logging | ESLint, 44 unit + 10 integration tests on real PostgreSQL, curl against the built server                   |
| 3     | Frontend: typed client, `useTasks`, create/edit/toggle/delete/filter, loading/empty/error states, a11y | ESLint, 22 tests, manual run in a browser against the real API (desktop, mobile, light, dark)              |
| 4     | Multi-stage Dockerfiles, nginx with CSP, full Compose with health-gated startup and hardening          | end-to-end smoke test, network isolation, read-only FS, graceful stop; Trivy: 0 findings                   |
| 5     | `ci-cd.yml`: all 12 required steps; SHA/digest pinning; SBOMs; Dependabot                              | actionlint; every stage dry-run locally; negative controls (planted secret, vulnerable dependency)         |
| 6     | Terraform: ECR (immutable, scan on push, lifecycle) + GitHub OIDC + push-only role                     | 8 mocked tests, mutation checks, Trivy, read-only `plan` against the real account                          |
| 6b    | Separate Terraform pipeline; bootstrap stack (state, plan/apply roles, permissions boundary)           | 8 + 8 mocked tests, mutation checks, 25/25 AWS IAM policy-simulator decisions, read-only `plan`            |
| 7     | README and documentation                                                                               | commands and links checked against the repository                                                          |

## Key decisions

### Application

- **Separate lockfiles per tier (no npm workspaces).** Each image needs only its own
  lockfile, so builds cache well and one tier's dependency change never rebuilds the other.
- **Layered backend** (`routes → service → repository`) behind interfaces. Unit tests swap
  PostgreSQL for an in-memory repository, while integration tests use a real database.
- **Validation in two places.** Zod in the API gives precise 400s, and `CHECK` constraints
  in PostgreSQL stop bad data arriving by any other path.
- **`status` as `TEXT` + `CHECK`** rather than an `ENUM`. It's just as strict, and adding a
  value later is simpler.
- **Server is the source of truth in the UI.** Mutations wait for the API response, so the
  UI never shows state the server rejected.
- **Relative `/api` path.** It is proxied by Vite in development and nginx in containers, so
  there's no CORS, no URLs in the bundle, and one image for every environment.

### Data

- **Two database roles.** The owner runs migrations in a one-shot job, and the API connects
  as a DML-only role. A SQL injection bug in the API can't change the schema.
- **Forward-only SQL migrations** with a small runner: one transaction per file, an advisory
  lock for concurrent starts, and checksums so an edited migration is detected.
- **`updated_at` by trigger**, so it is correct whatever code path writes the row.

### Containers

- **Multi-stage, non-root, minimal.** The API image has no compiler or package managers.
  OS patches are applied at build, and base images are pinned by digest.
- **Liveness vs readiness.** Liveness never touches the database, so a database outage
  doesn't trigger restart loops. Readiness gates traffic.
- **nginx owns the browser security headers.** Duplicates from the API (Helmet) are removed
  at the proxy so browsers never see conflicting values.
- **`.dockerignore` as an allowlist**, so new files (e.g. a stray `.env`) are excluded by
  default.

### Delivery

- **Scan what you ship.** Each image is built once to a tarball, scanned, then that same
  tarball is pushed.
- **Gate threshold:** HIGH/CRITICAL with a fix available, plus any secret or HIGH/CRITICAL
  misconfiguration. Unfixable findings are reported, and they block as soon as a fix exists.
- **Immutable commit-SHA tags.** Re-running the pipeline for an existing tag is a no-op.
- **No secrets in CI.** AWS access is OIDC-only, and repository variables hold identifiers
  only.

### Infrastructure

- **Two Terraform stacks.** `bootstrap` holds what the pipeline depends on and defines its
  permissions, so an administrator applies it. `terraform` (ECR + push role) is delivered by
  the pipeline.
- **Plan and apply separation.** Plans use a read-only role. Applies use a separate role that
  trusts only the approval-gated `infrastructure` environment, and they apply exactly the
  reviewed plan.
- **No privilege escalation.** The apply role can create roles only with a permissions
  boundary limited to ECR push, can't remove boundaries or modify its own identity, and can
  reach only the ECR stack's state.
- **Policies as `jsonencode` locals** rather than data sources, so `terraform test` with a
  mocked provider can assert on their real content.
