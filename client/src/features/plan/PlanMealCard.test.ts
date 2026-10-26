// One meal of a plan day (ledger 904, CD-Plan-Day, CD-Plan-After-Copy): the
// markup through renderToString, and ⋮ Remove's question with its hook
// mocked (node env, no DOM).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedMeal, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  offline: false,
  // The ⋮ menu's items, rendered inline with their handlers kept.
  items: [] as Array<{ label: string; onSelect: () => void }>,
  closed: 0,
  remove: { isPending: false, isError: false, calls: [] as Array<{ input: unknown; options: { onSuccess?: () => void } }> },
}));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("../../components/ui/Menu.js", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  return {
    Menu: ({ label, children }: { label: string; children: (close: () => void) => unknown }) =>
      createElement("div", { "aria-label": label }, children(() => h.closed++) as never),
    MenuItem: ({ onSelect, children }: { onSelect: () => void; children: never }) => {
      h.items.push({ label: renderToStaticMarkup(createElement("span", null, children)).replace(/<[^>]+>/g, ""), onSelect });
      return createElement("button", { role: "menuitem" }, children);
    },
  };
});
vi.mock("./hooks.js", () => ({
  useRemovePlannedMeal: () => ({
    mutate: (input: unknown, options: { onSuccess?: () => void }) => h.remove.calls.push({ input, options }),
    get isPending() {
      return h.remove.isPending;
    },
    get isError() {
      return h.remove.isError;
    },
  }),
}));

import { ConfirmDialog } from "../../components/ui/ConfirmDialog.js";
import { PlanMealCard, RemovePlannedMealDialog, canServe, type PlanMealCardProps } from "./PlanMealCard.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-14";
const EGG = { id: id(1), slug: "egg", name: "Egg", category: "protein" as const };
const VEG = {
  id: id(30),
  label: null,
  recipeId: null,
  recipeTitle: null,
  foods: [
    { id: id(3), slug: "broccoli", name: "Broccoli" },
    { id: id(4), slug: "carrot", name: "Carrot" },
  ],
  status: "active",
} as unknown as StorageItem;

const meal = (over: Partial<PlannedMeal> = {}): PlannedMeal => ({
  slotId: id(50),
  name: "Lunch",
  time: "12:00",
  position: 2,
  served: null,
  items: [
    { kind: "recipe", id: id(10), recipe: { id: id(20), title: "Broccoli Cheese Egg Muffins" }, leftOut: [] },
    { kind: "storage", id: id(11), servings: 1, container: VEG, flags: [{ kind: "past_use_within" }] },
  ],
  ...over,
});

function render(props: Partial<PlanMealCardProps> & { meal: PlannedMeal }): string {
  return renderToString(
    createElement(MemoryRouter, null, createElement(PlanMealCard, { babyId: "baby-1", date: TODAY, today: TODAY, ...props })),
  ).replace(/\u202f/g, " ");
}

beforeEach(() => {
  h.offline = false;
  h.items.length = 0;
  h.closed = 0;
  h.remove.isPending = false;
  h.remove.isError = false;
  h.remove.calls.length = 0;
});

describe("PlanMealCard (CD-Plan-Day)", () => {
  it("names the meal as a link to its page, with its time, its lines on the plate and its flag box", () => {
    const html = render({ meal: meal() });
    expect(html).toMatch(new RegExp(`<a [^>]*href="/plan/${TODAY}/${id(50)}"[^>]*>Lunch</a>`));
    expect(html).toContain(">12:00 PM</span>");
    expect(html).toContain('aria-label="On the plate"');
    expect(html).toContain(">Broccoli Cheese Egg Muffins<");
    expect(html).toContain(">Broccoli, Carrot<");
    // The flag box: the item's name, then its line.
    expect(html).toMatch(/<div class="font-bold break-words">Broccoli, Carrot<\/div><div>May not keep until this day\.<\/div>/);
    expect(html).toContain('aria-label="More for Lunch"');
    expect(html).not.toContain("Nothing planned yet");
    // A longer card keeps ⋮ on its name's row: the card itself is not the row.
    expect(html).toMatch(/^<li class="[^"]*relative px-3\.5 py-2 "/);
  });

  it("an empty meal says Nothing planned yet; one with no time shows none; a deleted food keeps its mark", () => {
    const empty = render({ meal: meal({ items: [], time: null }) });
    expect(empty).toContain(">Nothing planned yet</p>");
    expect(empty).not.toMatch(/AM<|PM</);
    expect(empty).not.toContain('aria-label="On the plate"');
    const deleted = render({ meal: meal({ items: [{ kind: "food", id: id(12), food: { ...EGG, name: "My mash", deleted: true } }] }) });
    expect(deleted).toMatch(/My mash<span class="font-normal[^"]*">\u00a0(<!-- -->)?\(deleted\)<\/span>/);
  });

  it("a card with at most one line and no flags keeps its buttons beside the whole card (the board's Morning snack)", () => {
    const html = render({ meal: meal({ name: "Morning snack", time: null, items: [{ kind: "food", id: id(12), food: EGG }] }) });
    expect(html).toMatch(/^<li class="[^"]*relative px-3\.5 py-2 flex items-center gap-3"/);
  });

  it("a served meal says Served {time}, in the success chip", () => {
    const html = render({ meal: meal({ served: { mealId: id(90), servedAt: "2026-10-14T11:42:00.000Z" } }) });
    const time = new Date("2026-10-14T11:42:00.000Z").toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\u202f/g, " ");
    expect(html).toMatch(new RegExp(`<span class="[^"]*bg-\\[var\\(--color-success-soft\\)\\][^"]*text-\\[var\\(--color-success-soft-text\\)\\]"><svg [^>]*>.*?</svg>Served (<!-- -->)?${time}</span>`));
  });

  it("Serve shows only once it is wired (step 4.3), and then only today or before, unserved, with something planned", () => {
    expect(render({ meal: meal() })).not.toContain(">Serve<");
    const onServe = () => {};
    expect(render({ meal: meal(), onServe })).toMatch(/<button [^>]*type="button" aria-label="Serve Lunch"[^>]*>Serve<\/button>/);
    expect(render({ meal: meal(), onServe, date: "2026-10-13" })).toContain(">Serve<");
    expect(render({ meal: meal(), onServe, date: "2026-10-15" })).not.toContain(">Serve<");
    expect(render({ meal: meal({ items: [] }), onServe })).not.toContain(">Serve<");
    expect(render({ meal: meal({ served: { mealId: id(90), servedAt: "2026-10-14T11:42:00.000Z" } }), onServe })).not.toContain(">Serve<");
    expect(canServe("2026-10-14", TODAY, meal())).toBe(true);
    expect(canServe("2026-10-15", TODAY, meal())).toBe(false);
  });

  it("Serve in flight reads Serving… and waits; a failed one says try again; offline it waits and says why", () => {
    const onServe = () => {};
    const pending = render({ meal: meal(), onServe, serving: true });
    expect(pending).toMatch(/<button [^>]*aria-label="Serve Lunch" disabled=""[^>]*>Serving…<\/button>/);
    const failed = render({ meal: meal(), onServe, serveFailed: true });
    expect(failed).toContain('<p role="alert" class="mt-1 text-xs text-[var(--color-danger)]">Couldn&#x27;t serve — try again.</p>');
    expect(render({ meal: meal(), onServe })).not.toContain("try again");
    h.offline = true;
    const offline = render({ meal: meal(), onServe, serveFailed: true });
    expect(offline).toMatch(new RegExp(`aria-label="Serve Lunch" aria-describedby="serve-offline-${id(50)}" disabled=""`));
    expect(offline).toContain(`<p id="serve-offline-${id(50)}" class="mt-1 text-xs text-[var(--color-text-muted)]">You&#x27;re offline.</p>`);
    expect(offline).not.toContain("try again");
    // No Serve, no offline line.
    expect(render({ meal: meal(), onServe, date: "2026-10-15" })).not.toContain("You&#x27;re offline.");
  });
});

describe("⋮ (CD-Plan-Day): Copy to… once something is planned, then Remove", () => {
  it("offers Copy to… above Remove on a meal with something on it, and starts the copy from it", () => {
    let copies = 0;
    render({ meal: meal(), onCopy: () => copies++ });
    expect(h.items.map((item) => item.label)).toEqual(["Copy to…", "Remove"]);
    h.items[0]!.onSelect();
    expect(copies).toBe(1);
    expect(h.closed).toBe(1);
  });

  it("an empty meal has nothing to copy: Remove only (and so does a card nobody wired Copy for)", () => {
    render({ meal: meal({ items: [] }), onCopy: () => {} });
    render({ meal: meal() });
    expect(h.items.map((item) => item.label)).toEqual(["Remove", "Remove"]);
  });
});

describe("⋮ Remove asks first (RemovePlannedMealDialog)", () => {
  const dialog = (over: Partial<PlannedMeal> = {}, onClose = () => {}) =>
    (RemovePlannedMealDialog as unknown as (props: unknown) => { type: unknown; props: Record<string, unknown> })({
      babyId: "baby-1",
      date: TODAY,
      meal: meal(over),
      open: true,
      onClose,
    });
  const body = (el: { props: Record<string, unknown> }) => renderToString(el.props.children as never);

  it("names the meal, says only this day changes, and removes that day's meal on Remove", () => {
    let closed = 0;
    const el = dialog({}, () => closed++);
    expect(el.type).toBe(ConfirmDialog);
    expect(el.props).toMatchObject({ title: "Remove Lunch?", confirmLabel: "Remove", pendingLabel: "Removing…", error: undefined });
    expect(body(el)).toBe("<p>Just for this day. Daily meals stay as they are.</p>");
    (el.props.onConfirm as () => void)();
    expect(h.remove.calls.map((call) => call.input)).toEqual([{ date: TODAY, slotId: id(50) }]);
    h.remove.calls[0]!.options.onSuccess!();
    expect(closed).toBe(1);
  });

  it("a served meal adds that what was served stays logged", () => {
    expect(body(dialog({ served: { mealId: id(90), servedAt: "2026-10-14T11:42:00.000Z" } }))).toBe(
      "<p>Just for this day. Daily meals stay as they are.<!-- --> What you served stays in the Food log.</p>",
    );
  });

  it("offline: no Remove to tap, and it says why; a failure says try again", () => {
    h.offline = true;
    const off = dialog();
    expect(off.props.onConfirm).toBeUndefined();
    expect(off.props.error).toBe("You're offline.");
    h.offline = false;
    h.remove.isError = true;
    expect(dialog().props.error).toBe("Couldn't remove that — try again.");
  });
});
