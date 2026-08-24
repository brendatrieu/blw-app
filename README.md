# blw-app

A PWA for baby-led weaning: a curated starter-food catalog (iron-rich foods
paired with vitamin-C foods, plus a top-allergen introduction plan),
age-staged recipes, per-baby serve tracking, a pantry/expiry dashboard for
prepped foods, an offline-readable safety library, and a few AI-assisted
features (symptom pattern-checker, recipe chat, ask-anything chat) that run
on each user's own Anthropic API key.

`blw-app` is a working name — the project hasn't been named yet.

## Stack

- **Client**: Vite + React + TypeScript, React Router, TanStack Query,
  Tailwind CSS, vite-plugin-pwa (installable, works offline for the catalog
  and safety content).
- **Server**: Fastify v5, one Node process serving both the API and the
  built client as static files.
- **Data**: Postgres 17 via Drizzle ORM. Local dev needs no database
  install — see below.
- **Shared**: a small `@blw/shared` package of zod schemas used by both
  sides so request/response shapes can't drift apart silently.

It's a pnpm workspace monorepo:

```
client/    Vite + React SPA
server/    Fastify API (serves client/dist in production)
shared/    zod schemas + types shared by both
content/   safety-library MDX, bundled into the client and AI prompts
docs/      deploy runbook
```

## Local development

Requires Node 24+ and pnpm (via [corepack](https://nodejs.org/api/corepack.html):
`corepack enable`).

```bash
pnpm install
pnpm dev
```

That starts the API on `:3000` and the Vite dev server (proxying `/api` to
it) together. No `DATABASE_URL` is needed for local dev — when it's unset,
the server transparently uses [PGlite](https://pglite.dev/), an
in-process Postgres that persists to `server/.data/pglite`. Point
`DATABASE_URL` at a real Postgres instance (see `server/.env.example`) to
use one instead; the same Drizzle schema and migrations work against both.

## Scripts

Run from the repo root, fanning out to every workspace:

| Script | What it does |
|---|---|
| `pnpm dev` | Server (watch mode) + client dev server, concurrently |
| `pnpm build` | Builds `shared` → `client` → `server`, in that order |
| `pnpm typecheck` | `tsc --noEmit` across every workspace |
| `pnpm lint` | ESLint across the repo |
| `pnpm test` | Vitest across every workspace |

Server-only, from `server/`:

| Script | What it does |
|---|---|
| `pnpm db:generate` | Regenerates SQL migrations from `src/db/schema.ts` |
| `pnpm db:migrate` | Applies migrations (Postgres or PGlite, whichever is active) |
| `pnpm db:seed` | Migrates, then loads the idempotent content seeds (foods, recipes, allergen ladder, etc.) |

## Architecture notes

- The client and server share request/response types through `@blw/shared`
  rather than a generated OpenAPI client — small enough surface area that
  hand-written zod schemas stay easy to keep in sync.
- The server is dual-mode on its database driver (`server/src/db/index.ts`):
  Postgres via `pg` when `DATABASE_URL` is set, PGlite otherwise. Same
  Drizzle schema either way, so there's no separate "sqlite mode" to keep
  passing.
- In production the server serves the built SPA directly
  (`@fastify/static`, with an `index.html` fallback for client-side routing
  that never intercepts `/api/*`) — one process, one container, no separate
  static host.
- AI features are opt-in per user: each person supplies and encrypts their
  own Anthropic API key, so the app has $0 baseline AI cost and is fully
  usable without one.

## Deployment

Runs as three Docker Compose services — Caddy (TLS termination), the app,
and Postgres — on a single Oracle Cloud Always Free ARM VM. CI (typecheck,
lint, test, build) runs on every PR; pushing to `main` builds and publishes
an image and can optionally redeploy automatically.

Full runbook, including firewall setup (the two-firewall gotcha on Oracle's
Ubuntu images trips everyone up once), backups, and CI/CD wiring: see
[`docs/deploy-oracle.md`](docs/deploy-oracle.md).
