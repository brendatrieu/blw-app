# blw-app

Baby-led weaning PWA — greenfield monorepo skeleton (codename `blw-app`).

## Workspace layout

- `client/` — Vite + React 18 + TypeScript SPA (`@blw/client`)
- `server/` — Fastify v5 API (`@blw/server`)
- `shared/` — zod schemas + shared TS types (`@blw/shared`)

## Getting started

```bash
pnpm install
pnpm dev        # runs server (tsx watch) + client (vite) concurrently
pnpm build      # builds shared -> client -> server
pnpm typecheck  # tsc --noEmit across all packages
pnpm lint       # eslint across all packages
pnpm test       # vitest across all packages
```

See `C:/Users/Khaleel/.claude/plans/we-are-going-to-refactored-beacon.md` for the full implementation plan.
