// Drives ServeControl's OWN state without a DOM, to pin the one thing item
// 354 turns on: which `servedAt` actually reaches the serve mutation. A
// renderToString suite can only see a first render of a sheet nobody has
// touched, so it can prove the When field is THERE but never that tapping it
// changes the payload — and the server defaults an omitted `servedAt` to now,
// so a dropped value would still write a plausible-looking meal.
//
// Harness idiom: the vi.hoisted hook store from TourDialog.handlers.test.ts /
// AddStorageItemForm.handlers.test.ts. React's `useState` is replaced with a
// store, so the component can be called as a plain function, its element tree
// read, and its callbacks invoked.
import { describe, expect, it, vi } from "vitest";
import type { StorageItem } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const served: Array<{ id: string; input: { servedAt: string; servings: number } }> = [];

  return {
    store,
    served,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (value: unknown) => {
        store.states[i] =
          typeof value === "function" ? (value as (previous: unknown) => unknown)(store.states[i]) : value;
      };
      return [store.states[i], set];
    },
    reset: () => {
      store.states = [];
      store.i = 0;
      served.length = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});

vi.mock("../hooks.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useStorageServe: () => ({
      mutate: (variables: unknown) => {
        h.served.push(variables as (typeof h.served)[number]);
      },
      isPending: false,
      isError: false,
    }),
  };
});

import { ServeControl } from "./ServeSheet.js";
import { DateTimeField } from "../../../components/ui/DateTimeField.js";
import { Button } from "../../../components/ui/Button.js";

const ITEM: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [{ id: "food-1", slug: "avocado", name: "Avocado", emoji: null }],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-08-20T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-08-20T10:00:00.000Z",
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
};

interface Rendered {
  type: unknown;
  props: Record<string, unknown>;
}

/** The first element of this component type anywhere in the returned tree. */
function find(node: unknown, type: unknown): Rendered | null {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type);
      if (found) return found;
    }
    return null;
  }
  const element = node as Rendered;
  if (element.type === type) return element;
  return find(element.props?.children, type);
}

/** Renders the real body against the hook store — state survives between
 * calls, so a second render sees whatever the first one's callbacks set. */
function render(): Rendered {
  h.store.i = 0;
  return (ServeControl as unknown as (props: unknown) => Rendered)({ item: ITEM, babyId: "baby-1" });
}

function whenField(tree: Rendered): Rendered {
  const field = find(tree, DateTimeField);
  if (!field) throw new Error("the serve sheet should mount a When field");
  return field;
}

function serve(tree: Rendered) {
  const button = find(tree, Button);
  if (!button) throw new Error("the serve sheet should mount its Serve button");
  (button.props.onClick as () => void)();
}

describe("the Serve sheet's When field (item 354)", () => {
  it("defaults to now, so a parent who ignores the field still logs the current minute", () => {
    h.reset();
    const before = Date.now();
    serve(render());

    expect(h.served).toHaveLength(1);
    const servedAt = Date.parse(h.served[0]!.input.servedAt);
    expect(servedAt).toBeLessThanOrEqual(Date.now());
    // `nowAtMinute` truncates the seconds, so the default sits in the current
    // minute — never ahead of now, never more than a minute behind it.
    expect(before - servedAt).toBeLessThan(60_000);
    expect(new Date(servedAt).getSeconds()).toBe(0);
    expect(new Date(servedAt).getMilliseconds()).toBe(0);
  });

  it("sends the time the parent picked, not the moment they pressed Serve", () => {
    h.reset();
    const chosen = new Date("2026-08-21T09:05:00.000Z");
    (whenField(render()).props.onChange as (value: Date) => void)(chosen);

    const tree = render();
    expect(whenField(tree).props.value).toEqual(chosen);
    serve(tree);

    expect(h.served[0]!.input.servedAt).toBe(chosen.toISOString());
    // The rest of the payload is untouched by the new field.
    expect(h.served[0]!.id).toBe(ITEM.id);
    expect(h.served[0]!.input.servings).toBe(1);
  });

  it("hands the future-time guard to DateTimeField rather than re-implementing it", () => {
    h.reset();
    const field = whenField(render());
    expect(field.props.id).toBe("serve-when");
    // No `now` override and no custom max: the field's own Save-time guard
    // ("Time can't be in the future") is the only one in play.
    expect(field.props.now).toBeUndefined();
  });
});
