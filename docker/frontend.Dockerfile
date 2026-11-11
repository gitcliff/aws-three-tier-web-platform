# syntax=docker/dockerfile:1
#
# Presentation tier image: static React build served by unprivileged nginx, which also
# reverse-proxies /api to the application tier.
#   docker build -f docker/frontend.Dockerfile -t task-web .
#
# The bundle contains no environment-specific values; the API location is supplied at
# container start through API_UPSTREAM, so one image is promoted unchanged across environments.

# Base images are pinned by digest for reproducible builds; Dependabot proposes updates.

# ---------------------------------------------------------------------------------------
FROM node:22-alpine@sha256:8af05ed9012b24a9205075889b231b65b47f8cc299f3034de2b8a864780ee07f AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

# ---------------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e AS final

# The base image runs as uid 101; switch to root only to apply OS patches.
USER root
RUN apk upgrade --no-cache
USER nginx

# Rendered by the image's entrypoint at startup (envsubst) into /etc/nginx/conf.d/.
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Only substitute our own variable; nginx's runtime variables such as $uri are left intact.
ENV API_UPSTREAM=http://api:4000 \
    NGINX_ENVSUBST_FILTER=^API_UPSTREAM$

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
