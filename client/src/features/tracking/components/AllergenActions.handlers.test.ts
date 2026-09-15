// Drives the mark sheet's OWN state without a DOM, to pin the one thing item
// 365 turns on: which instant actually reaches the override. A renderToString
// suite can only see a sheet nobody has touched, so it can prove the When
// field is THERE but never that picking a date changes the payload — and the
// server defaults an omitted `establishedAt` to now, so a dropped value would
// still write a plausible-looking mark whose countdown starts today.
//
// Harness idiom: the vi.hoisted hook store from ServeSheet.handlers.test.ts.
// React's `useState` is replaced with a store, so the components can be called
// as plain functions, their element trees read, and their callbacks invoked.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  const marked: Array<{
    variables: { allergenSlug: string; establishedAt: string };
    options?: { onSuccess?: () => void };
  }> = [];

  return {
    store,
    marked,
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
      marked.length = 0;
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
    useMarkAllergenEstablished: () => ({
      mutate: (variables: unknown, options: unknown) => {
        h.marked.push({ variables, options } as (typeof h.marked)[number]);
      },
      isPending: false,
      isError: false,
    }),
  };
});

import { MarkEstablishedAction, MarkEstablishedForm } from "./AllergenActions.js";
import { DateTimeField } from "../../../components/ui/DateTimeField.js";
import { Button } from "../../../components/ui/Button.js";
import { Sheet } from "../../../components/ui/Sheet.js";

const BABY_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "peanut";

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
function renderForm(onMarked?: () => void): Rendered {
  h.store.i = 0;
  return (MarkEstablishedForm as unknown as (props: unknown) => Rendered)({
    babyId: BABY_ID,
    allergenSlug: SLUG,
    onMarked,
  });
}

function renderAction(): Rendered {
  h.store.i = 0;
  return (MarkEstablishedAction as unknown as (props: unknown) => Rendered)({
    babyId: BABY_ID,
    allergenSlug: SLUG,
  });
}

function whenField(tree: Rendered): Rendered {
  const field = find(tree, DateTimeField);
  if (!field) throw new Error("the mark sheet should mount a When field");
  return field;
}

function submit(tree: Rendered) {
  const button = find(tree, Button);
  if (!button) throw new Error("the mark sheet should mount its Mark established button");
  (button.props.onClick as () => void)();
}

describe("the mark sheet's When field (item 365)", () => {
  it("defaults to now, so a parent who ignores the field marks it as of today", () => {
    h.reset();
    const before = Date.now();
    submit(renderForm());

    expect(h.marked).toHaveLength(1);
    expect(h.marked[0]!.variables.allergenSlug).toBe(SLUG);
    const establishedAt = Date.parse(h.marked[0]!.variables.establishedAt);
    expect(establishedAt).toBeLessThanOrEqual(Date.now());
    // `nowAtMinute` truncates the seconds, so the default sits in the current
    // minute — never ahead of now, never more than a minute behind it.
    expect(before - establishedAt).toBeLessThan(60_000);
    expect(new Date(establishedAt).getSeconds()).toBe(0);
    expect(new Date(establishedAt).getMilliseconds()).toBe(0);
  });

  it("sends the date the parent picked, not the moment they pressed the button", () => {
    h.reset();
    const chosen = new Date("2026-06-21T09:05:00.000Z");
    (whenField(renderForm()).props.onChange as (value: Date) => void)(chosen);

    const tree = renderForm();
    expect(whenField(tree).props.value).toEqual(chosen);
    submit(tree);

    expect(h.marked[0]!.variables).toEqual({ allergenSlug: SLUG, establishedAt: chosen.toISOString() });
  });

  it("hands the future guard to DateTimeField rather than re-implementing it", () => {
    h.reset();
    const field = whenField(renderForm());
    expect(field.props.id).toBe("allergen-established-when");
    // No `now` override: the field's own Save-time guard ("Time can't be in
    // the future") is the only one in play.
    expect(field.props.now).toBeUndefined();
  });

  it("closes the sheet only once the write succeeds", () => {
    h.reset();
    const onMarked = vi.fn();
    submit(renderForm(onMarked));

    expect(onMarked).not.toHaveBeenCalled();
    (h.marked[0]!.options?.onSuccess as () => void)();
    expect(onMarked).toHaveBeenCalledTimes(1);
  });
});

describe("the mark trigger opens a sheet rather than writing on tap (item 365)", () => {
  it("starts closed, with the sheet titled 'Mark as established'", () => {
    h.reset();
    const sheet = find(renderAction(), Sheet);
    expect(sheet?.props.open).toBe(false);
    expect(sheet?.props.title).toBe("Mark as established");
    // Nothing is written by merely rendering the row.
    expect(h.marked).toHaveLength(0);
  });

  it("opens on tap and writes nothing yet", () => {
    h.reset();
    const trigger = find(renderAction(), Button);
    expect(trigger?.props.children).toBe("Mark as established");
    (trigger!.props.onClick as () => void)();

    expect(find(renderAction(), Sheet)?.props.open).toBe(true);
    expect(h.marked).toHaveLength(0);
  });

  it("closes again when the body reports a successful mark", () => {
    h.reset();
    (find(renderAction(), Button)!.props.onClick as () => void)();
    const body = find(renderAction(), Sheet)!.props.children as Rendered;

    expect(body.type).toBe(MarkEstablishedForm);
    (body.props.onMarked as () => void)();
    expect(find(renderAction(), Sheet)?.props.open).toBe(false);
  });
});
