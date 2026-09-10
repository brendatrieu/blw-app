// Drives DateTimeField's real handlers without a DOM: React's hooks are
// replaced with a tiny store so the component can be called as a function,
// its Sheet/body/footer element props read, and their callbacks invoked.
// This is what pins the behavior the renderToString tests can't reach —
// Done on a future draft keeping the sheet open, row taps landing on the
// tapped copy. Ported from the fresh-eyes verifier's harness (2026-09-09).
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], refs: [] as { current: unknown }[], i: 0, r: 0 };
  return {
    store,
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (v: unknown) => {
        store.states[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(store.states[i]) : v;
      };
      return [store.states[i], set];
    },
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    reset: () => {
      store.states = [];
      store.refs = [];
      store.i = 0;
      store.r = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState, useRef: h.useRef, useEffect: () => {}, useId: () => "tmp" };
});

import {
  DateTimeField,
  PickerSheetFooter,
  WheelPickerBody,
  WheelColumn,
  FUTURE_TIME_ERROR,
  combineDateTime,
  WHEEL_ROW_HEIGHT,
  type SplitDateTime,
} from "./DateTimeField.js";

const NOW = new Date(2026, 8, 8, 14, 5, 42, 500); // 2:05:42.5 PM

function renderField(props: Record<string, unknown>) {
  h.store.i = 0;
  h.store.r = 0;
  const tree = (DateTimeField as unknown as (p: unknown) => any)(props);
  const kids = tree.props.children as any[];
  const sheet = kids[1];
  const [body, footer] = sheet.props.children as any[];
  expect(body.type).toBe(WheelPickerBody);
  expect(footer.type).toBe(PickerSheetFooter);
  return { button: kids[0], sheet, body, footer };
}

describe("item 269 — handleSave on a future draft", () => {
  it("does not commit or close, shows the error, clears on draft change and on reopen", () => {
    h.reset();
    const onChange = vi.fn();
    const props = { value: new Date(2026, 8, 8, 13, 0), onChange, now: NOW };
    let v = renderField(props);
    v.button.props.onClick(); // open
    v = renderField(props);
    expect(v.sheet.props.open).toBe(true);

    const future: SplitDateTime = { dayIndex: 0, hour12: 2, minute: 6, meridiem: "PM" }; // 14:06 > 14:05
    v.body.props.onDraftChange(future);
    v = renderField(props);
    v.footer.props.onSave();
    v = renderField(props);
    expect(onChange).not.toHaveBeenCalled();
    expect(v.sheet.props.open).toBe(true);
    expect(v.footer.props.error).toBe(FUTURE_TIME_ERROR);

    // clears on draft change
    const valid: SplitDateTime = { dayIndex: 0, hour12: 2, minute: 5, meridiem: "PM" };
    v.body.props.onDraftChange(valid);
    v = renderField(props);
    expect(v.footer.props.error).toBeNull();

    // equal-to-now-at-minute commits exactly the combined date (no clamp to seconds)
    v.footer.props.onSave();
    v = renderField(props);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(new Date(2026, 8, 8, 14, 5, 0, 0));
    expect(v.sheet.props.open).toBe(false);

    // past draft commits exactly, no clamp
    v.button.props.onClick();
    v = renderField(props);
    const past: SplitDateTime = { dayIndex: 3, hour12: 9, minute: 17, meridiem: "AM" };
    v.body.props.onDraftChange(past);
    v = renderField(props);
    v.footer.props.onSave();
    expect(onChange.mock.calls[1][0]).toEqual(combineDateTime(past, NOW));
    expect(combineDateTime(past, NOW)).toEqual(new Date(2026, 8, 5, 9, 17, 0, 0));
  });

  it("clears the error when the sheet reopens", () => {
    h.reset();
    const onChange = vi.fn();
    const props = { value: new Date(2026, 8, 8, 13, 0), onChange, now: NOW };
    let v = renderField(props);
    v.button.props.onClick();
    v = renderField(props);
    v.body.props.onDraftChange({ dayIndex: 0, hour12: 11, minute: 59, meridiem: "PM" });
    v = renderField(props);
    v.footer.props.onSave();
    v = renderField(props);
    expect(v.footer.props.error).toBe(FUTURE_TIME_ERROR);
    v.button.props.onClick(); // reopen
    v = renderField(props);
    expect(v.footer.props.error).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled field never opens", () => {
    h.reset();
    const props = { value: NOW, onChange: vi.fn(), now: NOW, disabled: true };
    let v = renderField(props);
    v.button.props.onClick();
    v = renderField(props);
    expect(v.sheet.props.open).toBe(false);
  });
});

describe("item 270 — wheel row taps", () => {
  function renderColumn(props: Record<string, unknown>) {
    h.store.i = 0;
    h.store.r = 0;
    return (WheelColumn as unknown as (p: unknown) => any)(props);
  }

  it("loop column: tapping a row lands on that absolute row and its true index", () => {
    h.reset();
    const onIndexChange = vi.fn();
    const items = Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: String(i + 1) }));
    const props = { ariaLabel: "Hour", items, index: 0, onIndexChange, valueNow: 1, valueMin: 1, valueMax: 12, loop: true };
    renderColumn(props);
    const scrolls: any[] = [];
    h.store.refs[0]!.current = { scrollTo: (o: unknown) => scrolls.push(o) };
    const tree = renderColumn(props);
    const rows = tree.props.children as any[];
    expect(rows.length).toBe(60);
    expect(tree.props.className).not.toContain("scroll-thin");
    // every row is tappable
    expect(rows.every((r) => typeof r.props.onClick === "function")).toBe(true);
    rows[38]!.props.onClick();
    expect(onIndexChange).toHaveBeenCalledWith(2); // 38 % 12
    expect(scrolls.at(-1)).toEqual({ top: 38 * WHEEL_ROW_HEIGHT, behavior: "smooth" });
    expect(h.store.refs[2]!.current).toBe(38); // absoluteRowRef = tapped copy, not middle (26)
  });

  it("plain column: tapping row N selects index N", () => {
    h.reset();
    const onIndexChange = vi.fn();
    const items = Array.from({ length: 6 }, (_, i) => ({ key: String(i), label: String(i) }));
    const props = { ariaLabel: "Date", items, index: 0, onIndexChange, valueNow: 0, valueMin: 0, valueMax: 5 };
    renderColumn(props);
    const scrolls: any[] = [];
    h.store.refs[0]!.current = { scrollTo: (o: unknown) => scrolls.push(o) };
    const tree = renderColumn(props);
    const rows = tree.props.children as any[];
    expect(rows.length).toBe(6);
    rows[4]!.props.onClick();
    expect(onIndexChange).toHaveBeenCalledWith(4);
    expect(scrolls.at(-1)).toEqual({ top: 4 * WHEEL_ROW_HEIGHT, behavior: "smooth" });
  });
});
