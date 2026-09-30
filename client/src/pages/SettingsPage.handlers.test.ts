// Items 606, 610: Settings › delete baby asks in the shared delete pop-up, not
// the browser's window.confirm. BabyRow is called as a plain function with its
// hooks mocked (idiom from RecipeDetailPage.handlers).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Baby } from "@blw/shared";

const h = vi.hoisted(() => {
  const store = { states: [] as unknown[], i: 0 };
  return {
    store,
    deletes: [] as unknown[],
    activeCleared: [] as unknown[],
    useState: (init: unknown) => {
      const i = store.i++;
      if (!(i in store.states)) store.states[i] = init;
      return [store.states[i], (value: unknown) => (store.states[i] = value)];
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useState: h.useState };
});
vi.mock("../features/babies/hooks.js", () => ({
  useBabies: () => ({}),
  useCreateBaby: () => ({}),
  useUpdateBaby: () => ({ isPending: false, mutate: () => {} }),
  useDeleteBaby: () => ({ isPending: false, mutate: (id: unknown) => h.deletes.push(id) }),
}));
vi.mock("../features/babies/useActiveBaby.js", () => ({
  useActiveBaby: () => ({ activeBaby: { id: "baby-1" }, setActiveBabyId: (id: unknown) => h.activeCleared.push(id) }),
}));
vi.mock("../lib/forms.js", () => ({
  useSubmitValidation: () => ({ errors: {}, attemptSubmit: () => true }),
}));

import { ConfirmDialog } from "../components/ui/ConfirmDialog.js";
import { BabyRow, DELETE_BABY_LINE } from "./SettingsPage.js";

interface El {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown };
}
function find(node: unknown, match: (el: El) => boolean): El | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as El;
  return match(el) ? el : find(el.props.children, match);
}

const BABY = { id: "baby-1", name: "Pip", birthDate: "2026-01-15", notes: null, archived: false } as unknown as Baby;

function render(): El {
  h.store.i = 0;
  return (BabyRow as unknown as (props: unknown) => El)({ baby: BABY });
}
const dialogOf = (tree: El) => find(tree, (el) => el.type === ConfirmDialog)!;
const askToDelete = () => {
  const del = find(render(), (el) => el.type === "button" && el.props.children === "Delete")!;
  (del.props.onClick as () => void)();
};

const confirmSpy = vi.fn(() => true);
beforeEach(() => {
  h.store.states = [];
  h.deletes = [];
  h.activeCleared = [];
  confirmSpy.mockClear();
  (globalThis as { window?: unknown }).window = { confirm: confirmSpy };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("Settings › delete baby (items 606, 610)", () => {
  it("Delete opens the pop-up — the question and one line about what goes with them — never window.confirm", () => {
    expect(dialogOf(render()).props.open).toBe(false);
    askToDelete();
    const dialog = dialogOf(render());
    expect(dialog.props.open).toBe(true);
    expect(dialog.props.title).toBe("Delete Pip?");
    expect(dialog.props.children).toMatchObject({ props: { children: DELETE_BABY_LINE } });
    expect(DELETE_BABY_LINE).toBe("Everything logged for them goes too, for good.");
    expect(dialog.props.confirmLabel).toBe("Delete");
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(h.deletes).toEqual([]);
  });

  it("backs out (Cancel, overlay, Escape) through onClose, deleting nothing", () => {
    askToDelete();
    (dialogOf(render()).props.onClose as () => void)();
    expect(dialogOf(render()).props.open).toBe(false);
    expect(h.deletes).toEqual([]);
    expect(h.activeCleared).toEqual([]);
  });

  it("deletes only on Delete: clears the active baby if it was this one, closes, and never asks the browser", () => {
    askToDelete();
    (dialogOf(render()).props.onConfirm as () => void)();
    expect(h.deletes).toEqual(["baby-1"]);
    expect(h.activeCleared).toEqual([null]);
    expect(dialogOf(render()).props.open).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
