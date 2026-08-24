import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackButton } from "./BackButton.js";

describe("BackButton", () => {
  it("renders a button with the default 'Back' label and a chevron icon", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(BackButton, { fallback: "/foods" })),
    );
    expect(html).toContain("Back");
    expect(html).toContain("<svg");
    expect(html).toContain("<button");
  });

  it("renders custom label children instead of the default", () => {
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(BackButton, { fallback: "/safety" }, "Safety Library")),
    );
    expect(html).toContain("Safety Library");
    expect(html).not.toContain(">Back<");
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
