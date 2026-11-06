// Daily meals (804, ledger 904, CD-Daily-Meals): what reaches PUT
// /daily-meals after the parent renames, adds, removes, reorders (arrow keys
// and a drag) and sets or clears times; the name rule; offline.
// Harness idiom: the vi.hoisted hook store (PlateScreen.handlers.test.ts).
// useState/useRef are a store, so the form is called as a plain function,
// its element tree read and its callbacks invoked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_MEALS_MAX, DEFAULT_DAILY_MEALS } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  return {
    store,
    offline: false,
    baby: { activeBaby: { id: "baby-1" } as { id: string } | null, isLoading: false },
    plan: { data: undefined as unknown, isError: false, isFetching: false },
    planArgs: [] as unknown[][],
    // Ledger 940: what the form told the leave guard, and the guard's answer.
    guard: { dirty: [] as boolean[], open: false, events: [] as string[] },
    backs: [] as string[],
    save: { isPending: false, isError: false, calls: [] as Array<{ input: unknown; options: { onSuccess?: () => void } }> },
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] = typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: h.useState,
  useRef: h.useRef,
  useId: () => "dm",
  useEffect: () => {},
}));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => h.offline }));
vi.mock("../../lib/leaveGuard.js", () => ({
  useLeaveGuard: (dirty: boolean) => {
    h.guard.dirty.push(dirty);
    return { open: h.guard.open, keep: () => h.guard.events.push("keep"), leave: () => h.guard.events.push("leave") };
  },
}));
vi.mock("../babies/useActiveBaby.js", () => ({ useActiveBaby: () => h.baby }));
vi.mock("../../components/ui/BackButton.js", () => ({
  BackButton: () => null,
  useBackNavigate: (fallback: string) => () => h.backs.push(fallback),
}));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "UTC",
}));
vi.mock("./hooks.js", () => ({
  usePlan: (...args: unknown[]) => {
    h.planArgs.push(args);
    return h.plan;
  },
  useSaveDailyMeals: () => ({
    mutate: (input: unknown, options: { onSuccess?: () => void }) => h.save.calls.push({ input, options }),
    get isPending() {
      return h.save.isPending;
    },
    get isError() {
      return h.save.isError;
    },
  }),
}));

import { Navigate } from "react-router-dom";
import { BackButton } from "../../components/ui/BackButton.js";
import { Button } from "../../components/ui/Button.js";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.js";
import { PageHeader } from "../../components/ui/PageHeader.js";
import { SkeletonList } from "../../components/ui/Skeleton.js";
import { HOUR_ITEMS, MERIDIEM_ITEMS, PickerSheetFooter, WheelColumn } from "../../components/ui/DateTimeField.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { DailyMealsForm, DailyMealsPage } from "./DailyMealsPage.js";
import { TimeSheet } from "./TimeSheet.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function findAll(node: unknown, match: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, out);
    return out;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return out;
  const el = node as El;
  if (match(el)) out.push(el);
  findAll(el.props.children, match, out);
  return out;
}
const text = (node: unknown): string =>
  Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" && "props" in node ? text((node as El).props.children) : "";

let done = 0;
function render(meals = DEFAULT_DAILY_MEALS): El {
  h.store.i = 0;
  h.store.r = 0;
  return (DailyMealsForm as unknown as (props: unknown) => El)({ babyId: "baby-1", meals, onDone: () => done++ });
}
const rows = (tree: El) => findAll(tree, (el) => el.type === "li");
const names = (tree: El) => findAll(tree, (el) => el.props["aria-label"] === "Meal name").map((input) => input.props.value);
const label = (tree: El, value: string) => findAll(tree, (el) => el.props["aria-label"] === value)[0]!;
const button = (tree: El, value: string) => findAll(tree, (el) => el.type === "button" && text(el.props.children).trim() === value)[0]!;
const type = (input: El, value: string) => (input.props.onChange as (event: unknown) => void)({ target: { value } });
const key = (handle: El, value: string) => {
  let prevented = false;
  (handle.props.onKeyDown as (event: unknown) => void)({ key: value, preventDefault: () => (prevented = true) });
  return prevented;
};
// The row's time button (926): its accessible name is "Time for <meal>: <shown>" (PP-COPY round 5).
const timeButton = (tree: El, meal: string) =>
  findAll(tree, (el) => el.type === "button" && text(el.props.children).startsWith(`Time for ${meal}: `))[0]!;
const timeSheet = (tree: El) => findAll(tree, (el) => el.type === TimeSheet)[0] as El | undefined;
/** Opens that meal's Time sheet and does `act` with the sheet's props. */
function withTime(meals: Parameters<typeof render>[0], meal: string, act: (sheet: Record<string, (time?: string) => void>) => void) {
  (timeButton(render(meals), meal).props.onClick as () => void)();
  act(timeSheet(render(meals))!.props as never);
}
const submit = (tree: El) => (tree.props.onSubmit as (event: unknown) => void)({ preventDefault: () => {} });
const saved = () => h.save.calls.map((call) => call.input);

beforeEach(() => {
  h.store.states.length = 0;
  h.store.refs.length = 0;
  h.offline = false;
  h.baby = { activeBaby: { id: "baby-1" }, isLoading: false };
  h.plan = { data: undefined, isError: false, isFetching: false };
  h.planArgs.length = 0;
  h.backs.length = 0;
  h.save.isPending = false;
  h.save.isError = false;
  h.save.calls.length = 0;
  h.guard = { dirty: [], open: false, events: [] };
  done = 0;
});

describe("Daily meals (CD-Daily-Meals)", () => {
  it("lists the saved meals, each with its handle, name, time and ×, under the rule and its line", () => {
    const tree = render([
      { id: DEFAULT_DAILY_MEALS[0]!.id, name: "Breakfast", time: "07:30" },
      { id: DEFAULT_DAILY_MEALS[1]!.id, name: "Morning snack", time: null },
    ]);
    expect(text(tree)).toContain(
      "New days start with these meals. Days you've already planned, and past days, keep the meals they have. Times are optional.",
    );
    expect(names(tree)).toEqual(["Breakfast", "Morning snack"]);
    expect(label(tree, "Move Breakfast").type).toBe("button");
    expect(label(tree, "Remove Morning snack").type).toBe("button");
    // The time is a button (926) named for its meal, showing the time in the
    // app's format, else "Add time"; it opens a dialog (the Time sheet).
    const times = findAll(tree, (el) => el.type === "button" && String(el.props.id).endsWith("-time"));
    expect(times.map((el) => [el.props.id, text(el.props.children).replace(/\u202f/g, " "), el.props["aria-haspopup"], el.props["aria-expanded"]])).toEqual([
      [`dm-${DEFAULT_DAILY_MEALS[0]!.id}-time`, "Time for Breakfast: 7:30 AM", "dialog", false],
      [`dm-${DEFAULT_DAILY_MEALS[1]!.id}-time`, "Time for Morning snack: Add time", "dialog", false],
    ]);
    expect(findAll(times[0]!, (el) => el.props.className === "sr-only").map(text)).toEqual(["Time for Breakfast: "]);
    expect(findAll(tree, (el) => el.props.type === "time")).toEqual([]);
    expect(timeSheet(tree)).toBeUndefined();
    expect(text(button(tree, "+ Add a meal"))).toBe("+ Add a meal");
  });

  it("renames, adds, removes and sets or clears a time, then saves exactly that (kept meals by id)", () => {
    let tree = render();
    type(label(tree, "Meal name"), "Brekkie");
    tree = render();
    (button(tree, "+ Add a meal").props.onClick as () => void)();
    tree = render();
    type(findAll(tree, (el) => el.props["aria-label"] === "Meal name").at(-1)!, "Bedtime snack");
    tree = render();
    (label(tree, "Remove Dinner").props.onClick as () => void)();
    tree = render();
    withTime(undefined, "Brekkie", (sheet) => sheet.onSave!("07:30"));
    withTime(undefined, "Bedtime snack", (sheet) => sheet.onSave!("19:15"));
    withTime(undefined, "Brekkie", (sheet) => sheet.onClear!());
    withTime(undefined, "Lunch", (sheet) => sheet.onSave!("12:00"));
    submit(render());
    expect(saved()).toEqual([
      {
        meals: [
          { id: DEFAULT_DAILY_MEALS[0]!.id, name: "Brekkie", time: null },
          { id: DEFAULT_DAILY_MEALS[1]!.id, name: "Lunch", time: "12:00" },
          { id: DEFAULT_DAILY_MEALS[3]!.id, name: "Snack", time: null },
          { name: "Bedtime snack", time: "19:15" },
        ],
      },
    ]);
    h.save.calls[0]!.options.onSuccess!();
    expect(done).toBe(1);
  });

  it("a saved time places its meal by the clock; the sheet closes back onto that row's time button (ledgers 925, 926)", () => {
    // The review copy's Daily meals (2026-11-03), already out of time order.
    const review = [
      { id: DEFAULT_DAILY_MEALS[0]!.id, name: "Breakfast", time: "09:39" },
      { id: DEFAULT_DAILY_MEALS[1]!.id, name: "Snack", time: "08:39" },
      { id: DEFAULT_DAILY_MEALS[2]!.id, name: "Lunch", time: "11:39" },
      { id: DEFAULT_DAILY_MEALS[3]!.id, name: "Dinner", time: "14:39" },
    ];
    const focusNext = () => h.store.refs[2]!;
    (button(render(review), "+ Add a meal").props.onClick as () => void)();
    type(findAll(render(review), (el) => el.props["aria-label"] === "Meal name").at(-1)!, "Brunch");
    focusNext().current = null;
    withTime(review, "Brunch", (sheet) => sheet.onSave!("11:40"));
    expect(names(render(review))).toEqual(["Breakfast", "Snack", "Lunch", "Brunch", "Dinner"]);
    expect(timeSheet(render(review))).toBeUndefined();
    expect(focusNext().current).toBe("dm-added-1-time");
    expect(timeButton(render(review), "Brunch").props.id).toBe("dm-added-1-time");

    // In clock order already: stays; the focus still returns to it.
    focusNext().current = null;
    withTime(review, "Brunch", (sheet) => sheet.onSave!("12:00"));
    expect(names(render(review))).toEqual(["Breakfast", "Snack", "Lunch", "Brunch", "Dinner"]);
    expect(focusNext().current).toBe("dm-added-1-time");
    // A cleared time stays where it is, and the focus returns to it; the untimed meal then never moves.
    focusNext().current = null;
    withTime(review, "Brunch", (sheet) => sheet.onClear!());
    expect(timeSheet(render(review))).toBeUndefined();
    expect(focusNext().current).toBe("dm-added-1-time");
    withTime(review, "Lunch", (sheet) => sheet.onSave!("15:00"));
    expect(names(render(review))).toEqual(["Breakfast", "Snack", "Brunch", "Dinner", "Lunch"]);
    // A drag or arrow keys afterwards still win, and that order is saved.
    expect(key(label(render(review), "Move Lunch"), "ArrowUp")).toBe(true);
    submit(render(review));
    expect((saved()[0] as { meals: { name: string; time: string | null }[] }).meals.map((meal) => [meal.name, meal.time])).toEqual([
      ["Breakfast", "09:39"],
      ["Snack", "08:39"],
      ["Brunch", null],
      ["Lunch", "15:00"],
      ["Dinner", "14:39"],
    ]);
  });

  it("the Time sheet: the X (or Escape, an outside tap) changes nothing, moves nothing, and returns the focus; Clear time only with a time (926)", () => {
    const review = [
      { id: DEFAULT_DAILY_MEALS[0]!.id, name: "Breakfast", time: "09:39" },
      { id: DEFAULT_DAILY_MEALS[1]!.id, name: "Snack", time: "08:39" },
      { id: DEFAULT_DAILY_MEALS[2]!.id, name: "Lunch", time: null },
    ];
    const focusNext = () => h.store.refs[2]!;
    (timeButton(render(review), "Breakfast").props.onClick as () => void)();
    let tree = render(review);
    expect(timeButton(tree, "Breakfast").props["aria-expanded"]).toBe(true);
    // One sheet, for that row, opening on its own time.
    expect(findAll(tree, (el) => el.type === TimeSheet)).toHaveLength(1);
    expect(timeButton(tree, "Breakfast").props.type).toBe("button"); // a tap must not submit the form
    expect(timeSheet(tree)!.props.time).toBe("09:39");
    // Out of clock order, yet nothing moved on opening, nor on Cancel.
    (timeSheet(tree)!.props.onClose as () => void)();
    tree = render(review);
    expect(timeSheet(tree)).toBeUndefined();
    expect(focusNext().current).toBe(`dm-${review[0]!.id}-time`);
    submit(tree);
    expect((saved()[0] as { meals: { name: string; time: string | null }[] }).meals.map((meal) => [meal.name, meal.time])).toEqual([
      ["Breakfast", "09:39"],
      ["Snack", "08:39"],
      ["Lunch", null],
    ]);
    // Save places it once, by the clock.
    withTime(review, "Breakfast", (sheet) => sheet.onSave!("09:40"));
    expect(names(render(review))).toEqual(["Snack", "Breakfast", "Lunch"]);
    expect(focusNext().current).toBe(`dm-${review[0]!.id}-time`);
  });

  it("the Time sheet's wheel: Hour, Minute in 5-minute steps, AM or PM; opens on the nearest step; Done hands back the wheel's time (926, 941)", () => {
    const sheet = (time: string | null, onSave: (time: string) => void = () => {}) => {
      h.store.states.length = 0;
      h.store.i = 0;
      return (TimeSheet as unknown as (props: unknown) => El)({ time, onSave, onClear: () => {}, onClose: () => {} });
    };
    const again = (time: string | null, onSave: (time: string) => void) => {
      h.store.i = 0;
      return (TimeSheet as unknown as (props: unknown) => El)({ time, onSave, onClear: () => {}, onClose: () => {} });
    };
    const columns = (tree: El) => findAll(tree, (el) => el.type === WheelColumn);
    let tree = sheet("09:39");
    expect(tree.type).toBe(Sheet);
    // Like Log meal's time picker (941): title "Time" with the X, ONE Done
    // (the shared PickerSheetFooter), Clear time in the header, no Buttons.
    expect(tree.props).toMatchObject({ open: true, title: "Time", showClose: true });
    expect(findAll(tree, (el) => el.type === PickerSheetFooter)).toHaveLength(1);
    expect(findAll(tree, (el) => el.type === Button)).toEqual([]);
    const clear = tree.props.headerAction as El;
    expect(clear.type).toBe("button");
    expect(clear.props.type).toBe("button");
    expect(text(clear.props.children)).toBe("Clear time");
    // Small and quiet, yet a 44px target.
    expect(clear.props.className).toBe("inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--color-accent)]");
    expect(columns(tree).map((col) => [col.props.ariaLabel, col.props.valueNow, col.props.valueMin, col.props.valueMax, col.props.loop ?? false])).toEqual([
      ["Hour", 9, 1, 12, true],
      ["Minute", 40, 0, 55, true],
      ["AM or PM", 0, 0, 1, false],
    ]);
    expect(columns(tree)[0]!.props.items).toBe(HOUR_ITEMS);
    expect(columns(tree)[2]!.props.items).toBe(MERIDIEM_ITEMS);
    expect((columns(tree)[1]!.props.items as { label: string }[]).map((item) => item.label)).toEqual(
      ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"],
    );
    // 23:58 opens on 11:55 PM, never wrapping to 12:00 AM.
    expect(columns(sheet("23:58")).map((col) => col.props.valueNow)).toEqual([11, 55, 1]);
    // Where each wheel OPENS (the index prop; a settled wheel writes it back into the draft).
    const opens = (time: string) => columns(sheet(time)).map((col) => col.props.index);
    expect(opens("09:39")).toEqual([8, 8, 0]);
    expect(opens("23:58")).toEqual([10, 11, 1]);
    expect(opens("12:00")).toEqual([11, 0, 1]);
    expect(opens("00:05")).toEqual([11, 1, 0]);
    // No time: no Clear time; still the X and Done.
    expect(sheet(null).props.headerAction).toBeUndefined();
    expect(sheet(null).props.showClose).toBe(true);
    expect(findAll(sheet(null), (el) => el.type === PickerSheetFooter)).toHaveLength(1);

    // Turned to 12:05 PM and Done; the odd 09:39 changes only on Done.
    const savedTimes: string[] = [];
    tree = sheet("09:39", (time) => savedTimes.push(time));
    (columns(tree)[0]!.props.onIndexChange as (i: number) => void)(11);
    (columns(again("09:39", (time) => savedTimes.push(time)))[1]!.props.onIndexChange as (i: number) => void)(1);
    (columns(again("09:39", (time) => savedTimes.push(time)))[2]!.props.onIndexChange as (i: number) => void)(1);
    tree = again("09:39", (time) => savedTimes.push(time));
    expect(savedTimes).toEqual([]);
    (findAll(tree, (el) => el.type === PickerSheetFooter)[0]!.props.onSave as () => void)();
    expect(savedTimes).toEqual(["12:05"]);

    // The sheet's own controls (verifier c2, 941): the X only closes, even after
    // the wheel turned (an odd 09:39 must not become 09:40); Clear time only
    // clears; the X, Escape and an outside tap are all the Sheet's onClose.
    const calls: string[] = [];
    const props = {
      time: "09:39",
      onSave: (time: string) => calls.push(`save ${time}`),
      onClear: () => calls.push("clear"),
      onClose: () => calls.push("close"),
    };
    h.store.states.length = 0;
    h.store.i = 0;
    tree = (TimeSheet as unknown as (p: unknown) => El)(props);
    expect(tree.props.onClose).toBe(props.onClose);
    (columns(tree)[0]!.props.onIndexChange as (i: number) => void)(11);
    h.store.i = 0;
    tree = (TimeSheet as unknown as (p: unknown) => El)(props);
    (tree.props.onClose as () => void)(); // the X / Escape / outside tap
    expect(calls).toEqual(["close"]);
    ((tree.props.headerAction as El).props.onClick as () => void)();
    expect(calls).toEqual(["close", "clear"]);
  });

  it("arrow keys on a handle move its meal one place, and stop at either end", () => {
    let tree = render();
    expect(key(label(tree, "Move Snack"), "ArrowUp")).toBe(true);
    tree = render();
    expect(names(tree)).toEqual(["Breakfast", "Lunch", "Snack", "Dinner"]);
    key(label(tree, "Move Breakfast"), "ArrowDown");
    tree = render();
    expect(names(tree)).toEqual(["Lunch", "Breakfast", "Snack", "Dinner"]);
    key(label(tree, "Move Lunch"), "ArrowUp");
    key(label(render(), "Move Dinner"), "ArrowDown");
    expect(key(label(render(), "Move Dinner"), "Enter")).toBe(false);
    expect(names(render())).toEqual(["Lunch", "Breakfast", "Snack", "Dinner"]);
  });

  it("a drag on a handle moves its meal to the row under the pointer, until the pointer lets go", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal("window", {
      addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    try {
      render();
      // The list's rows, 52px each from y=100 (useRef order: added, list, focus).
      h.store.refs[1]!.current = {
        children: [0, 1, 2, 3].map((index) => ({ getBoundingClientRect: () => ({ top: 100 + index * 52, bottom: 152 + index * 52 }) })),
      };
      (label(render(), "Move Breakfast").props.onPointerDown as (event: unknown) => void)({ button: 0 });
      // While dragged it lifts (910): the shadow token and a slight scale.
      expect(String(rows(render())[0]!.props.className)).toContain("scale-[1.03]");
      expect(String(rows(render())[0]!.props.className)).toContain("shadow-[var(--shadow-lg)]");
      expect(rows(render()).slice(1).map((row) => String(row.props.className).includes("scale-[1.03]"))).toEqual([false, false, false]);
      listeners.get("pointermove")!({ clientY: 230 });
      expect(names(render())).toEqual(["Lunch", "Dinner", "Breakfast", "Snack"]);
      listeners.get("pointermove")!({ clientY: 10 });
      expect(names(render())).toEqual(["Breakfast", "Lunch", "Dinner", "Snack"]);
      listeners.get("pointerup")!({});
      expect([...listeners.keys()]).toEqual([]);
      expect(String(rows(render())[0]!.props.className)).not.toContain("scale-[1.03]");
      expect(String(rows(render())[0]!.props.className)).not.toContain("shadow-[var(--shadow-lg)]");
      // Only the main button starts a drag.
      (label(render(), "Move Lunch").props.onPointerDown as (event: unknown) => void)({ button: 2 });
      expect(listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a long press on a row selects no text and opens no callout; its fields stay selectable; the lift eases, never under reduced motion (910)", () => {
    const tree = render();
    const classes = (el: El) => String(el.props.className).split(/\s+/);
    for (const row of rows(tree)) {
      expect(classes(row)).toEqual(expect.arrayContaining(["select-none", "[-webkit-touch-callout:none]"]));
      expect(classes(row)).toEqual(
        expect.arrayContaining(["transition-[scale,box-shadow]", "duration-[var(--duration-fast)]", "ease-[var(--ease-out)]", "motion-reduce:transition-none"]),
      );
    }
    for (const handle of findAll(tree, (el) => String(el.props["aria-label"]).startsWith("Move "))) expect(classes(handle)).toContain("touch-none");
    const fields = findAll(tree, (el) => el.type === "input");
    expect(fields).toHaveLength(4);
    for (const field of fields) expect(classes(field)).toEqual(expect.arrayContaining(["select-text", "[-webkit-touch-callout:default]"]));
  });

  it("keeps 1 to 12 meals: × is off on the last one, + Add a meal at twelve", () => {
    let tree = render([DEFAULT_DAILY_MEALS[0]!]);
    expect(label(tree, "Remove Breakfast").props.disabled).toBe(true);
    h.store.states.length = 0;
    tree = render(Array.from({ length: DAILY_MEALS_MAX }, (_, n) => ({ ...DEFAULT_DAILY_MEALS[0]!, id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` })));
    expect(button(tree, "+ Add a meal").props.disabled).toBe(true);
    expect(findAll(tree, (el) => String(el.props["aria-label"]).startsWith("Remove")).every((x) => !x.props.disabled)).toBe(true);
  });

  it("every meal needs a name: a blank one says so under its row and nothing is saved", () => {
    let tree = render();
    (button(tree, "+ Add a meal").props.onClick as () => void)();
    submit(render());
    expect(saved()).toEqual([]);
    tree = render();
    const blank = findAll(tree, (el) => el.props["aria-label"] === "Meal name").at(-1)!;
    expect(blank.props["aria-invalid"]).toBe(true);
    const error = findAll(tree, (el) => el.props.id === blank.props["aria-describedby"])[0]!;
    expect(text(error)).toBe("Name is required");
    // The others are fine.
    expect(findAll(tree, (el) => el.props["aria-invalid"] === true)).toHaveLength(1);
    type(blank, "Snack 2");
    expect(findAll(render(), (el) => el.props["aria-invalid"] === true)).toHaveLength(0);
    submit(render());
    expect(saved()).toHaveLength(1);
  });

  it("offline, Save waits and says why; saving says so; a failure says try again", () => {
    h.offline = true;
    const tree = render();
    let save = findAll(tree, (el) => el.type === Button)[0]!;
    expect(save.props.disabled).toBe(true);
    expect(save.props["aria-describedby"]).toBe("daily-meals-offline");
    expect(text(findAll(tree, (el) => el.props.id === "daily-meals-offline")[0])).toBe("You're offline.");
    h.offline = false;
    h.save.isPending = true;
    save = findAll(render(), (el) => el.type === Button)[0]!;
    expect([save.props.disabled, text(save.props.children)]).toEqual([true, "Saving…"]);
    h.save.isPending = false;
    h.save.isError = true;
    expect(findAll(render(), (el) => el.props.role === "alert").map(text)).toEqual(["Couldn't save that — try again."]);
  });
});

describe("Daily meals is a page (ledger 924)", () => {
  const page = () => {
    h.store.i = 0;
    h.store.r = 0;
    return (DailyMealsPage as unknown as () => El)();
  };
  const DAILY = [{ id: DEFAULT_DAILY_MEALS[0]!.id, name: "Breakfast", time: "07:30" }];

  it("has the slim header's back (to the plan when there is no history), titled Daily meals; waits for the plan's list", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T15:00:00Z"), toFake: ["Date"] });
    try {
      let tree = page();
      expect(h.planArgs).toEqual([["baby-1", "2026-10-12", "2026-10-18"]]); // today's week, the plan's own cache entry
      const header = findAll(tree, (el) => el.type === PageHeader)[0]!;
      expect(header.props.title).toBe("Daily meals");
      expect((header.props.leading as El).type).toBe(BackButton);
      expect((header.props.leading as El).props.fallback).toBe("/plan");
      expect(findAll(tree, (el) => el.type === SkeletonList)).toHaveLength(1);
      expect(findAll(tree, (el) => el.type === DailyMealsForm)).toHaveLength(0);

      // A cached copy (the offline cache restores one) waits for its refetch.
      h.plan = { data: { dailyMeals: DAILY }, isError: false, isFetching: true };
      expect(findAll(page(), (el) => el.type === DailyMealsForm)).toHaveLength(0);
      h.plan = { data: { dailyMeals: DAILY }, isError: false, isFetching: false };
      tree = page();
      const form = findAll(tree, (el) => el.type === DailyMealsForm)[0]!;
      expect(form.props).toMatchObject({ babyId: "baby-1", meals: DAILY });
      expect(findAll(tree, (el) => el.type === SkeletonList)).toHaveLength(0);

      // Verifier c1: once shown, a later refetch (back to the foreground,
      // back online) keeps the same form mounted, so unsaved edits survive.
      h.plan = { data: { dailyMeals: DAILY }, isError: false, isFetching: true };
      tree = page();
      expect(findAll(tree, (el) => el.type === DailyMealsForm)).toHaveLength(1);
      expect(findAll(tree, (el) => el.type === SkeletonList)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the week it opened on across midnight: Sunday 23:59, then Monday 00:01, asks for the same week (ledger 930)", () => {
    h.plan = { data: { dailyMeals: DAILY }, isError: false, isFetching: false };
    vi.useFakeTimers({ now: new Date("2026-10-18T23:59:00Z"), toFake: ["Date"] }); // a Sunday, UTC (deviceTimeZone is mocked)
    try {
      page();
      vi.setSystemTime(new Date("2026-10-19T00:01:00Z")); // Monday
      page();
      // A third render: a latch that set the week during render (verifier c1, M930-2) shows here.
      page();
      expect(h.planArgs).toEqual([
        ["baby-1", "2026-10-12", "2026-10-18"],
        ["baby-1", "2026-10-12", "2026-10-18"],
        ["baby-1", "2026-10-12", "2026-10-18"],
      ]);
      // A page opened on Monday asks for Monday's week (the clock is read).
      h.store.states.length = 0;
      page();
      expect(h.planArgs[3]).toEqual(["baby-1", "2026-10-19", "2026-10-25"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("switching the baby (header chip) waits for that baby's fresh list and starts a new form, keyed by baby (verifier c2)", () => {
    const forms = (tree: El) => findAll(tree, (el) => el.type === DailyMealsForm) as Array<El & { key: unknown }>;
    h.plan = { data: { dailyMeals: DAILY }, isError: false, isFetching: false };
    expect(forms(page()).map((form) => [form.key, form.props.babyId])).toEqual([["baby-1", "baby-1"]]);
    // Baby 2's week is cached (Home's Up next card) and refetching: not baby 1's form, nor baby 2's stale copy.
    const OTHER = [{ id: DEFAULT_DAILY_MEALS[1]!.id, name: "Lunch", time: null }];
    h.baby = { activeBaby: { id: "baby-2" }, isLoading: false };
    h.plan = { data: { dailyMeals: OTHER }, isError: false, isFetching: true };
    expect(forms(page())).toHaveLength(0);
    h.plan = { data: { dailyMeals: OTHER }, isError: false, isFetching: false };
    expect(forms(page()).map((form) => [form.key, form.props.babyId, form.props.meals])).toEqual([["baby-2", "baby-2", OTHER]]);
    // And baby 2's later refetch keeps its form, as for baby 1.
    h.plan = { data: { dailyMeals: OTHER }, isError: false, isFetching: true };
    expect(forms(page())).toHaveLength(1);
  });

  it("leaving with unsaved changes asks Leave without saving? (ledger 940): only after a change; Keep editing keeps the edits; Save never asks", () => {
    const lastDirty = () => h.guard.dirty[h.guard.dirty.length - 1];
    const dialog = (tree: El) => findAll(tree, (el) => el.type === ConfirmDialog)[0]!;
    let tree = render();
    // No change: nothing to ask.
    expect(lastDirty()).toBe(false);
    expect(dialog(tree).props).toMatchObject({
      open: false,
      title: "Leave without saving?",
      cancelLabel: "Keep editing",
      confirmLabel: "Leave",
      pending: false,
    });
    // "Loaded" is the list the form opened with: a later refetch with another
    // list (another device saved) is not the parent's change.
    render(DEFAULT_DAILY_MEALS.slice(0, 2));
    expect(lastDirty()).toBe(false);
    tree = render();
    // A change asks; typing it back is no change again.
    type(findAll(tree, (el) => el.props["aria-label"] === "Meal name")[0]!, "Brekkie");
    tree = render();
    expect(lastDirty()).toBe(true);
    type(findAll(tree, (el) => el.props["aria-label"] === "Meal name")[0]!, "Breakfast");
    tree = render();
    expect(lastDirty()).toBe(false);
    // Reordering, adding, removing or a time are changes too.
    key(label(tree, "Move Snack"), "ArrowUp");
    render();
    expect(lastDirty()).toBe(true);
    key(label(render(), "Move Snack"), "ArrowDown");
    render();
    expect(lastDirty()).toBe(false);
    withTime(undefined, "Lunch", (sheet) => sheet.onSave!("12:00"));
    tree = render();
    expect(lastDirty()).toBe(true);
    // The question up: Keep editing (or Escape / an outside tap) is the
    // guard's keep, the edits stay; Leave is the guard's leave.
    h.guard.open = true;
    tree = render();
    expect(dialog(tree).props.open).toBe(true);
    (dialog(tree).props.onClose as () => void)();
    (dialog(tree).props.onConfirm as () => void)();
    expect(h.guard.events).toEqual(["keep", "leave"]);
    expect(names(render())).toEqual(DEFAULT_DAILY_MEALS.map((meal) => meal.name));
    expect(text(timeButton(render(), "Lunch").props.children)).toBe("Time for Lunch: 12:00 PM");
    // Save never asks: its way back is onDone straight away, not the guard.
    h.guard.open = false;
    submit(render());
    h.save.calls[0]!.options.onSuccess!();
    expect(done).toBe(1);
    expect(h.guard.events).toEqual(["keep", "leave"]);
  });

  it("Save returns to the plan the way Back does (history first, so the plan keeps its week); nothing else leaves", () => {
    h.plan = { data: { dailyMeals: DAILY }, isError: false, isFetching: false };
    const form = findAll(page(), (el) => el.type === DailyMealsForm)[0]!;
    expect(h.backs).toEqual([]);
    (form.props.onDone as () => void)();
    expect(h.backs).toEqual(["/plan"]);
  });

  it("says so when the plan can't load; with no baby it goes to the plan, which asks for one", () => {
    h.plan = { data: undefined, isError: true, isFetching: false };
    expect(text(page())).toContain("Couldn't load the plan.");
    h.baby = { activeBaby: null, isLoading: false };
    const tree = page();
    expect(tree.type).toBe(Navigate);
    expect(tree.props).toMatchObject({ to: "/plan", replace: true });
  });
});
