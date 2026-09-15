import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  opens: { count: 0 },
  admin: { is: false },
  feedback: { data: undefined as { new: number; read: number; resolved: number; archived: number } | undefined },
  enabledWith: [] as boolean[],
}));

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

// Same reason, and the harness the admin-row tests below drive: `useIsAdmin`
// is a react-query read of `/api/admin/me`, so without this the page cannot
// render outside a QueryClientProvider at all. Default is NOT an admin —
// every pre-existing pin in this file describes the page a parent sees.
vi.mock("../features/admin/hooks.js", () => ({
  useIsAdmin: () => ({ isAdmin: h.admin.is, isResolved: true }),
  // Whole-module replacement: every hook the page calls has to be here or
  // the page throws. `enabledWith` records the flag the page passes, which
  // is what keeps "a parent's browser never asks for this" testable.
  useFeedbackSummary: (enabled: boolean) => {
    h.enabledWith.push(enabled);
    return { data: enabled ? h.feedback.data : undefined };
  },
}));

import { CardButton } from "../components/ui/Card.js";
import { MorePage, unreadFeedbackBadge } from "./MorePage.js";

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
  h.admin.is = false;
  h.feedback.data = undefined;
  h.enabledWith = [];
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
      { tag: "a", href: "/feedback", emoji: "💌", label: "Send feedback" },
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

describe("MorePage feedback row (item 360)", () => {
  it("offers Send feedback to every parent, admin or not", () => {
    for (const isAdmin of [false, true]) {
      h.admin.is = isAdmin;
      const html = render();
      expect(html, `admin=${String(isAdmin)}`).toContain(">Send feedback<");
      expect(html, `admin=${String(isAdmin)}`).toContain('href="/feedback"');
      expect(html, `admin=${String(isAdmin)}`).toContain(">Found a bug or have an idea? Tell us.<");
      expect(html, `admin=${String(isAdmin)}`).toContain(">💌</span>");
    }
  });

  it("sits after Chat and ahead of the tour, so the content rows stay grouped", () => {
    const html = render();
    const feedback = html.indexOf(">Send feedback<");
    expect(html.indexOf(">Chat<")).toBeLessThan(feedback);
    expect(html.indexOf(">Take the tour<")).toBeGreaterThan(feedback);
    expect(html.indexOf(">Settings<")).toBeGreaterThan(feedback);
  });
});

describe("MorePage admin row (item 327)", () => {
  it("shows a Metrics row to an admin, between the tour and Settings", () => {
    h.admin.is = true;
    const html = render();

    expect(html).toContain(">Metrics<");
    expect(html).toContain('href="/admin/metrics"');
    expect(html).toContain(">How the app is actually being used.<");
    expect(html).toContain(">📈</span>");

    const metrics = html.indexOf(">Metrics<");
    expect(html.indexOf(">Take the tour<")).toBeLessThan(metrics);
    // Settings is still the end of the list for everybody, admin or not.
    expect(html.indexOf(">Settings<")).toBeGreaterThan(metrics);
  });

  it("shows a parent no Metrics row and no trace of the route", () => {
    h.admin.is = false;
    const html = render();

    expect(html).not.toContain(">Metrics<");
    expect(html).not.toContain("/admin/metrics");
    expect(html).not.toContain("admin");
  });

  it("shows the unread count as a chip on the Metrics row, and leaves its description alone", () => {
    h.admin.is = true;
    h.feedback.data = { new: 3, read: 1, resolved: 2, archived: 4 };
    const html = render();

    expect(html).toContain(">3 new feedback<");
    // The chip carries the count; the row still says what the page is.
    expect(html).toContain(">How the app is actually being used.<");
    // Only the unread ones — not read, resolved or archived.
    expect(html).not.toContain(">10 new feedback<");
  });

  it("shows no chip when the admin's inbox has nothing unread", () => {
    h.admin.is = true;
    h.feedback.data = { new: 0, read: 5, resolved: 2, archived: 1 };
    expect(render()).not.toContain("new feedback");
  });

  it("shows no chip before the summary has landed", () => {
    h.admin.is = true;
    h.feedback.data = undefined;
    expect(render()).not.toContain("new feedback");
  });

  it("never asks for the summary as a parent, and never chips their page", () => {
    // The hook is CALLED on every render — hooks cannot be conditional — but
    // `enabled` is what decides whether a request is made at all, and a
    // parent's must be false. A count planted in the fixture proves the page
    // is reading `enabled` rather than the data.
    h.admin.is = false;
    h.feedback.data = { new: 9, read: 0, resolved: 0, archived: 0 };
    const html = render();

    expect(h.enabledWith).toEqual([false]);
    expect(html).not.toContain("new feedback");
    expect(html).not.toContain("admin");
  });

  it("changes only that one row — the parent's list is the admin's minus Metrics", () => {
    h.admin.is = false;
    const parentRows = render().split(/<(?:a|button) /).length;
    h.admin.is = true;
    const adminRows = render().split(/<(?:a|button) /).length;
    expect(adminRows).toBe(parentRows + 1);
  });
});

describe("unreadFeedbackBadge", () => {
  it("guards on isAdmin even when a count is somehow present", () => {
    expect(unreadFeedbackBadge(false, 3)).toBeUndefined();
    expect(unreadFeedbackBadge(true, 3)).toBe("3 new feedback");
    expect(unreadFeedbackBadge(true, 0)).toBeUndefined();
    expect(unreadFeedbackBadge(true, undefined)).toBeUndefined();
  });
});
