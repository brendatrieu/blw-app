import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredTheme, initTheme, setTheme, THEME_BG } from "./theme.js";

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

/** index.html's two theme-color metas as attribute bags. */
function makeFakeThemeColorMetas() {
  return [
    { content: THEME_BG.light, media: "(prefers-color-scheme: light)" },
    { content: THEME_BG.dark, media: "(prefers-color-scheme: dark)" },
  ].map((attrs) => {
    const map = new Map(Object.entries(attrs));
    return {
      getAttribute: (name: string) => map.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        map.set(name, value);
      },
    };
  });
}

describe("theme-color follows the in-app theme (ledger 869)", () => {
  let metas: ReturnType<typeof makeFakeThemeColorMetas>;
  const contents = () => metas.map((meta) => meta.getAttribute("content"));

  beforeEach(() => {
    metas = makeFakeThemeColorMetas();
    vi.stubGlobal("document", {
      documentElement: makeFakeRoot(),
      querySelectorAll: (selector: string) => (selector === 'meta[name="theme-color"]' ? metas : []),
    } as unknown as Document);
    vi.stubGlobal("localStorage", makeFakeLocalStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a forced theme sets both metas to that theme's background", () => {
    setTheme("dark");
    expect(contents()).toEqual([THEME_BG.dark, THEME_BG.dark]);
    setTheme("light");
    expect(contents()).toEqual([THEME_BG.light, THEME_BG.light]);
  });

  it("a stored forced theme sets both metas at boot", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    initTheme();
    expect(contents()).toEqual([THEME_BG.dark, THEME_BG.dark]);
  });

  it("'system' restores each meta's own scheme value", () => {
    setTheme("dark");
    setTheme("system");
    expect(contents()).toEqual([THEME_BG.light, THEME_BG.dark]);
  });
});

describe("index.html status bar tags (ledger 869)", () => {
  const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
  const html = read("../index.html");

  it("has no apple-mobile-web-app-status-bar-style (black-translucent blurs the top on iOS 26.1+)", () => {
    expect(html).not.toMatch(/<meta[^>]*apple-mobile-web-app-status-bar-style/);
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Little Meals" />');
    // The env(safe-area-inset-*) paddings need viewport-fit=cover.
    expect(html).toContain("viewport-fit=cover");
  });

  it("has both theme-color metas, equal to the bg tokens and the manifest", () => {
    expect(html).toContain(`<meta name="theme-color" content="${THEME_BG.light}" media="(prefers-color-scheme: light)" />`);
    expect(html).toContain(`<meta name="theme-color" content="${THEME_BG.dark}" media="(prefers-color-scheme: dark)" />`);
    const css = read("./styles/index.css");
    expect(css).toContain(`--color-bg: ${THEME_BG.light};`);
    expect(css).toContain(`--_dark-color-bg: ${THEME_BG.dark};`);
    const config = read("../vite.config.ts");
    expect(config).toContain(`theme_color: "${THEME_BG.light}",`);
    expect(config).toContain(`background_color: "${THEME_BG.light}",`);
  });
});
