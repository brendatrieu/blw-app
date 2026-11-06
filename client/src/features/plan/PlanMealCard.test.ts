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
  items: [] as Array<{ label: string; onSelect: () => void; disabled?: boolean }>,
  closed: 0,
  remove: { isPending: false, isError: false, calls: [] as Array<{ input: unknown; options: { onSuccess?: () => void } }> },
  reorder: { busy: false, isError: false, babyIds: [] as string[], calls: [] as unknown[] },
}));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("../../components/ui/Menu.js", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  return {
    Menu: ({ label, children }: { label: string; children: (close: () => void) => unknown }) =>
      createElement("div", { "aria-label": label }, children(() => h.closed++) as never),
    MenuItem: ({ onSelect, disabled, children }: { onSelect: () => void; disabled?: boolean; children: never }) => {
      h.items.push({ label: renderToStaticMarkup(createElement("span", null, children)).replace(/<[^>]+>/g, ""), onSelect, disabled });
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
  useReorderPlanDay: (babyId: string) => {
    h.reorder.babyIds.push(babyId);
    return { mutate: (input: unknown) => h.reorder.calls.push(input), busy: h.reorder.busy, isError: h.reorder.isError };
  },
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
  h.reorder.busy = false;
  h.reorder.isError = false;
  h.reorder.babyIds.length = 0;
  h.reorder.calls.length = 0;
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

  it("Serve is the small button inside the card, with a 44px tap strip; ⋮ keeps its place (ledger 934)", () => {
    const html = render({ meal: meal(), onServe: () => {} });
    const serve = /<button class="([^"]*)" type="button" aria-label="Serve Lunch"/.exec(html)?.[1] ?? "";
    // Button's `sm` (36px, px-3 py-1.5), not the 44px `md`.
    expect(serve).toContain("min-h-9 px-3 py-1.5");
    expect(serve).not.toContain("min-h-11");
    // The invisible strip: 4px above and below the 36px button = 44px.
    expect(serve).toMatch(/(^| )relative after:absolute after:inset-x-0 after:-inset-y-1( |$)/);
    // With Serve the row is 36px (the wrapper trims the 44px ⋮ by 4px each
    // side), so Serve no longer overhangs the card's border; ⋮ stays -mr-2.5.
    expect(html).toContain('<div class="relative z-10 -my-1 -mr-2.5 flex shrink-0 items-center gap-1">');
    expect(html).not.toContain("-my-[9px]");
    // Without Serve the ⋮-only row keeps its old overhang (row height unchanged).
    expect(render({ meal: meal() })).toContain('<div class="relative z-10 -my-[9px] -mr-2.5 flex shrink-0 items-center gap-1">');
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

describe("⋮ Move up / Move down (909): that day's order, one place at a time", () => {
  const DAY = [id(40), id(50), id(60)];
  const labels = () => h.items.map((item) => item.label);

  it("sits between Copy to… and Remove; the first meal has no Move up, the last no Move down, a lone meal neither", () => {
    render({ meal: meal(), onCopy: () => {}, daySlotIds: DAY });
    expect(labels()).toEqual(["Copy to…", "Move up", "Move down", "Remove"]);
    h.items.length = 0;
    render({ meal: meal({ slotId: id(40) }), daySlotIds: DAY });
    expect(labels()).toEqual(["Move down", "Remove"]);
    h.items.length = 0;
    render({ meal: meal({ slotId: id(60) }), daySlotIds: DAY });
    expect(labels()).toEqual(["Move up", "Remove"]);
    h.items.length = 0;
    render({ meal: meal(), daySlotIds: [id(50)] });
    render({ meal: meal() });
    expect(labels()).toEqual(["Remove", "Remove"]);
  });

  it("sends the whole day in its new order, for this card's baby and day, and closes the menu", () => {
    render({ meal: meal(), daySlotIds: DAY });
    h.items.find((item) => item.label === "Move up")!.onSelect();
    h.items.find((item) => item.label === "Move down")!.onSelect();
    expect(h.reorder.calls).toEqual([
      { date: TODAY, slotIds: [id(50), id(40), id(60)] },
      { date: TODAY, slotIds: [id(40), id(60), id(50)] },
    ]);
    expect(h.reorder.babyIds[0]).toBe("baby-1");
    expect(h.closed).toBe(2);
    // The day's own list is never changed in place.
    expect(DAY).toEqual([id(40), id(50), id(60)]);
  });

  it("a served meal moves too", () => {
    render({ meal: meal({ served: { mealId: id(90), servedAt: "2026-10-14T11:42:00.000Z" } }), daySlotIds: DAY });
    expect(labels()).toEqual(["Move up", "Move down", "Remove"]);
  });

  it("waits offline and while a move is still landing; a failed one says try again", () => {
    h.offline = true;
    render({ meal: meal(), daySlotIds: DAY });
    expect(h.items.filter((item) => item.label.startsWith("Move")).map((item) => item.disabled)).toEqual([true, true]);
    h.offline = false;
    h.items.length = 0;
    h.reorder.busy = true;
    render({ meal: meal(), daySlotIds: DAY });
    expect(h.items.filter((item) => item.label.startsWith("Move")).map((item) => item.disabled)).toEqual([true, true]);
    h.reorder.busy = false;
    h.items.length = 0;
    render({ meal: meal(), daySlotIds: DAY });
    expect(h.items.filter((item) => item.label.startsWith("Move")).map((item) => item.disabled)).toEqual([false, false]);
    expect(render({ meal: meal(), daySlotIds: DAY })).not.toContain("move that");
    h.reorder.isError = true;
    expect(render({ meal: meal(), daySlotIds: DAY })).toContain(
      '<p role="alert" class="mt-1 text-xs text-[var(--color-danger)]">Couldn&#x27;t move that — try again.</p>',
    );
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
