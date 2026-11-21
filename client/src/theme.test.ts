import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredTheme, initTheme, setStatusBarSurface, setTheme, STATUS_BAR, statusBarColor, THEME_BG } from "./theme.js";

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
    { content: STATUS_BAR.top.light, media: "(prefers-color-scheme: light)" },
    { content: STATUS_BAR.top.dark, media: "(prefers-color-scheme: dark)" },
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

  afterEach(() => {
    setStatusBarSurface("top");
  });

  it("a forced theme sets both metas to that theme's colour", () => {
    setTheme("dark");
    expect(contents()).toEqual([STATUS_BAR.top.dark, STATUS_BAR.top.dark]);
    setTheme("light");
    expect(contents()).toEqual([STATUS_BAR.top.light, STATUS_BAR.top.light]);
  });

  it("a stored forced theme sets both metas at boot", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    initTheme();
    expect(contents()).toEqual([STATUS_BAR.top.dark, STATUS_BAR.top.dark]);
  });

  it("'system' restores each meta's own scheme value", () => {
    setTheme("dark");
    setTheme("system");
    expect(contents()).toEqual([STATUS_BAR.top.light, STATUS_BAR.top.dark]);
  });

  it("follows the surface under the status bar (ledger 1090), in every theme", () => {
    for (const preference of ["system", "light", "dark"] as const) {
      setTheme(preference);
      for (const surface of ["top", "frost", "page", "top"] as const) {
        setStatusBarSurface(surface);
        expect(contents()).toEqual([statusBarColor("light", preference, surface), statusBarColor("dark", preference, surface)]);
      }
    }
    setTheme("system");
    setStatusBarSurface("frost");
    expect(contents()).toEqual([STATUS_BAR.frost.light, STATUS_BAR.frost.dark]);
    // A theme change keeps the surface.
    setTheme("dark");
    expect(contents()).toEqual([STATUS_BAR.frost.dark, STATUS_BAR.frost.dark]);
  });
});

describe("statusBarColor: scheme x theme x surface (ledger 1090)", () => {
  it("system follows each meta's scheme; a forced theme wins over it", () => {
    for (const surface of ["top", "frost", "page"] as const) {
      for (const scheme of ["light", "dark"] as const) {
        expect(statusBarColor(scheme, "system", surface)).toBe(STATUS_BAR[surface][scheme]);
        expect(statusBarColor(scheme, "light", surface)).toBe(STATUS_BAR[surface].light);
        expect(statusBarColor(scheme, "dark", surface)).toBe(STATUS_BAR[surface].dark);
      }
    }
  });

  it("pins the measured colours (ledger 1100/1093, batch-1133 finish: every tab page, 390x844 + 320x568): top = the ground's even top row, frost = the scrolled header's", () => {
    // Dark top = the .20 sea glow's colour at the top centre (was #2f3942 on the 1083 capped .40 glow).
    expect(STATUS_BAR.top).toEqual({ light: "#ecf2f4", dark: "#1f262d" });
    expect(STATUS_BAR.frost).toEqual({ light: "#fafcfc", dark: "#1e2630" });
    // Outside AppLayout: the page colour, as before 1090.
    expect(STATUS_BAR.page).toBe(THEME_BG);
  });

  it("is a no-op without a DOM", () => {
    vi.stubGlobal("document", undefined);
    expect(() => {
      setStatusBarSurface("frost");
      setStatusBarSurface("top");
    }).not.toThrow();
    vi.unstubAllGlobals();
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

  it("has both theme-color metas at the app ground's top row (ledger 1090: a signed-in boot paints it first)", () => {
    expect(html).toContain(`<meta name="theme-color" content="${STATUS_BAR.top.light}" media="(prefers-color-scheme: light)" />`);
    expect(html).toContain(`<meta name="theme-color" content="${STATUS_BAR.top.dark}" media="(prefers-color-scheme: dark)" />`);
    expect(html.match(/<meta name="theme-color"/g)).toHaveLength(2);
  });

  it("the top colour is the ground's own token (index.css --color-app-glow-top)", () => {
    const css = read("./styles/index.css");
    expect(css).toContain(`--color-app-glow-top: ${STATUS_BAR.top.light};`);
    expect(css).toContain(`--_dark-app-glow-top: ${STATUS_BAR.top.dark};`);
  });

  it("the bg tokens and the manifest stay the page colour (the manifest drives Android's splash, left alone in 1090)", () => {
    const css = read("./styles/index.css");
    expect(css).toContain(`--color-bg: ${THEME_BG.light};`);
    expect(css).toContain(`--_dark-color-bg: ${THEME_BG.dark};`);
    const config = read("../vite.config.ts");
    expect(config).toContain(`theme_color: "${THEME_BG.light}",`);
    expect(config).toContain(`background_color: "${THEME_BG.light}",`);
  });
});

describe("one clear x per search field (ledger 999)", () => {
  it("index.css hides the native WebKit search cancel button", () => {
    const css = readFileSync(new URL("./styles/index.css", import.meta.url), "utf8");
    expect(css).toMatch(
      /input\[type="search"\]::-webkit-search-cancel-button\s*\{[^}]*-webkit-appearance:\s*none;[^}]*appearance:\s*none;/,
    );
  });
});
