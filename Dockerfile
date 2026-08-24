# syntax=docker/dockerfile:1
#
# Multi-stage build for the blw-app monorepo (client SPA + server API).
# Built for linux/arm64 (Oracle Cloud Always Free Ampere A1); works fine
# under buildx emulation for local amd64 testing too.

ARG NODE_VERSION=24-alpine
ARG PNPM_VERSION=11.23.0

# ---------------------------------------------------------------------------
# base: shared setup for every later stage. Pin pnpm explicitly via
# corepack rather than relying on a "packageManager" field, since the repo
# doesn't declare one.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install the full workspace (incl. devDependencies) once, cached by
# lockfile so source-only changes don't bust this layer
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile shared -> client -> server with full deps available
# ---------------------------------------------------------------------------
FROM deps AS build
# Passed through from the deploy workflow's build-args so the client's
# persisted-cache buster (see client/vite.config.ts) changes on every
# deploy instead of staying pinned to the never-bumped package version.
ARG GITHUB_SHA
ENV GITHUB_SHA=${GITHUB_SHA}
COPY . .
RUN pnpm run build

# ---------------------------------------------------------------------------
# prod-deps: a second, clean install with devDependencies excluded, so the
# runtime image doesn't carry vite/vitest/drizzle-kit/typescript etc.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------
# runner: final image — compiled output + prod deps only
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production

# tsx is a devDependency of @blw/server, but the existing db:migrate/db:seed
# scripts (see server/package.json) run TS source straight through it —
# server/db/seeds isn't part of the tsc build, so there's no compiled JS to
# run instead. Rather than reclassify tsx as a prod dependency in a file
# this build doesn't own, pin the same tsx version globally so those
# scripts still resolve at container start. Follow-up noted in
# docs/deploy-oracle.md.
RUN npm install -g tsx@4.19.2

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=prod-deps /app/shared/node_modules ./shared/node_modules

COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/server/db ./server/db
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/server/tsconfig.json ./server/tsconfig.json
COPY --from=build /app/client/package.json ./client/package.json
COPY --from=build /app/client/dist ./client/dist

RUN addgroup -S blw && adduser -S blw -G blw && \
    mkdir -p /app/server/.data && chown -R blw:blw /app/server/.data
USER blw

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Run migrations + idempotent seeds, then start the API (which also serves
# the built SPA out of client/dist). Deliberately no pnpm at runtime: pnpm's
# verify-deps-before-run tries to write install tempfiles into /app, which
# the non-root user can't (and shouldn't) do.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "cd server && node dist/db/migrate.js && tsx db/seeds/index.ts && node dist/index.js"]
