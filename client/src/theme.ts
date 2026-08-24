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
