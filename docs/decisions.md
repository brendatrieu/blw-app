# Decisions

One line per review, even when the line is "no change". A decision recorded
against a number is a decision that can be revisited when the number moves;
one taken in a conversation cannot.

How to use this file: the thresholds below are agreed **in advance**, so a
weekly review is a lookup rather than an argument. When a metric crosses one,
write the decision and the date under "Log" and do the thing. When it does not,
write "no change" and stop — that entry is what keeps the next review honest
about how long something has been on the fence.

Numbers come from `docs/analytics.md`'s catalog plus the product tables. Until
phase 1b ships the dashboard, they are queried by hand.

## North star

**Weekly Logging Parents (WLP)** — distinct users with at least 3 meals created
in the trailing 7 days. It only moves if activation, retention and logging
friction all improve, which is why it is the one number at the top.

## Agreed thresholds

| Question | Metric | Threshold → decision |
|---|---|---|
| Is Storage dead weight? | 28-day adoption; serve-through = closed-as-finished ÷ all closes | adoption < 20% → demote "Add to storage" from Home. Discarded > 50% → build freshness reminders before any new storage feature |
| Where do new users drop before the first meal? | signup → baby within 24h → `/log-meal` viewed → `meal_logged` within 48h | baby step < 70% → move baby creation into signup or tour slide 6. Viewed-but-not-logged > 40% → fix the picker (read `meal_save_failed` first) |
| Is the tour worth its slides? | completion rate; skips by slide; activation of completers vs skippers | completion < 40% AND activation delta < 5 points → cut to 3 slides. Skips clustering on slide *k* → rewrite slide *k* |
| Which Learn articles matter? | `article_viewed` share per slug | < 3% for 8 weeks → merge or demote. Top article → link it from the first-meal celebration and from matching food/allergen pages |
| Do the nutrition filters get used? | share of `catalog_filtered` carrying a nutrition key; zero-result rate per combination | < 10% → collapse to one Nutrition group. A combination with > 25% zero results → add content or stop offering the combination |
| Does the symptom check lead anywhere? | triage share from `symptom_checks`; started → completed | completion < 50% → shorten the survey. Alarm share > 30% → clinical review of the rules |
| AI chat vs BYO-key friction | `/chat` locked views → `ai_key_saved.ok`; error share; messages per key holder | locked → key < 10% AND errors > 30% → guided setup or a hosted-key tier. < 2 messages/week → deprioritise chat |
| Do the single-food basics earn their keep? | share of recipe-attributed meals using a one-ingredient catalog recipe | < 10% → stop generating basics. > 40% → make the basic the default suggestion on food pages |
| Does the allergen recency hint work? | tables only: a ≥ 14-day gap followed by that allergen within 7 days | < 25% → the hint is invisible; consider a Home nudge instead |
| Is the PWA worth it? | standalone share; sessions with `offline_entered`; `meal_save_failed.offline` | standalone < 25% → install hint on More. Any offline save failures → build a "saved, will sync" state |
| Quality gate | `client_error` per 100 sessions; crash rate per route | > 2 per 100 → stop feature work until it is back under. Any route above 0.5% of its own views → hotfix the same week |

## Log

| Date | Review | Decision |
|---|---|---|
| 2026-09-13 | — | Phase 1a shipped: first-party usage events, consent on by default with a Settings opt-out that also deletes collected rows, DNT/GPC honoured. Rejected self-hosted Umami (a second container and a second database outside the backups, on a hand-copied compose file) and PostHog/Plausible cloud (a third party receiving device and behaviour data from a children's-health app, plus a CSP exception). No decisions yet — there is no data yet. |
