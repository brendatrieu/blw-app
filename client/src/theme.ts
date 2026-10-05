export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "blw-theme";

export function getStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
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
