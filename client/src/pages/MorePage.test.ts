import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ opens: { count: 0 } }));

// The tour is a modal now: More reaches it through the provider's context,
// not a route. Mocked so this page renders (and its row can be clicked)
// without standing up a provider and a query client around it.
vi.mock("../features/tour/TourProvider.js", () => ({
  useTour: () => ({
    openTour: () => {
      h.opens.count += 1;
    },
  }),
}));

import { CardButton } from "../components/ui/Card.js";
import { MorePage } from "./MorePage.js";

function render(): string {
  return renderToString(createElement(MemoryRouter, null, createElement(MorePage, null)));
}

interface Rendered {
  type: unknown;
  props: { children?: unknown; onClick?: () => void; className?: string };
}

/** Every `CardButton` row in the unrendered tree. */
function collectButtons(node: unknown, out: Rendered[] = []): Rendered[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child, out);
    return out;
  }
  const element = node as Rendered;
  if (element.type === CardButton) out.push(element);
  collectButtons(element.props?.children, out);
  return out;
}

beforeEach(() => {
  h.opens.count = 0;
});

describe("MorePage (item 274)", () => {
  it("opens with 'Learn' — the safety library, under the name its bottom-nav tab had", () => {
    const html = render();
    expect(html).toContain(">Learn<");
    expect(html).toContain('href="/safety"');
    expect(html).not.toContain(">Safety Library<");
  });

  it("puts Learn first, ahead of every other entry", () => {
    const html = render();
    const learn = html.indexOf(">Learn<");
    expect(learn).toBeGreaterThan(-1);
    for (const label of ["Favorites", "Symptom Check", "Chat", "Settings"]) {
      expect(html.indexOf(`>${label}<`)).toBeGreaterThan(learn);
    }
  });

  it("gives every row its own emoji, in its own row", () => {
    // Split at each row's opening tag: one chunk per row, so an emoji can
    // only satisfy the row it actually sits in. Without this the rows' emoji
    // are unpinned — any of them could be swapped and nothing would notice.
    const rows = render().split(/<(?:a|button) /).slice(1);
    const expected = [
      { tag: "a", href: "/safety", emoji: "🛟", label: "Learn" },
      { tag: "a", href: "/favorites", emoji: "❤️", label: "Favorites" },
      { tag: "a", href: "/symptom-check", emoji: "🩺", label: "Symptom Check" },
      { tag: "a", href: "/chat", emoji: "💬", label: "Chat" },
      { tag: "button", href: null, emoji: "🧭", label: "Take the tour" },
      { tag: "a", href: "/settings", emoji: "⚙️", label: "Settings" },
    ];

    expect(rows.length).toBe(expected.length);
    expected.forEach((row, index) => {
      const html = rows[index]!;
      if (row.href) expect(html, `row ${index + 1} destination`).toContain(`href="${row.href}"`);
      expect(html, `row ${index + 1} emoji`).toContain(`>${row.emoji}</span>`);
      expect(html, `row ${index + 1} label`).toContain(`>${row.label}<`);
    });
  });

  it("offers the tour as a button row — same card as its neighbours, no route (item 311)", () => {
    const html = render();

    expect(html).toContain(">Take the tour<");
    expect(html).toContain(">A quick look around the app<");
    // The compass, exactly — not the map, not the globe.
    expect(html).toContain(">🧭</span>");
    // The tour stopped being a page: nothing here links to one.
    expect(html).not.toContain('href="/tour"');

    // Same surface as the link rows: the shared Card classes, not a bare
    // button.
    const rowClasses = /<button[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(rowClasses).toContain("rounded-[var(--radius-lg)]");
    expect(rowClasses).toContain("border-[var(--color-border)]");
    expect(rowClasses).toContain("bg-[var(--color-bg-elevated)]");
    expect(rowClasses).toContain("p-3");
    expect(html).toMatch(/<button[^>]*type="button"/);

    const tour = html.indexOf(">Take the tour<");
    for (const label of ["Learn", "Favorites", "Symptom Check", "Chat"]) {
      expect(html.indexOf(`>${label}<`)).toBeLessThan(tour);
    }
    // Settings stays the end of the list.
    expect(html.indexOf(">Settings<")).toBeGreaterThan(tour);
  });

  it("opens the tour dialog when that row is tapped", () => {
    const buttons = collectButtons((MorePage as unknown as () => unknown)());
    expect(buttons).toHaveLength(1);
    buttons[0]!.props.onClick?.();
    expect(h.opens.count).toBe(1);
  });

  it("names the app 'Little Meals' in the version footer (item 308)", () => {
    const html = render();
    expect(html).toContain("Little Meals v");
    expect(html).not.toContain("blw-app");
  });

  it("changes nothing else on the page — same entries, same destinations", () => {
    const html = render();
    for (const [label, href] of [
      ["Favorites", "/favorites"],
      ["Symptom Check", "/symptom-check"],
      ["Chat", "/chat"],
      ["Settings", "/settings"],
    ]) {
      expect(html).toContain(`>${label}<`);
      expect(html).toContain(`href="${href}"`);
    }
  });
});
