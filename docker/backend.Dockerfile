# syntax=docker/dockerfile:1
#
# Application tier image: Express API (also runs the one-shot migration job).
# Build from the repository root so database/migrations can be included:
#   docker build -f docker/backend.Dockerfile -t task-api .
#
# Stages:
#   deps   - production-only node_modules
#   build  - full toolchain, compiles TypeScript to dist/
#   final  - Node runtime + compiled JS + prod deps + SQL migrations; no compiler, no npm
#
# No secrets are used at build time. Credentials arrive as environment variables at runtime.

# Base images are pinned by digest for reproducible builds; Dependabot proposes updates.

# ---------------------------------------------------------------------------------------
FROM node:22-alpine@sha256:8af05ed9012b24a9205075889b231b65b47f8cc299f3034de2b8a864780ee07f AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
# Exact versions from the lockfile; no install scripts from third-party packages.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------------------------------------------------------------------------------------
FROM node:22-alpine@sha256:8af05ed9012b24a9205075889b231b65b47f8cc299f3034de2b8a864780ee07f AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

# ---------------------------------------------------------------------------------------
FROM node:22-alpine@sha256:8af05ed9012b24a9205075889b231b65b47f8cc299f3034de2b8a864780ee07f AS final

# Pull in OS security patches released since the base image was built, then remove the
# package managers the runtime never uses (smaller image, fewer CVEs to track).
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
    PORT=4000 \
    MIGRATIONS_DIR=/app/migrations

WORKDIR /app

# Files stay owned by root and are only readable by the runtime user, so a compromised
# process cannot modify the application code.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./package.json
COPY database/migrations ./migrations

# Unprivileged user that ships with the node image (uid 1000).
USER node

EXPOSE 4000

# Liveness only: the process answers HTTP. Readiness (database reachable) is checked by
# the orchestrator via /health/ready.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Exec form: node is PID 1 and receives SIGTERM directly; server.ts handles graceful shutdown.
CMD ["node", "dist/server.js"]
