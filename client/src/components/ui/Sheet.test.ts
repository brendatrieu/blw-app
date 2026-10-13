// Item 737: a long sheet keeps its header (handle, X, title) pinned while the
// body scrolls. Measured live (390x844 and 320, light/dark, longest guide);
// these pins keep the markup that makes it work.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetPanel } from "./Sheet.js";

const render = (props: { title?: string; showClose?: boolean; fixedHeight?: boolean }) =>
  renderToString(createElement(SheetPanel, { ...props, onClose: () => {}, children: createElement("p", null, "body") }));

const classOf = (html: string, marker: string) => html.match(new RegExp(`<div ${marker}[^>]*class="([^"]*)"`))?.[1] ?? "";

describe("SheetPanel pinned header (item 737)", () => {
  it("wraps the handle, X and title in one sticky, opaque header inside the panel's own scroll", () => {
    const html = render({ title: "How to create a custom recipe", showClose: true });
    const header = html.match(/<div data-sheet-header="" class="([^"]*)">([\s\S]*?)<\/h2><\/div><\/div>/);
    expect(header).not.toBeNull();
    const cls = header![1]!.split(" ");
    for (const c of ["sticky", "top-0", "z-10", "bg-[var(--color-bg-elevated)]", "pt-4", "-mx-4", "px-4"]) {
      expect(cls).toContain(c);
    }
    // The X and the title live inside it; the body does not.
    expect(header![2]).toContain('aria-label="Close"');
    expect(header![2]).toContain("How to create a custom recipe");
    expect(html.indexOf("<p>body</p>")).toBeGreaterThan(html.indexOf("data-sheet-header"));
    // No band below the title row that would take HowToLink's -my-3 taps:
    // only a 12px fade under it that ignores pointers.
    expect(cls).not.toContain("pb-3");
    for (const c of ["after:pointer-events-none", "after:absolute", "after:top-full", "after:h-3", "after:from-[var(--color-bg-elevated)]", "after:to-transparent"]) {
      expect(cls).toContain(c);
    }
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
