export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "blw-theme";

export function getStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** The page background per theme: --color-bg / --_dark-color-bg in
 * styles/index.css, and index.html's two theme-color metas (pinned together
 * by theme.test.ts). */
export const THEME_BG = { light: "#fbfaf8", dark: "#0e1218" } as const;

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
  syncThemeColor(preference);
}

/**
 * Ledger 869: the installed iOS app's status bar is opaque in theme-color, and
 * index.html picks that by the OS scheme. A forced in-app theme sets both
 * metas to its own background so the bar matches the page; "system" puts each
 * meta back to its own scheme's value. Web-only (a native app owns its status
 * bar), so it no-ops without a DOM.
 */
function syncThemeColor(preference: ThemePreference): void {
  if (typeof document.querySelectorAll !== "function") return;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.getAttribute("media")?.includes("dark") ? "dark" : "light";
    meta.setAttribute("content", THEME_BG[preference === "system" ? scheme : preference]);
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
