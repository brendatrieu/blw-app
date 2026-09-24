# Little Meals — project handoff

Written 2026-09-21 for whoever (person or Claude session) picks this project up next.
`CLAUDE.md` at the repo root holds the rules and commands; this file holds the context behind them.
Personal and server-access details are deliberately NOT here (this repo is public) — the owner keeps them in a local, git-ignored note at `.workflow/HANDOFF.private.md`.

## 1. What this is

**Little Meals** is an installable web app (PWA) for parents doing baby-led weaning. The repo and package names still say `blw-app`; the product name is final.

- Live: https://littlemeals.org (www redirects to the bare domain).
- It has real users as of mid-September 2026 and the owner watches usage weekly. Treat production data as precious.
- One owner/developer (GitHub `brendatrieu`, they/them). They test on an iPhone 14 running iOS 26, mostly through the installed Home Screen app, in dark mode.

What a parent can do today:

- **Log meals** for a baby: one or more foods, optional recipe, a time (backdating allowed, future refused), a reaction field, and notes. Meals can save leftovers straight to Storage.
- **Storage**: containers of prepped food with a location (Fridge / Freezer / Counter), freshness window, optional best-by date that overrides the window, optional servings tracking, and a Serve action that logs a meal from the container. One container can hold a whole multi-food meal, or the parent can split it into separate containers.
- **Foods** catalog (76 foods incl. a Spices & herbs category) with iron / vitamin C / fiber levels, choking risk, allergens, and filters; parents can add custom foods.
- **Recipes** (catalog + per-user custom), with nutrition derived from ingredients, timed and temperatured steps, and at least three recipes per food.
- **Allergen ladder** per baby: nine allergens; "Established after 3 servings without a reaction" with visible "N of 3" progress; a reaction note pauses auto-establishment; parents can mark established by hand with an optional past date; established allergens count down 7 days to "Serve again soon", and Home nudges when any are due.
- **Learn** (safety library, 9 MDX articles, readable offline), **symptom check**, **AI chat / recipe chat** on the user's own Anthropic API key, favorites, a first-run **tour**, settings with data export and a privacy switch.
- **Send feedback** (More tab) → an admin **Inbox** on `/admin/metrics`, which also carries the analytics dashboard.

## 2. How the code is laid out

pnpm workspace, Node 24.

```
shared/    zod schemas + types used by both sides (built to shared/dist)
server/    Fastify 5 API; Drizzle ORM; Postgres 17 in prod, PGlite locally; better-auth
  src/routes/     account admin ai-keys babies catalog chat favorites feedback meals preferences recipes storage symptom usage
  src/services/   allergens foods meals recipeNutrition recipes slugs storage
  src/metrics/    the admin dashboard's queries, collector, and markdown export
  drizzle/        migrations 0000–0017
  db/seeds/       catalog + recipe seed data (outside tsc; exercised by tests)
client/    Vite + React 18 + TypeScript, react-router 7, TanStack Query, Tailwind v4, vite-plugin-pwa
  src/features/   account admin ai babies catalog chat feedback safety storage symptom tour tracking
  src/components/ui/      the design system (Button, Card, Sheet, Dialog, Menu, MultiCombobox, DateTimeField, …)
  src/components/charts/  hand-rolled inline-SVG charts (no chart library: CSP)
  src/styles/index.css    every design token; theme "Seaside"
  src/lib/usage/          the analytics client
content/   safety-library MDX, bundled into the client and the AI prompts
docs/      analytics.md (event catalog + review ritual), decisions.md (agreed metric thresholds + log), deploy-oracle.md (server runbook), this file
```

Shell: `AppLayout` = sticky header + `<main>` + in-flow sticky `BottomNav` (Home · Storage · Foods · Recipes · More). Each routed page is wrapped in `.page-transition`.

Migrations worth knowing: 0009/0010 renamed Pantry → Fridge → **Storage** (final; `/pantry/*` and `/fridge/*` redirect); 0011 structured recipe ingredients; 0012 user preferences (tour); 0013 analytics + roles + admin audit; 0014 spice category; 0015 many foods per storage item; 0016 feedback; 0017 allergen `established_at`.

## 3. Deploy and infrastructure (no secrets here)

- Push to `main` → GitHub Actions runs **CI** and **Deploy** (`.github/workflows/`). Deploy builds an arm64 image to GHCR and the VM pulls it; it is gated by the `DEPLOY_ENABLED` repo variable. The Docker build runs typecheck, so a red typecheck fails the deploy and production keeps the previous release. The container runs migrations and idempotent seeds on start.
- Host: one Oracle Cloud ARM VM behind Caddy; the domain is at Namecheap. The **Caddyfile on the server is a manual copy** — deploys only replace the app image. Server env lives in a `.env` on the VM, including `ADMIN_EMAILS` (comma-separated) which bootstraps dashboard admins.
- This development laptop **cannot SSH to the VM**; the owner does server-side steps from another machine.
- Verify a deploy: `gh run list --limit 3`, then load the site. To confirm a change is really live, download the served bundle and grep it (`curl -s https://littlemeals.org/ | grep -o 'src="/assets/[^"]*"'`).
- **PWA updates are the recurring gotcha.** `registerType: "autoUpdate"` updates the service worker in the background, but an already-open app keeps running old JavaScript until it is fully quit and relaunched — and nothing in the UI says so. On iOS the installed app has its own storage separate from Safari; deleting and re-adding the icon does not clear it (Settings → Safari → Advanced → Website Data does). An in-app "update available" prompt is the top suggested follow-up (section 6).

## 4. How work gets verified here

Gates (all must be green before a commit): root `pnpm typecheck`, root `pnpm lint` (0/0), client `pnpm vitest run` (123 files / 1866 tests at the time of writing), server suite when server or shared changed (32 files / 611 tests, 7–9 minutes).

Process the owner is used to: requirements are written down before building, the build is verified by someone/something that did not write it, verification includes **mutation checks** (break the code on purpose, confirm a test fails, restore, confirm the file checksum is identical), then a **live check** in a real browser, then a commit, then a review checklist for the owner. On this laptop that history lives in `.workflow/LEDGER.md` (git-ignored, local only, items 1–402) — useful archaeology if it is still there, not required reading.

### Headless live checks

The owner does not want the Browser preview pane opened unasked, so UI is checked with headless Chrome over the DevTools protocol at a phone viewport. The driver below navigates to each page, optionally runs a script in the page, prints whatever that script left on `window.__check`, and saves a screenshot. Save it anywhere outside the repo.

```js
// cdp.mjs — usage: EVAL="$(cat check.js)" SCHEME=dark PAGES="/storage,/meals" node cdp.mjs
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(`${process.env.HOME}/Desktop/blw-app/client/package.json`); // finds `ws` in the nearest node_modules above the repo (`npm i ws` in your home folder if missing)
const WebSocket = require("ws");
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333;
mkdirSync("/tmp/shots", { recursive: true });
const chrome = spawn(CH, [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", "--no-first-run", "--user-data-dir=/tmp/cdp-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list = null; // poll: a cold Chrome can take several seconds to open the port
for (let i = 0; i < 40 && !list; i++) { await sleep(500); try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch {} }
if (!list) { chrome.kill(); throw new Error("Chrome never opened its debug port"); }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.on("open", r));
let id = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: process.env.SCHEME || "light" }] });
const out = {};
for (const p of (process.env.PAGES || "/").split(",")) {
  await send("Page.navigate", { url: `http://localhost:5173${p}` });
  await sleep(2500);
  if (process.env.EVAL) { await send("Runtime.evaluate", { expression: process.env.EVAL, awaitPromise: true }); await sleep(900); }
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: "window.__check ?? null" });
  out[p] = r.result?.result?.value ?? r;
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/shots/${p.replace(/[\/?=]/g, "_") || "_home"}.png`, Buffer.from(shot.result.data, "base64"));
}
console.log(JSON.stringify(out, null, 1));
ws.close(); chrome.kill();
```

Techniques that have paid off:

- **Hit-test instead of eyeballing**: `document.elementFromPoint(x, y).closest('[role="menu"]')` tells you what a tap would really land on. This is what exposed the menu-overlay bug after z-index reasoning said it was fine.
- **Fake the device's lie**: `Object.defineProperty(window, "visualViewport", { configurable: true, get: () => ({ height: 3000 }) })`, or monkey-patch one element's `getBoundingClientRect`, to reproduce a phone-only measurement bug on a laptop.
- **Seed through the API**, not the UI: local requests are auto-authenticated, so `POST /api/storage` with `{ foodIds: [id], location: "fridge" }` and `POST /api/babies/:babyId/meals` with `{ foodIds: [id] }` build a long list in a second. Food ids come from `GET /api/foods`. Clean up after: `PATCH /api/storage/:id` `{ status: "discarded" }`, `DELETE /api/meals/:id`.
- The iOS Simulator works headlessly too (`xcrun simctl boot <udid>`, `openurl`, `io <udid> screenshot`) but only opens Safari, never the installed-app mode, and the available runtime (iOS 16.4) is far from the owner's iOS 26. It has never reproduced one of their phone-only bugs. Shut it down afterwards.

## 5. Recent history (September 2026) and what it taught

Newest first. Commit hashes are on `main`.

- **0a261dd — Menu portal + list dividers.** An open kebab menu let the next card's badge show through. Cause: an absolutely-positioned child escapes its parent's box but never its parent's paint-order turn, so a later list row paints over an earlier row's popover regardless of z-index. `Menu` now portals to `document.body` with computed fixed coordinates, closes on scroll, treats clicks inside the portaled panel as inside, and clamps its box onto the screen. New `--color-divider` token on Storage and meal cards (the old border measured ~1.3:1 contrast).
- **22e2630 → 643993a → 8d7b716 — kebab menu clipped at the bottom of long lists.** Three rounds. (1) Flip upward when there is no room. (2) On the owner's phone it still opened downward: `innerHeight` / `visualViewport.height` reported the full screen while the tab bar sat higher, so the check now also reads the tab bar's own rendered top and uses the smaller ceiling. (3) A scroll-into-view safety net, later replaced by the clamp in 0a261dd. Lesson: two rounds were spent blaming caching before asking for a screenshot. Ask for the screenshot and device first.
- **d368f65 — dashboard readability + shell.** Count axes never step below 1 (a max of 2 printed 0,1,1,2,2); Activation became a heat table by signup week with dashes for windows that have not closed; the Errors panel explains its kinds in plain language and groups by HTTP status, still storing no messages. The bottom nav changed from `position: fixed` to in-flow `sticky` to stop an iOS band appearing under it after the keyboard had been up; `Sheet`/`Dialog` nudge the viewport on close. The owner's later screenshots show the nav flush, but they have not explicitly confirmed the band is gone.
- **b46b1f8 / bda08b5 / a779f2f** — reaction field reworded after "baby liked cheese" was logged as a reaction ("Reaction (optional)" + "Only for hives, vomiting, rash or other reaction signs."); the established rule with progress and reaction pause (the owner rejected timing rules as confusing to parents — keep it at "3 servings"); allergen reminders.
- **886bd40 / eb6327e** — feedback to admins. **c6608e1 and earlier that week** — catalog expansion to 74 foods, recipe coverage guards, many-foods-per-container storage, best-by override, served-at on Serve, custom recipes first in the meal picker.
- Earlier in September: domain move to littlemeals.org, first-party analytics + `/admin/metrics` + collaborator roles, first-run tour, login copy, app icon, the "Seaside" theme, the Pantry → Storage rename.

## 6. Open items

Suggested next, in rough priority:

1. **"Update available" prompt for the PWA.** Use vite-plugin-pwa's `virtual:pwa-register` `needRefresh` + `updateSW(true)`, a small toast in the style of `components/ui/Celebration.tsx`, and proactively call `registration.update()` on app resume. Every deploy currently needs the owner to tell users to relaunch.
2. **Owner wants to revisit the analytics dashboard** (they said so on 2026-09-13; d368f65 fixed the three things they raised since).

Tabled by the owner "until the MVP is done" — do not start these unprompted:

- **Hosting cost / continuity**: an Oracle Cloud trial-credit expiry notice arrived 2026-09-11 (about ten days' notice). Whether the VM is Always Free eligible was never checked. Offsite database backups do not exist yet. This is the one tabled item with a clock on it.
- **Make the repo private**: the GHCR deploy image is publicly pullable today, so going private needs an image-visibility decision and a `read:packages` token on the VM.
- An Anthropic API key for the AI features (currently bring-your-own-key only).

Known small things:

- README still calls the name a working title.
- Custom recipe ingredients re-sort alphabetically on edit (no position column).
- The Foods filter chip row clips one glyph of "Legume" at 360 px wide.
- A "More tab has extra padding" report from early September was never reproduced.
- `/api/auth-config` still exists server-side though the Google sign-in button was removed from the client.
- React prints "useLayoutEffect does nothing on the server" during `Menu`'s render tests. Harmless; the tests pass.

## 7. If you are moving machines, not just accounts

The repo carries the code, `CLAUDE.md`, and this file. It does NOT carry:

- `.workflow/` (requirements ledger + private handoff note) — git-ignored.
- `server/.data/pglite` — the local dev database. A fresh clone must run `pnpm install`, then `pnpm db:seed` in `server/` with the API stopped.
- The owner's machine-level Claude setup under `~/.claude/` (global instructions, custom agents, hooks, the orchestrator profile) and Claude's per-project memory. Copy that directory's relevant parts by hand if the workflow they enable is wanted on the new machine.
