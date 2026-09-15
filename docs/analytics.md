# Analytics

Little Meals measures itself, first-party, in its own Postgres. No third party
receives anything; no script is loaded from anywhere but this origin; the
Content-Security-Policy is untouched.

This document is the contract. If something is not in the catalog below, it is
not collected.

## What is never sent

By construction, not by policy:

- names (yours, your baby's, a custom food's, a recipe's, a storage label's)
- birth dates, and any date of anything that happened
- notes, reaction notes, quantity notes
- search text, filter values, chat messages
- symptom selections and triage results
- row ids of any kind — meals, babies, foods, recipes, storage items, threads
- email addresses
- error messages, stack traces, request ids
- IP addresses and full user agent strings

The event schema (`shared/src/usage.ts`) makes this structural rather than
aspirational. Every value an event may carry is an enum, a boolean, a small
integer or a bucket label; there is no free-text field anywhere in the
catalog. On top of that, a refinement walks the whole payload and rejects any
string containing `@` or longer than 64 characters, and a test walks every
entry in the catalog and fails on any `z.string()`. Adding a careless property
later breaks the build, not just a review.

URLs are reduced to route PATTERNS before they leave the device:
`/foods/sweet-potato` is sent as `/foods/:slug`, and a pathname that matches
no declared route is sent as `/*`. A path segment is the one place an id or a
slug could ride along, so `route` is a closed enum.

## Session context

Sent with every event, so no dashboard panel has to join back to a user row:

| Key | Values |
|---|---|
| `app_version` | deploy SHA (first 12 chars), or `<version>-dev` locally |
| `standalone` | installed PWA, or a browser tab |
| `theme` | `light` / `dark` / `system` |
| `platform` | `ios` / `android` / `desktop` / `other` |
| `online` | the device's own `navigator.onLine` |
| `baby_age_bucket` | `pre6` / `6-8` / `9-11` / `12-17` / `18+` / `none` |
| `baby_count` | `0` / `1` / `2+` |
| `has_ai_key` | whether an Anthropic key is on file |

`baby_age_bucket` is the only field derived from anything a parent typed, and
six buckets is as much as it can ever carry.

## The catalog (phase 1a)

| Event | Fires | Properties |
|---|---|---|
| `session_started` | boot, or the first event after 30 minutes idle | — |
| `screen_viewed` | route change | `route_pattern`, `from_route` |
| `meal_logged` | a meal that persisted (log form or a storage serve) | `food_count`, `recipe_kind`, `from_storage`, `via`, `leftovers_saved`, `has_notes`, `is_first_meal`, `backdated`, `offline` |
| `meal_save_failed` | a meal create/edit/serve that failed | `via`, `kind`, `offline` |
| `storage_item_added` | a container saved (one event per container, so a "Separate containers" save of three foods sends three) | `location`, `source`, `via`, `has_servings`, `has_best_by`, `food_count` (food containers only), `split` |
| `storage_item_closed` | a status change, including restore and undo | `to`, `via`, `freshness_at_change`, `age_days_bucket` |
| `catalog_filtered` | a Foods/Recipes query resolved after a filter or search change (debounced 800 ms) | `catalog`, `filters` (keys only), `has_query`, `results`, `zero_results` |
| `article_viewed` | a Learn article mounts | `article` (closed slug set), `from_route` |
| `symptom_check_started` | the first change on the symptom survey | — |
| `ai_key_saved` | the Settings key form answers | `outcome`, `attempt` |
| `tour_opened` / `tour_completed` | the tour opens / is finished | `source` (`first_run` / `more`) |
| `tour_skipped` | the tour is left early | `source`, `slide`, `via` (`skip` / `overlay` / `escape`) |
| `pwa_installed` / `pwa_launch` | the browser's `appinstalled` / first load | `display` |
| `offline_entered` | the browser's `offline` event | `route_pattern` |
| `client_error` | a render crash, an uncaught error or rejection, a 5xx or a dead request | `route_pattern`, `kind`, `status` |
| `usage_sharing_changed` | the Privacy switch moves | `enabled` |

`via` is always DERIVED from the route and its query parameters — `/log-meal?food=`
is `food_page`, `/storage/add` reached from Home is `home` — never wired to a
particular button. Only the PRESENCE of a query parameter is read; its value
never leaves the function that checks it.

`freshness_at_change` is likewise derived, by `resolveFreshness`
(`features/storage/freshness.ts`) — the same rule that decides the Use soon /
Expired chip on the card. A parent-entered best-by date wins over the
category storage window the server's `expired`/`useSoon` flags come from, so
this property always says what the parent was actually looking at when they
removed the container. The date itself never leaves the device; only the
bucket (`fresh` / `use_soon` / `expired`) is sent.

The plan's P2 events (`meal_deleted`, `custom_item_created`, `recipe_favorited`,
`article_read_depth`, `allergen_marked`, `symptom_alarm_dismissed`,
`chat_failed`, `pwa_install_prompt_shown`, `account_deleted`) are deliberately
not shipped yet; they join after the first monthly review.

## How consent works

Sharing is **on by default** and switched off in **Settings → Privacy**:

> **Share anonymous usage data**
> Which screens and features get used, never notes, names, or your baby's
> details. Turning this off also deletes what was already collected.

Turning it off:

1. sends `usage_sharing_changed` first (the last thing this account sends);
2. PATCHes `share_usage_data = false` and `DELETE`s every one of that
   account's `usage_events` rows **in the same transaction**, so there is no
   state in which the flag says off while the rows are still there;
3. drops this device's queued events, in memory and in IndexedDB.

While it is off, `POST /api/usage` answers `204` and stores nothing — the same
response a stored batch gets, so the endpoint cannot be used to probe an
account's setting.

**Do Not Track and Global Privacy Control are honoured.** If the browser sends
either, the switch renders off and disabled with "Your browser asked not to be
tracked, so this is off.", and the client builds no events at all — the check
is synchronous, before anything is constructed.

Events raised before the preference has loaded are held in memory (never on
disk, never sent). If the answer comes back "off", they are dropped.

## How an event travels

1. `track(name, props)` builds an envelope and validates it against the shared
   schema. In a dev build an invalid event throws where the mistake is; in
   production it is dropped and logged to the console.
2. The envelope joins a queue persisted in IndexedDB (`blw.usageQueue`),
   capped at 500 events, oldest dropped first.
3. The queue flushes every 15 seconds, at 20 events, on `visibilitychange`
   to hidden, on `pagehide` and on `online`, via
   `fetch("/api/usage", { keepalive: true })` in batches of at most 50.
4. A batch is removed on a 2xx. A network failure, a 5xx, a 429 or a 408 keeps
   it for the next flush. A 4xx drops it: the server will reject that exact
   payload every time, and keeping it would wedge the head of the queue.
5. The primary key is a client-generated uuid, so a replayed batch — a flush
   whose response the browser never saw — inserts nothing twice.
6. The service worker treats `/api/usage` as network-only: never cached, never
   background-synced.

Nothing in the app waits on any of this. If every step failed, the app would
look and behave exactly as it does now.

## Retention

Rows older than `USAGE_RETENTION_DAYS` (default 180) are deleted on boot and
once a day after that, cutting on `received_at` — never on the device clock.
A client's `occurred_at` is clamped into `[received - 7d, received + 5m]` on
arrival, so a phone with a wrong date cannot bend a cohort chart.

Account deletion cascades: `usage_events.user_id` is `ON DELETE CASCADE`, and
the client discards its queue as part of the delete.

## Data export

`ACCOUNT_EXPORT_VERSION` 12 adds `usageEvents` (name, props, route, appVersion,
occurredAt), `preferences.shareUsageData` and `profile.role` to the JSON export
from Settings → Account, so everything collected about an account — including
whether it holds dashboard access — is downloadable by that account.

## Reading the data

`GET /api/admin/metrics?range=4w|12w|26w` returns every panel as one JSON
payload (the contract is `shared/src/admin.ts`), and `/admin/metrics` renders
it. Results are cached in memory for five minutes per range, so refreshing the
page does not re-run a dozen aggregate scans on a two-core VM; the "as of"
timestamp in `meta` says how old the answer is.

The same numbers, as Markdown, without a browser:

```
docker compose exec app node dist/metrics/cli.js --range 12w
docker compose exec app node dist/metrics/cli.js --range 4w --json
```

`--range` takes `4w`, `12w` (the default) or `26w`; `--json` prints the raw
payload instead of the report. The CLI reads the database directly — there is
no session to authenticate with on the box — and runs the same
`collectMetrics()` the endpoint does, so the report and the dashboard can never
disagree.

Every panel is an aggregate. No endpoint under `/api/admin/` can return a row
id, an email address or a name; the single exception is the collaborators
list, which is a list of admins shown to admins.

**What the panels mean.** Week buckets are UTC Mondays, and the last bucket is
the current, still-running week. Behaviour panels (tour, catalog filters,
Learn, client errors) count events by `occurred_at`; volume and liveness
panels (DAU/WAU/MAU) use the server's `received_at`. Weekly logging parents is
three or more meals *created* in one week. Activation measures each account
from its own signup instant (baby within 24h, first meal within 48h, three
logging days within 28 days). A retention cell is `null`, not zero, until that
week has finished for the whole cohort. Storage serve-through is read from the
`storage_items` table rather than from events, so it covers parents who
switched sharing off. Feature adoption is share of weekly logging parents in
the trailing 28 days; `custom_items` currently counts parents who OPENED a
custom food or recipe editor, because P1 has no `custom_item_created` event —
it tightens when P2 adds one.

## Who can see the dashboard

Two independent sources of access, either of which is sufficient:

- `ADMIN_EMAILS` (comma-separated, matched case-insensitively) — a deployment
  fact. This is what lets the owner in on a fresh deployment with no database
  write, and what lets access be revoked by editing the environment.
- `user.role = 'admin'` — granted from the Access panel on the dashboard by an
  existing admin, to somebody who already signed up as an ordinary parent.

Guards: an env-bootstrapped admin cannot be demoted from the UI (clearing the
row would change nothing), nobody can demote themselves, and every grant and
revoke needs a session younger than ten minutes and writes a row to
`admin_audit` (actor, action, target, timestamp) that survives the deletion of
either account.

Everyone else gets a 404 — the app's ordinary unknown-route 404, the same
status, body and headers — from every `/api/admin/*` route, anonymous or
signed in. The per-admin rate limit sits behind that guard on purpose: a 429
would tell a parent there is something here to find. `/admin/metrics` in the
client renders the normal not-found page for them.

## The review ritual

**Weekly, 20 minutes, Monday.** North-star sparkline (weekly logging parents,
8 weeks), the activation funnel for the last two signup cohorts, feature
adoption, the top five `client_error` by route and kind, zero-result filter
combinations, tour skips by slide. One line in `docs/decisions.md` — even when
the line is "no change".

**Monthly.** The retention triangle by signup week, split by tour outcome,
standalone and age bucket; storage serve-through; symptom fallback share;
Learn article ranking; and a check that the retention purge actually ran.

Experiments are run without A/B: one product change per deploy, at least two
weeks and 30 users per side, compared across signup cohorts on either side of
a deploy SHA, with `client_error` per 100 sessions as the guardrail.

## Adding an event

1. Add it to `shared/src/usage.ts` — enums, booleans, bounded ints and closed
   slug sets only.
2. Add a sample to `client/src/lib/usage/buildEvent.test.ts`; the coverage
   test fails until every catalog entry has one.
3. Call `track()` from the mutation or query layer, not from a button, and
   derive `via` from the route.
4. Add a call-site pin next to the ones in `*.usage.test.ts`.
5. Update the table above.
