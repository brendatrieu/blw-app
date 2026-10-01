// Items 644, 646, 647: selected / on states wear --color-selected (pastel sky
// in BOTH modes), never the CTA --color-primary. Item 670 made the CTA pastel
// in dark again, so the two share a hex today (pinned in styles/contrast.test.ts),
// but they stay separate roles so the CTA can change without moving these states.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge.js";
import { SegmentedControl } from "./SegmentedControl.js";
import { Switch } from "./Switch.js";
import { FilterChip } from "../../features/catalog/components/filters.js";

const SELECTED_FILL = "bg-[var(--color-selected)]";
const SELECTED_INK = "text-[var(--color-selected-contrast)]";

describe("selected / on states use --color-selected (item 644)", () => {
  it("Switch: the on track is the selected fill, the off track is not", () => {
    const on = renderToString(createElement(Switch, { checked: true, onChange: () => {}, "aria-label": "x" }));
    const off = renderToString(createElement(Switch, { checked: false, onChange: () => {}, "aria-label": "x" }));
    expect(on).toContain(SELECTED_FILL);
    expect(off).not.toContain(SELECTED_FILL);
    expect(on + off).not.toContain("--color-primary");
  });

  it("SegmentedControl: only the selected segment wears the fill and its ink", () => {
    const html = renderToString(
      createElement(SegmentedControl, {
        "aria-label": "Theme",
        value: "b",
        onChange: () => {},
        options: [
          { value: "a", label: "Alpha", icon: null },
          { value: "b", label: "Beta", icon: null },
        ],
      }),
    );
    const seg = (label: string) => html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
    expect(seg("Beta")).toContain(`${SELECTED_FILL} ${SELECTED_INK}`);
    expect(seg("Alpha")).not.toContain(SELECTED_FILL);
    expect(html).not.toContain("--color-primary");
  });

  it("FilterChip: an active chip is the selected fill, border and ink; an idle one is not", () => {
    const active = renderToString(createElement(FilterChip, { active: true, label: "Protein", onClick: () => {} }));
    const idle = renderToString(createElement(FilterChip, { active: false, label: "Protein", onClick: () => {} }));
    expect(active).toContain(`border-[var(--color-selected)] ${SELECTED_FILL} ${SELECTED_INK}`);
    expect(idle).not.toContain(SELECTED_FILL);
    expect(active + idle).not.toContain("--color-primary");
  });
});

describe("client source guards (items 644, 646)", () => {
  const root = new URL("../../", import.meta.url);
  const sources = (readdirSync(root, { recursive: true }) as string[])
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => ({ path, text: readFileSync(new URL(path, root), "utf8") }));

  it("finds the client source", () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it("never uses the CTA fill as a text color (~1.5:1 as text on the light grounds; links use --color-accent)", () => {
    expect(sources.filter((s) => s.text.includes("text-[var(--color-primary)]")).map((s) => s.path)).toEqual([]);
  });

  it("never draws a selected chip in the CTA fill (the old border+fill idiom)", () => {
    expect(sources.filter((s) => s.text.includes("border-[var(--color-primary)]")).map((s) => s.path)).toEqual([]);
  });

  it("keeps the CTA fill on buttons only (one use each), so a chip can't half-revert to it", () => {
    const uses = Object.fromEntries(
      sources
        .map((s) => [s.path.replaceAll("\\", "/"), s.text.split("bg-[var(--color-primary)]").length - 1] as const)
        .filter(([, n]) => n > 0),
    );
    expect(uses).toEqual({
      "components/ui/Badge.tsx": 1,
      "components/ui/Button.tsx": 1,
      "components/ui/MultiCombobox.tsx": 1,
      "features/symptom/components/SymptomSurveyForm.tsx": 1,
    });
  });
});

describe("Badge outline tone (item 647)", () => {
  it("draws its outline as an inset ring, not a border, so it is as tall as a tinted badge", () => {
    const outline = renderToString(createElement(Badge, { tone: "outline", children: "6m+" }));
    const tinted = renderToString(createElement(Badge, { tone: "neutral", children: "Fridge" }));
    const classes = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
    expect(classes(outline)).toContain("inset-ring");
    expect(classes(outline)).not.toContain("border");
    // Same box model otherwise: identical padding and type.
    const box = (html: string) => classes(html).filter((c) => /^(px|py|text-xs|font-)/.test(c));
    expect(box(outline)).toEqual(box(tinted));
  });
});
