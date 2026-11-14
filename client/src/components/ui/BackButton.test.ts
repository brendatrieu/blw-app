import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { holdLeaveGuard } from "../../lib/leaveGuard.js";
import { BackButton, useBackNavigateTo } from "./BackButton.js";

describe("BackButton (item 258 — chevron only)", () => {
  function render() {
    return renderToString(
      createElement(MemoryRouter, null, createElement(BackButton, { fallback: "/foods" })),
    );
  }

  it("renders a 24px chevron glyph at the header icons' 1.8 stroke weight", () => {
    const html = render();
    expect(html).toContain("<button");
    expect(html).toContain('d="M15 18l-6-6 6-6"');
    expect(html).toContain('width="24"');
    expect(html).toContain('stroke-width="1.8"');
    // Decorative: the accessible name comes from the sr-only text below.
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps 'Back' for assistive tech only — no visible label", () => {
    const html = render();
    expect(html).toContain('<span class="sr-only">Back</span>');
    const visibleText = html.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
    expect(visibleText).toBe("");
  });

  it("meets the 44px tap-target rule with no stray text padding", () => {
    const html = render();
    expect(html).toMatch(/class="[^"]*\bh-11\b/);
    expect(html).toMatch(/class="[^"]*\bw-11\b/);
  });
});

// The history-index branch only runs inside the click handler, so it can't
// be observed from the rendered HTML above. `useNavigate` is mocked so the
// component can be invoked as a plain function (no router/DOM render pass
// needed) and its `onClick` prop called directly.
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const navigateMock = vi.fn();
// Called as a plain function there's no render pass for `useContext`, so the
// header slot is mocked to "none" (inline, as on signed-out pages / in SSR).
// The portal branch is pinned in headerSlot.handlers.test.ts.
vi.mock("./headerSlot.js", () => ({ useHeaderSlot: () => null }));

function clickWithHistoryState(state: unknown, fallback: string): void {
  navigateMock.mockClear();
  vi.stubGlobal("window", { history: { state } } as unknown as Window & typeof globalThis);
  const element = BackButton({ fallback }) as ReactElement<{ onClick: () => void }>;
  element.props.onClick();
}

describe("BackButton history-aware navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pops history (navigate(-1)) when history.state.idx is greater than 0", () => {
    clickWithHistoryState({ idx: 2 }, "/foods");
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("navigates to the fallback when history.state.idx is 0", () => {
    clickWithHistoryState({ idx: 0 }, "/foods");
    expect(navigateMock).toHaveBeenCalledWith("/foods");
  });

  it("navigates to the fallback when history.state is undefined", () => {
    clickWithHistoryState(undefined, "/safety");
    expect(navigateMock).toHaveBeenCalledWith("/safety");
  });
});

describe("BackButton asks a page with unsaved changes first (ledger 940)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the back to the guard's question, and goes only when the page says Leave", () => {
    let asked: (() => void) | null = null;
    const release = holdLeaveGuard((leave) => (asked = leave));
    try {
      clickWithHistoryState({ idx: 2 }, "/plan");
      expect(navigateMock).not.toHaveBeenCalled();
      asked!();
      expect(navigateMock).toHaveBeenCalledWith(-1);
    } finally {
      release();
    }
    // Released: back goes straight away again.
    clickWithHistoryState({ idx: 2 }, "/plan");
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });
});

describe("useBackNavigateTo (ledger 975)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  /** A window whose Back lands on `poppedTo`. */
  function stub(idx: number | undefined, poppedTo: string) {
    const listeners: Array<() => void> = [];
    const win = {
      history: { state: idx === undefined ? null : { idx } },
      location: { href: "http://app.test/plan/2026-10-16/new", pathname: "/plan/2026-10-16/new" },
      addEventListener: (type: string, listener: () => void, options: unknown) => {
        expect([type, options]).toEqual(["popstate", { once: true }]);
        listeners.push(listener);
      },
    };
    vi.stubGlobal("window", win);
    navigateMock.mockReset();
    navigateMock.mockImplementation((to: unknown) => {
      if (to === -1) {
        win.location = { href: `http://app.test${poppedTo}`, pathname: new URL(poppedTo, "http://app.test").pathname };
        listeners.splice(0).forEach((listener) => listener());
      }
    });
  }

  it("pops, then replaces the popped-to entry when it is the same page: no second copy of the day", () => {
    stub(3, "/plan?date=2026-10-16");
    useBackNavigateTo()("/plan?date=2026-10-16&copy=slot-1");
    expect(navigateMock.mock.calls).toEqual([[-1], ["/plan?date=2026-10-16&copy=slot-1", { replace: true }]]);
  });

  it("pops, then pushes over another page (Home stays under the plan)", () => {
    stub(1, "/");
    useBackNavigateTo()("/plan?copy=slot-1");
    expect(navigateMock.mock.calls).toEqual([[-1], ["/plan?copy=slot-1", { replace: false }]]);
  });

  it("with no history (a deep link) goes straight to the page", () => {
    stub(0, "/");
    useBackNavigateTo()("/plan?copy=slot-1");
    expect(navigateMock.mock.calls).toEqual([["/plan?copy=slot-1"]]);
    stub(undefined, "/");
    useBackNavigateTo()("/plan?copy=slot-1");
    expect(navigateMock.mock.calls).toEqual([["/plan?copy=slot-1"]]);
  });
});
