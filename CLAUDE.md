# Little Meals (repo: blw-app)

Baby-led weaning PWA. Live at https://littlemeals.org. Owner: GitHub `brendatrieu` (use they/them).
Full context, history, and open items: **read `docs/HANDOFF.md` before substantive work.**

## The one rule that can hurt production

**Pushing to `main` deploys to production.** Commit locally as you go; push ONLY when the owner says "push".
After a deploy, remind the owner to fully quit and relaunch the installed app (there is no in-app update prompt yet).

## Commands

Node 24 via nvm — every shell needs: `export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH`

| What | Where | Command |
|---|---|---|
| Dev (API :3000 + Vite :5173) | root | `ADMIN_EMAILS=dev-bypass@localhost.local pnpm dev` |
| Typecheck (rebuilds `shared` first) | root | `pnpm typecheck` |
| Lint (must be 0 errors, 0 warnings) | root | `pnpm lint` |
| Client tests (~40 s) | `client/` | `pnpm vitest run` |
| Server tests (7–9 min, background it) | `server/` | `pnpm vitest run --testTimeout=60000 --hookTimeout=60000` |
| Migrate + seed dev DB | `server/` | `pnpm db:seed` (stop the API first) |

- Run root `pnpm typecheck` BEFORE server tests after any `shared/` edit (server reads `shared/dist`). `tsc` inside `client/` alone proves nothing.
- Chain gates with `&&` so a red gate blocks what follows.
- Local dev needs no login (loopback auth bypass as `dev-bypass@localhost.local`) and no database (PGlite).
- After a new migration or seed change: kill the API (`lsof -tiTCP:3000`), `pnpm db:seed` in `server/`, `touch server/src/index.ts`.

## Conventions that are easy to get wrong

- **Tests run in a node environment — there is no DOM.** Markup is pinned with `renderToString`; behaviour (effects, handlers, state) is pinned by calling the component as a plain function with React's hooks mocked through a `vi.hoisted` store. Copy the idiom from `client/src/components/ui/Menu.handlers.test.ts` or `Sheet.handlers.test.ts`. Do not add jsdom.
- **Anything that floats over the page must portal to `document.body`** (`Sheet`, `Dialog`, `Menu` all do). An absolutely-positioned popover cannot out-paint a later sibling, whatever its z-index.
- **Never trust `window.innerHeight` / `visualViewport` alone on iOS.** Compare against a rendered element's own `getBoundingClientRect()` (see `Menu.tsx`). Never use `position: fixed` for page chrome: the bottom nav is `sticky` in flow on purpose.
- Styling is CSS custom properties in `client/src/styles/index.css` (theme "Seaside"), used as `text-[var(--color-x)]`. A new token must be declared in `:root`, the `prefers-color-scheme: dark` block, AND `:root[data-theme="dark"]` — a test enforces the two dark blocks match. `contrast.test.ts` is a WCAG gate on declared pairings.
- `shared/` holds the zod schemas both sides use. Changing an export shape means bumping `ACCOUNT_EXPORT_VERSION` (now 15).
- Migrations are in `server/drizzle/` (latest 0017). **The app has real users: migrations must preserve data.** Any destructive schema change needs the owner's explicit go.
- Seeds (`server/db/seeds/`) sit outside `tsc`; the test suite exercises them. Guards: every food ≥3 recipes, every spice ≥2; cooked recipes state times and temperatures.
- Analytics is first-party and stores no messages or stacks, ever (`docs/analytics.md`). Do not weaken that for debuggability.
- Commit messages: write to a file and `git commit -F` (shell quoting has eaten trailers before).

## Working with the owner

- Be concise: lead with the answer, one reason per point.
- "Maybe", "I wonder", "not sure", "what do you think" = they want your opinion and a short discussion FIRST. Do not start building.
- When a batch is done, give a short checklist of what they should review on their phone.
- Verify UI headlessly (driver script in `docs/HANDOFF.md`); do not open the Browser preview pane unless asked.
- Reproduce a bug before fixing it, and prove the fix with a measurement (hit-test, computed style), not reasoning. Reasoning about z-index and viewport sizes has been wrong here more than once.
- Remove any data you seed into the dev database for a check.
