import { describe, expect, it } from "vitest";
import {
  AUTOSIZE_FALLBACK_LINE_HEIGHT,
  AUTOSIZE_MIN_ROWS,
  AUTOSIZE_SELECTOR,
  autosizeAll,
  autosizeTextarea,
  getAutosizeProps,
  resolveTextareaHeight,
} from "./autosize.js";

describe("resolveTextareaHeight (item 300)", () => {
  it("gives the content exactly the room it asked for", () => {
    expect(resolveTextareaHeight(120, 2, 24)).toBe(120);
    expect(resolveTextareaHeight(420, 2, 24)).toBe(420);
  });

  it("has no maximum — a long step keeps growing rather than scrolling", () => {
    expect(resolveTextareaHeight(5000, 2, 24)).toBe(5000);
  });

  it("never returns less than the two-row floor", () => {
    expect(resolveTextareaHeight(10, 2, 24)).toBe(48);
    expect(resolveTextareaHeight(48, 2, 24)).toBe(48);
  });

  // A field that isn't laid out yet (or is hidden) reports scrollHeight 0.
  // Handing that back would collapse the control to nothing.
  it("falls back to the floor when there is nothing to measure", () => {
    expect(resolveTextareaHeight(0, 2, 24)).toBe(48);
    expect(resolveTextareaHeight(-5, 2, 24)).toBe(48);
    expect(resolveTextareaHeight(Number.NaN, 2, 24)).toBe(48);
    expect(resolveTextareaHeight(Number.POSITIVE_INFINITY, 2, 24)).toBe(48);
  });

  it("rounds a fractional measurement up, so the last line is never clipped", () => {
    expect(resolveTextareaHeight(96.4, 2, 24)).toBe(97);
  });

  it("scales its floor with the row count and line height it is given", () => {
    expect(resolveTextareaHeight(10, 3, 20)).toBe(60);
    expect(resolveTextareaHeight(10, 4, 24)).toBe(96);
    // The floor is a floor, never a target: real content still wins.
    expect(resolveTextareaHeight(200, 3, 20)).toBe(200);
  });

  it("starts fields at two rows", () => {
    expect(AUTOSIZE_MIN_ROWS).toBe(2);
  });
});

/** The smallest thing `autosizeTextarea` can act on: a style bag, fixed box
 * metrics, and a window whose computed style we control. `border` is the
 * `offsetHeight - clientHeight` gap a real bordered control has. */
function fakeTextarea(
  scrollHeight: number,
  { lineHeight = "24px", boxSizing = "border-box", border = 0 } = {},
) {
  const style: Record<string, string> = {};
  const setHeights: string[] = [];
  return {
    el: {
      style: new Proxy(style, {
        set(target, key, value) {
          target[key as string] = value as string;
          if (key === "height") setHeights.push(value as string);
          return true;
        },
      }),
      scrollHeight,
      offsetHeight: border,
      clientHeight: 0,
      ownerDocument: { defaultView: { getComputedStyle: () => ({ lineHeight, boxSizing }) } },
    } as unknown as HTMLTextAreaElement,
    style,
    setHeights: () => setHeights,
  };
}

describe("autosizeTextarea", () => {
  it("measures against auto, then commits the resolved height", () => {
    const { el, style, setHeights } = fakeTextarea(137);
    autosizeTextarea(el);
    // "auto" FIRST: scrollHeight can never report less than the element's
    // current height, so measuring a grown box would make it one-way.
    expect(setHeights()).toEqual(["auto", "137px"]);
    expect(style.height).toBe("137px");
  });

  it("hides the inner scrollbar it is there to replace", () => {
    const { el, style } = fakeTextarea(137);
    autosizeTextarea(el);
    expect(style.overflowY).toBe("hidden");
  });

  it("applies the two-row floor to a field with no layout", () => {
    const { el, style } = fakeTextarea(0);
    autosizeTextarea(el);
    expect(style.height).toBe("48px");
  });

  it("falls back to a sane line height when the browser says 'normal'", () => {
    const { el, style } = fakeTextarea(0, { lineHeight: "normal" });
    autosizeTextarea(el);
    expect(style.height).toBe(`${AUTOSIZE_MIN_ROWS * AUTOSIZE_FALLBACK_LINE_HEIGHT}px`);
  });

  // Found by measuring a real control: under border-box the CSS `height`
  // covers the border but `scrollHeight` does not, so `height = scrollHeight`
  // leaves the last line clipped by exactly the border's width (2px on the
  // app's 1px-bordered controls).
  it("adds the border a border-box control's height has to cover", () => {
    const { el, style } = fakeTextarea(88, { border: 2 });
    autosizeTextarea(el);
    expect(style.height).toBe("90px");
  });

  it("adds nothing under content-box, where the two boxes already line up", () => {
    const { el, style } = fakeTextarea(88, { boxSizing: "content-box", border: 2 });
    autosizeTextarea(el);
    expect(style.height).toBe("88px");
  });

  it("does nothing at all when React hands it a null on unmount", () => {
    expect(() => autosizeTextarea(null)).not.toThrow();
    // No window to measure against (a detached node) is a no-op too, not a
    // crash: better a field that doesn't grow than one that throws mid-type.
    const orphan = { style: {}, scrollHeight: 100, ownerDocument: {} } as unknown as HTMLTextAreaElement;
    expect(() => autosizeTextarea(orphan)).not.toThrow();
    expect((orphan as unknown as { style: Record<string, string> }).style.height).toBeUndefined();
  });
});

describe("getAutosizeProps (the wiring, not just the rule)", () => {
  it("carries the attribute a render test can look for", () => {
    expect(getAutosizeProps()["data-autosize"]).toBe("true");
  });

  it("measures on mount and on every input", () => {
    const props = getAutosizeProps();
    const mounted = fakeTextarea(90);
    props.ref(mounted.el);
    expect(mounted.style.height).toBe("90px");

    const typed = fakeTextarea(210);
    props.onInput({ currentTarget: typed.el });
    expect(typed.style.height).toBe("210px");
  });

  // A stable ref is the point: React attaches it once instead of detaching
  // and re-measuring on every unrelated re-render of the form.
  it("hands React the same ref function every time", () => {
    expect(getAutosizeProps().ref).toBe(getAutosizeProps().ref);
  });
});

/** A container that answers `querySelectorAll` with the fields it was given,
 * recording the selector it was asked for. */
function fakeList(fields: HTMLTextAreaElement[]) {
  const asked: string[] = [];
  return {
    root: {
      querySelectorAll: (selector: string) => {
        asked.push(selector);
        return fields;
      },
    } as unknown as ParentNode,
    asked,
  };
}

describe("autosizeAll (item 300: a list of boxes, re-fitted together)", () => {
  it("fits every marked field under the root", () => {
    const short = fakeTextarea(66);
    const tall = fakeTextarea(160);
    autosizeAll(fakeList([short.el, tall.el]).root);
    expect(short.style.height).toBe("66px");
    expect(tall.style.height).toBe("160px");
  });

  it("looks for the same marker the wiring renders", () => {
    const list = fakeList([]);
    autosizeAll(list.root);
    expect(list.asked).toEqual([AUTOSIZE_SELECTOR]);
    expect(AUTOSIZE_SELECTOR).toBe(`[data-autosize="${getAutosizeProps()["data-autosize"]}"]`);
  });

  // THE regression (cycle 1): the step list is keyed by index, so removing a
  // step hands an existing <textarea> the next step's text — no `input`
  // event, no re-run of the stable ref. The box kept the removed step's
  // height while autosize's own `overflow-y: hidden` suppressed the
  // scrollbar, so the extra lines were invisible AND unreachable.
  it("re-fits a box that was handed taller text without an input event", () => {
    // Was two rows (66px) holding a two-line step; now holds a six-line one.
    const reused = fakeTextarea(160);
    reused.el.style.height = "66px";
    reused.el.style.overflowY = "hidden";
    autosizeAll(fakeList([reused.el]).root);
    // Measured from `auto`, never from the stale height it was sitting at.
    expect(reused.setHeights()).toEqual(["66px", "auto", "160px"]);
    expect(reused.style.height).toBe("160px");
  });

  // …and the other direction: a box that shrank should give the space back
  // rather than leave a gap where the removed step used to be.
  it("shrinks a box that was handed shorter text, down to the two-row floor", () => {
    const reused = fakeTextarea(0);
    reused.el.style.height = "162px";
    autosizeAll(fakeList([reused.el]).root);
    expect(reused.style.height).toBe("48px");
  });

  it("does nothing when there is no list to measure", () => {
    expect(() => autosizeAll(null)).not.toThrow();
    expect(() => autosizeAll(undefined)).not.toThrow();
    // A stub with no `querySelectorAll` (a server render, a test double) is a
    // no-op too, not a crash.
    expect(() => autosizeAll({} as unknown as ParentNode)).not.toThrow();
  });
});
