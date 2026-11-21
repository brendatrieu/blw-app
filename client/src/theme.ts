export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "blw-theme";

export function getStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** The page background per theme: --color-bg / --_dark-color-bg in
 * styles/index.css and the manifest's colours (pinned together by
 * theme.test.ts). */
export const THEME_BG = { light: "#fbfaf8", dark: "#0e1218" } as const;

/**
 * Ledger 1090: what the installed app's opaque status bar (869) shows, per
 * scheme: the colour of the page's own top row right under it.
 * - "top": an AppLayout page at scroll 0, the glow ground's even top row
 *   (index.css --color-app-glow-top). index.html's metas start here.
 * - "frost": once scrolled, the frosted header's top row over the plain
 *   ground (--color-bar-glass over the glow, measured at 390x844; busy
 *   content under the header moves it a few levels).
 * - "page": the screens outside AppLayout (landing, About, auth): the page
 *   colour, as before.
 * A native shell picks its own status bar from the same table.
 */
export const STATUS_BAR = {
  top: { light: "#ecf2f4", dark: "#2f3942" },
  frost: { light: "#f9fcfd", dark: "#222a34" },
  page: THEME_BG,
} as const;
export type StatusBarSurface = keyof typeof STATUS_BAR;

/** The status bar colour for a meta of `scheme` (or the forced in-app theme). */
export function statusBarColor(scheme: "light" | "dark", preference: ThemePreference, surface: StatusBarSurface): string {
  return STATUS_BAR[surface][preference === "system" ? scheme : preference];
}

let appliedPreference: ThemePreference = "system";
let statusBarSurface: StatusBarSurface = "top";

/** AppLayout (top / frost, from its header's scroll state) and App's
 * OutsideAppLayout (page) say what sits under the status bar. */
export function setStatusBarSurface(surface: StatusBarSurface): void {
  statusBarSurface = surface;
  syncThemeColor();
}

export function applyTheme(preference: ThemePreference): void {
  appliedPreference = preference;
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
  syncThemeColor();
}

/**
 * Ledger 869: the installed iOS app's status bar is opaque in theme-color, and
 * index.html picks that by the OS scheme. A forced in-app theme sets both
 * metas to its own colour so the bar matches the page; "system" puts each
 * meta back to its own scheme's value (ledger 1090: of the current surface).
 * Web-only (a native app owns its status bar), so it no-ops without a DOM.
 */
function syncThemeColor(): void {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.getAttribute("media")?.includes("dark") ? "dark" : "light";
    meta.setAttribute("content", statusBarColor(scheme, appliedPreference, statusBarSurface));
  }
}

export function setTheme(preference: ThemePreference): void {
  if (preference === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, preference);
  }
  applyTheme(preference);
}

export function initTheme(): void {
  applyTheme(getStoredTheme());
}

/**
 * A media query that is true exactly while the app paints dark (item 727):
 * the in-app setting on `<html data-theme>` wins, otherwise the OS
 * preference, which the query then keeps tracking live. Server/test render
 * (no document) falls back to the OS query.
 */
export function darkMediaQuery(): string {
  const set = typeof document === "undefined" ? null : document.documentElement.getAttribute("data-theme");
  return set === "dark" ? "all" : set === "light" ? "not all" : "(prefers-color-scheme: dark)";
}
