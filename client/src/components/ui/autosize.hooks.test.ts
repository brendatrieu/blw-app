// Drives `useAutosizeListProps` without a DOM: React's `useRef`/`useEffect`
// are replaced with a tiny store that models the two things this hook
// depends on — a ref that survives re-renders, and an effect that re-runs
// only when its deps change. Same harness pattern as
// `DateTimeField.handlers.test.ts`.
//
// What it pins is item 300's list case (cycle 1 regression): the step list is
// keyed by index, so removing a step hands an EXISTING <textarea> the next
// step's text — no `input` event, no re-run of the stable ref — and the box
// would keep the removed step's height with `overflow-y: hidden` already set,
// hiding text that could not even be scrolled to.
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const store = {
    refs: [] as { current: unknown }[],
    r: 0,
    e: 0,
    deps: [] as (unknown[] | undefined)[],
    pending: [] as (() => void)[],
  };
  return {
    store,
    useRef: (init: unknown) => {
      const i = store.r++;
      if (!(i in store.refs)) store.refs[i] = { current: init };
      return store.refs[i];
    },
    // React's own rule: run on mount, and afterwards only when a dep changed.
    useEffect: (fn: () => void, deps?: unknown[]) => {
      const i = store.e++;
      const had = i in store.deps;
      const prev = store.deps[i];
      const changed =
        !had || !deps || !prev || deps.length !== prev.length || deps.some((d, j) => !Object.is(d, prev[j]));
      store.deps[i] = deps;
      if (changed) store.pending.push(fn);
    },
    /** Start a render pass: hook slots rewind, committed effects stay. */
    startRender: () => {
      store.r = 0;
      store.e = 0;
      store.pending = [];
    },
    reset: () => {
      store.refs = [];
      store.deps = [];
      store.r = 0;
      store.e = 0;
      store.pending = [];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useRef: h.useRef, useEffect: h.useEffect };
});

import { useAutosizeListProps } from "./autosize.js";

/** A textarea whose style is a plain bag and whose metrics we choose. */
function fakeStep(scrollHeight: number, startingHeight?: string) {
  const style: Record<string, string> = {};
  if (startingHeight) style.height = startingHeight;
  return {
    style,
    el: {
      style,
      scrollHeight,
      offsetHeight: 0,
      clientHeight: 0,
      ownerDocument: {
        defaultView: { getComputedStyle: () => ({ lineHeight: "24px", boxSizing: "border-box" }) },
      },
    } as unknown as HTMLTextAreaElement,
  };
}

/** A stand-in <ol> holding the given step boxes. */
function fakeList(fields: HTMLTextAreaElement[]) {
  return { querySelectorAll: () => fields } as unknown as HTMLOListElement;
}

/** One render of a component whose only hook is this one, plus the commit:
 * React attaches the DOM ref BEFORE effects run, which is what `attach`
 * models, and then the effects whose deps changed fire. */
function render(rowCount: number, attach?: HTMLOListElement | null) {
  h.startRender();
  const props = useAutosizeListProps<HTMLOListElement>(rowCount);
  if (attach !== undefined) props.ref.current = attach;
  const ran = h.store.pending.length;
  for (const effect of h.store.pending) effect();
  return { props, effectsRun: ran };
}

describe("useAutosizeListProps (item 300: a list that re-fits itself)", () => {
  it("carries a marker a render test can see, and one ref across renders", () => {
    h.reset();
    const first = render(1, null);
    expect(first.props["data-autosize-list"]).toBe("true");
    const second = render(2, null);
    expect(second.props.ref).toBe(first.props.ref);
  });

  it("fits every step box once the list is attached", () => {
    h.reset();
    const two = fakeStep(66);
    const six = fakeStep(162);
    render(2, fakeList([two.el, six.el]));
    expect(two.style.height).toBe("66px");
    expect(six.style.height).toBe("162px");
    expect(two.style.overflowY).toBe("hidden");
  });

  // THE fix. Three steps of 2/2/6 lines sit at 66/66/162px; removing step 2
  // leaves two boxes, and the SECOND one — previously the 66px two-liner —
  // is now showing the six-line step. Without this effect it stayed at 66px
  // with its scrollbar hidden: four lines present, invisible, unreachable.
  it("re-fits the boxes a removal shifted text into", () => {
    h.reset();
    const first = fakeStep(66, "66px");
    // Same element as before the removal: stale 66px height, new tall text.
    const reused = fakeStep(162, "66px");
    render(3, fakeList([first.el, reused.el, fakeStep(162, "162px").el]));
    const after = render(2, fakeList([first.el, reused.el]));
    expect(after.effectsRun).toBe(1);
    expect(reused.style.height).toBe("162px");
    expect(first.style.height).toBe("66px");
  });

  it("also gives back the space when a removal shifts SHORTER text in", () => {
    h.reset();
    const reused = fakeStep(66, "162px");
    render(3, fakeList([reused.el]));
    render(2, fakeList([reused.el]));
    expect(reused.style.height).toBe("66px");
  });

  // Typing is already handled by `getAutosizeProps().onInput` on the box
  // being typed in; re-measuring all 20 boxes on every keystroke would be
  // pure layout thrash, so a render that keeps the count runs nothing.
  it("does not re-measure the list on a render that keeps the same count", () => {
    h.reset();
    const step = fakeStep(66);
    const list = fakeList([step.el]);
    expect(render(1, list).effectsRun).toBe(1);
    expect(render(1, list).effectsRun).toBe(0);
    expect(render(1, list).effectsRun).toBe(0);
    // …and adding a step does measure again.
    expect(render(2, list).effectsRun).toBe(1);
  });

  it("is a no-op before the list is attached", () => {
    h.reset();
    expect(() => render(2, null)).not.toThrow();
  });
});
