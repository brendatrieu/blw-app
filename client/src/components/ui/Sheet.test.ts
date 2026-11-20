// Item 737: a long sheet keeps its header (handle, X, title) pinned while the
// body scrolls. Measured live (390x844 and 320, light/dark, longest guide);
// these pins keep the markup that makes it work.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetPanel } from "./Sheet.js";

const render = (props: { title?: string; showClose?: boolean; fixedHeight?: boolean }) =>
  renderToString(createElement(SheetPanel, { ...props, onClose: () => {}, children: createElement("p", null, "body") }));

const classOf = (html: string, marker: string) => html.match(new RegExp(`<div ${marker}[^>]*class="([^"]*)"`))?.[1] ?? "";

describe("SheetPanel pinned header (item 737)", () => {
  it("wraps the handle, X and title in one sticky header inside the panel's own scroll, clear at rest and solid once scrolled under (ledger 1081)", () => {
    const html = render({ title: "How to create a custom recipe", showClose: true });
    const header = html.match(/<div data-sheet-header="" class="([^"]*)">([\s\S]*?)<\/h2><\/div><\/div>/);
    expect(header).not.toBeNull();
    const cls = header![1]!.split(" ");
    for (const c of ["app-frost-edge", "sticky", "top-0", "z-10", "pt-4", "-mx-4", "px-4"]) {
      expect(cls).toContain(c);
    }
    // The X and the title live inside it; the body does not.
    expect(header![2]).toContain('aria-label="Close"');
    expect(header![2]).toContain("How to create a custom recipe");
    expect(html.indexOf("<p>body</p>")).toBeGreaterThan(html.indexOf("data-sheet-header"));
    // No band below the title row that would take HowToLink's -my-3 taps,
    // and no fill of its own: the frosted panel shows through at rest (a fill
    // or even a no-op blur drew a band there, measured).
    expect(cls).not.toContain("pb-3");
    expect(cls.filter((c) => c.startsWith("bg-") || c.startsWith("after:") || c.startsWith("backdrop-"))).toEqual([]);
    expect(cls).not.toContain("app-frost");
  });

  it("is frosted like the bars (ledger 1081), and its pinned row turns into the panel's look, solid, once the body scrolls under it", () => {
    const panel = classOf(render({ title: "Serve" }), 'role="dialog"').split(" ");
    expect(panel).toEqual(expect.arrayContaining(["app-frost", "border-t", "border-[var(--color-bar-hairline)]"]));
    expect(panel.filter((c) => c.startsWith("bg-"))).toEqual([]);
    const css = readFileSync(new URL("../../styles/index.css", import.meta.url), "utf8");
    // No nested blur on the row; scrolled, the frost tint over the overlay's dim, which is Sheet's own overlay class.
    expect(css).toMatch(/\.app-frost \.app-frost-edge \{\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/);
    const dim = /\.app-frost \.app-frost-edge\[data-scrolled\] \{\s*background-color: color-mix\(in srgb, var\(--color-text\) (\d+)%, var\(--color-bg\)\);\s*background-image: linear-gradient\(var\(--color-bar-glass\), var\(--color-bar-glass\)\);/.exec(css);
    expect(dim).not.toBeNull();
    const sheet = readFileSync(new URL("./Sheet.tsx", import.meta.url), "utf8");
    expect(sheet).toContain(`sheet-overlay absolute inset-0 bg-[var(--color-text)]/${dim![1]}`);
  });

  it("scrolls the panel itself, with no top padding (so sticky pins at the very edge in WebKit too) and room for focus", () => {
    const panel = classOf(render({ title: "Serve Avocado", showClose: true }), 'role="dialog"').split(" ");
    expect(panel).toContain("overflow-y-auto");
    expect(panel).toContain("px-4");
    expect(panel).not.toContain("p-4");
    expect(panel).not.toContain("pt-4");
    // Taller than the tallest (two-line) header, measured at 78-84px.
    expect(panel).toContain("scroll-pt-28");
  });

  it("never uses position: fixed for the header", () => {
    const html = render({ title: "Time" });
    expect(classOf(html, 'data-sheet-header=""')).not.toMatch(/\bfixed\b/);
    // A sheet without a title still pins its handle.
    expect(classOf(render({}), 'data-sheet-header=""')).toContain("sticky");
  });

  it("a fixedHeight sheet (ledger 789) hangs from 15svh, is never shorter than 85svh, and (792) stretches to its box's bottom with no 85vh cap; others only cap at 85vh", () => {
    const fixed = classOf(render({ title: "Add more", fixedHeight: true }), 'role="dialog"').split(" ");
    expect(fixed).toEqual(expect.arrayContaining(["mt-[15svh]", "min-h-[85svh]", "h-[calc(100%-15svh)]"]));
    // 792: a viewport-unit height or an 85vh cap ends the panel at 100svh, which on iOS can stop short of the box.
    for (const c of ["h-[85svh]", "h-[85vh]", "mt-[15vh]", "max-h-[85vh]"]) expect(fixed).not.toContain(c);
    // 792: the panel's color carries on below it, on top of the soft shadow, for a box that itself stops short.
    expect(fixed).toContain("shadow-[0_50vh_0_0_var(--color-bg-elevated),var(--shadow-lg)]");
    const plain = classOf(render({ title: "Serve" }), 'role="dialog"').split(" ");
    expect(plain).toEqual(expect.arrayContaining(["max-h-[85vh]", "shadow-[var(--shadow-lg)]"]));
    expect(plain).not.toContain("h-[85vh]");
    expect(plain).not.toContain("min-h-[85svh]");
  });
});

describe("SheetPanel header action (ledger 941)", () => {
  it("puts the optional action at the right end of the header row, after the X and the title; none by default", () => {
    const html = renderToString(
      createElement(SheetPanel, {
        title: "Time",
        showClose: true,
        onClose: () => {},
        headerAction: createElement("button", { type: "button" }, "Clear time"),
        children: createElement("p", null, "body"),
      }),
    );
    // Reading (and screen-reader) order: X, title, action; then the body.
    expect(html).toMatch(
      /<div data-sheet-header=""[^>]*>[\s\S]*?aria-label="Close"[\s\S]*?<h2 [^>]*>Time<\/h2><div class="-mr-2 ml-auto shrink-0"><button type="button">Clear time<\/button><\/div><\/div><\/div><p>body<\/p>/,
    );
    expect(render({ title: "Time", showClose: true })).not.toContain("ml-auto");
  });
});
