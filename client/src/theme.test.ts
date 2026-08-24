import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredTheme, setTheme } from "./theme.js";

const STORAGE_KEY = "blw-theme";

/** A minimal `document.documentElement` stand-in: just the attribute API `applyTheme` touches. */
function makeFakeRoot() {
  const attributes = new Map<string, string>();
  return {
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    removeAttribute: (name: string) => {
      attributes.delete(name);
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
  };
}

function makeFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe("theme", () => {
  let root: ReturnType<typeof makeFakeRoot>;
  let storage: ReturnType<typeof makeFakeLocalStorage>;

  beforeEach(() => {
    root = makeFakeRoot();
    storage = makeFakeLocalStorage();
    vi.stubGlobal("document", { documentElement: root } as unknown as Document);
    vi.stubGlobal("localStorage", storage as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getStoredTheme defaults to 'system' when nothing is stored", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("getStoredTheme reflects whatever was last written", () => {
    storage.setItem(STORAGE_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("setTheme('light') stores the preference and sets data-theme=\"light\"", () => {
    setTheme("light");
    expect(storage.getItem(STORAGE_KEY)).toBe("light");
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("setTheme('dark') stores the preference and sets data-theme=\"dark\"", () => {
    setTheme("dark");
    expect(storage.getItem(STORAGE_KEY)).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme('system') clears storage and removes the data-theme attribute", () => {
    setTheme("dark");
    expect(root.hasAttribute("data-theme")).toBe(true);

    setTheme("system");
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(getStoredTheme()).toBe("system");
  });

  it("transitions cleanly across all three options in sequence", () => {
    setTheme("light");
    expect(root.getAttribute("data-theme")).toBe("light");

    setTheme("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");

    setTheme("system");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});
