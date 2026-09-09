import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackButton } from "./BackButton.js";

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
