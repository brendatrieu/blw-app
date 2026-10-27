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
vi.mock("./hooks.js", () => ({
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

import { Button } from "../../components/ui/Button.js";
import { DailyMealsForm } from "./DailyMealsSheet.js";

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
const submit = (tree: El) => (tree.props.onSubmit as (event: unknown) => void)({ preventDefault: () => {} });
const saved = () => h.save.calls.map((call) => call.input);

beforeEach(() => {
  h.store.states.length = 0;
  h.store.refs.length = 0;
  h.offline = false;
  h.save.isPending = false;
  h.save.isError = false;
  h.save.calls.length = 0;
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
    const times = findAll(tree, (el) => el.props.type === "time");
    expect(times.map((input) => [input.props["aria-label"], input.props.value])).toEqual([
      ["Time for Breakfast", "07:30"],
      ["Time for Morning snack", ""],
    ]);
    // What the field shows: the time in the app's format, else "Add time".
    expect(rows(tree).map((row) => text(findAll(row, (el) => el.type === "label")[0]).replace(/\u202f/g, " "))).toEqual(["7:30 AM", "Add time"]);
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
    const time = (meal: string) => findAll(render(), (el) => el.props["aria-label"] === `Time for ${meal}`)[0]!;
    type(time("Brekkie"), "07:30");
    type(time("Bedtime snack"), "19:15:00");
    type(time("Brekkie"), "");
    type(time("Lunch"), "12:00");
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
        expect.arrayContaining(["transition-[scale,box-shadow]", "duration-[var(--duration-fast)]", "motion-reduce:transition-none"]),
      );
    }
    for (const handle of findAll(tree, (el) => String(el.props["aria-label"]).startsWith("Move "))) expect(classes(handle)).toContain("touch-none");
    const fields = findAll(tree, (el) => el.type === "input");
    expect(fields).toHaveLength(8);
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
