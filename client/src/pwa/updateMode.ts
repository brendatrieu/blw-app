/**
 * Ledger 790, the one switch for the update prompt. true: a new version
 * waits until the parent taps Reload (the card, or the More row). false: the
 * pre-790 behaviour, where a new service worker takes over on its own and
 * neither the card nor the row ever shows — for a native build, whose updates
 * come from the App Store instead. Read by vite.config.ts (registerType), so
 * it must stay free of imports.
 */
export const UPDATE_PROMPT_ENABLED = true;
