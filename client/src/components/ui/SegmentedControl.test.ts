// Item 702: a per-option `disabled` — dimmed, announced, and inert.
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl.js";

const props = (onChange: (value: "a" | "b") => void) => ({
  "aria-label": "Pick",
  value: "b" as const,
  onChange,
  options: [
    { value: "a" as const, label: "A", icon: null, disabled: true },
    { value: "b" as const, label: "B", icon: null },
  ],
});

describe("SegmentedControl disabled option (item 702)", () => {
  it("renders the disabled option dimmed and aria-disabled, the others untouched", () => {
    const html = renderToString(SegmentedControl(props(() => {})));
    const [a, b] = html.match(/<button[^>]*>/g) ?? [];
    expect(a).toContain('aria-disabled="true"');
    expect(a).toContain("opacity-40");
    expect(b).not.toContain("aria-disabled");
    expect(b).not.toContain("opacity-40");
  });

  it("ignores a tap on the disabled option and passes the others through", () => {
    const onChange = vi.fn();
    const tree = SegmentedControl(props(onChange)) as ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>;
    const [a, b] = tree.props.children;
    a!.props.onClick();
    expect(onChange).not.toHaveBeenCalled();
    b!.props.onClick();
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
