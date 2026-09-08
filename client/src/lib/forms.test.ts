import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  firstInvalidField,
  focusFieldById,
  isFormValid,
  looksLikeEmail,
  useSubmitValidation,
  visibleErrors,
  type FormErrors,
} from "./forms.js";

type Key = "title" | "ingredients" | "steps";
const ORDER: readonly Key[] = ["title", "ingredients", "steps"];

describe("isFormValid", () => {
  it("reads an empty object as valid", () => {
    expect(isFormValid({})).toBe(true);
  });

  it("reads any message as invalid", () => {
    expect(isFormValid<Key>({ steps: "Add at least one step" })).toBe(false);
  });

  it("ignores keys explicitly set to undefined", () => {
    const errors: FormErrors<Key> = { title: undefined };
    expect(isFormValid(errors)).toBe(true);
  });
});

describe("firstInvalidField", () => {
  it("returns null when nothing is wrong", () => {
    expect(firstInvalidField<Key>({}, ORDER)).toBeNull();
  });

  it("picks the topmost invalid field, not the first key of the object", () => {
    const errors: FormErrors<Key> = { steps: "Add at least one step", title: "Title is required" };
    expect(firstInvalidField(errors, ORDER)).toBe("title");
  });

  it("skips fields that are fine", () => {
    expect(firstInvalidField<Key>({ ingredients: "Add at least one ingredient" }, ORDER)).toBe("ingredients");
  });

  it("ignores an error whose key is not in the order", () => {
    expect(firstInvalidField({ notes: "too long" } as FormErrors<Key>, ORDER)).toBeNull();
  });

  it("treats an undefined message as no error", () => {
    expect(firstInvalidField<Key>({ title: undefined, steps: "Add at least one step" }, ORDER)).toBe("steps");
  });
});

describe("focusFieldById", () => {
  // These tests run with no DOM env at all (node), which is exactly the
  // condition the guard exists for: the helper must be safe to call from a
  // submit handler that a renderToString test never triggers, and safe when a
  // field has no focusable control of its own.
  it("does nothing, and never throws, without a document or an id", () => {
    expect(() => {
      focusFieldById("login-email");
    }).not.toThrow();
    expect(() => {
      focusFieldById(undefined);
    }).not.toThrow();
    expect(() => {
      focusFieldById(null);
    }).not.toThrow();
  });
});

describe("visibleErrors", () => {
  const errors: FormErrors<Key> = { title: "Title is required" };

  it("shows nothing before the first submit attempt", () => {
    expect(visibleErrors(errors, false)).toEqual({});
  });

  it("shows everything once a submit has been attempted", () => {
    expect(visibleErrors(errors, true)).toEqual(errors);
  });

  it("still shows nothing after an attempt on a valid form", () => {
    expect(visibleErrors<Key>({}, true)).toEqual({});
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses, trimming first", () => {
    expect(looksLikeEmail("parent@example.com")).toBe(true);
    expect(looksLikeEmail("  parent@example.co.uk  ")).toBe(true);
    expect(looksLikeEmail("first.last+baby@example.com")).toBe(true);
  });

  it("rejects the obvious typos", () => {
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail("parent")).toBe(false);
    expect(looksLikeEmail("parent@example")).toBe(false);
    expect(looksLikeEmail("parent example.com")).toBe(false);
    expect(looksLikeEmail("@example.com")).toBe(false);
  });
});

describe("useSubmitValidation", () => {
  // The hook is what every form's submit handler is wired to, so its own
  // behaviour on a failed attempt — errors become visible, the topmost broken
  // field is focused, `false` comes back so the handler returns before the
  // API — is pinned here rather than only per form. `attemptSubmit` is called
  // once during a `renderToString` pass (no DOM env, no submit event to
  // dispatch); the render-phase `setAttempted` re-runs the probe, which is
  // exactly the "message appears after the attempt" transition.
  function renderAttempt(values: { title: string }): { html: string; result: boolean | null; focused: string[] } {
    const focused: string[] = [];
    let result: boolean | null = null;
    let calls = 0;

    function Probe() {
      const { errors, attemptSubmit } = useSubmitValidation(
        values,
        (current: { title: string }): FormErrors<Key> =>
          current.title.trim() ? {} : { title: "Title is required" },
        ORDER,
        { title: "probe-title" },
      );
      if (calls === 0) {
        calls += 1;
        result = attemptSubmit();
      }
      return createElement("p", null, errors.title ?? "no error");
    }

    const globals = globalThis as { document?: unknown };
    globals.document = {
      getElementById: (id: string) => ({
        focus: () => {
          focused.push(id);
        },
      }),
    };
    try {
      return { html: renderToString(createElement(Probe)), result, focused };
    } finally {
      delete globals.document;
    }
  }

  it("refuses the submit, shows the message and focuses the broken field", () => {
    const { html, result, focused } = renderAttempt({ title: "  " });
    expect(result).toBe(false);
    expect(focused).toEqual(["probe-title"]);
    expect(html).toContain("Title is required");
  });

  it("allows the submit and focuses nothing when the values are fine", () => {
    const { html, result, focused } = renderAttempt({ title: "Lentil mash" });
    expect(result).toBe(true);
    expect(focused).toEqual([]);
    expect(html).toContain("no error");
  });
});
