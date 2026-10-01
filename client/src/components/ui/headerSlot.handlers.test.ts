// Item 654: inside the signed-in app the page's way out (BackButton /
// CloseButton) portals into the slim header's left slot; with no slot
// (signed-out pages, SSR) it stays inline. Both components are called as
// plain functions with the slot hook and `createPortal` mocked (the portal
// idiom from Menu.handlers.test.ts), so no DOM is needed.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ slot: null as unknown }));

vi.mock("./headerSlot.js", () => ({ useHeaderSlot: () => h.slot }));
vi.mock("react-dom", () => ({
  createPortal: (children: unknown, target: unknown) => ({ portal: children, target }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => () => {} }));

import { BackButton } from "./BackButton.js";
import { CloseButton } from "./CloseButton.js";

type Rendered = ReactElement<{ "aria-label"?: string }> & {
  portal?: ReactElement<{ "aria-label"?: string }>;
  target?: unknown;
};

describe.each([
  ["BackButton", BackButton],
  ["CloseButton", CloseButton],
] as const)("%s header slot (item 654)", (name, Component) => {
  it("renders the button inline when there is no header slot", () => {
    h.slot = null;
    const out = Component({ fallback: "/foods" }) as Rendered;
    expect(out.portal).toBeUndefined();
    expect(out.type).toBe("button");
  });

  it("portals the same button into the header slot when one exists", () => {
    const slot = { id: "header-slot" };
    h.slot = slot;
    const out = Component({ fallback: "/foods" }) as Rendered;
    expect(out.target).toBe(slot);
    expect(out.portal?.type).toBe("button");
    if (name === "CloseButton") expect(out.portal?.props["aria-label"]).toBe("Close");
  });
});
