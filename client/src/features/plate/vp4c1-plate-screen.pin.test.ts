// Verifier p4-c1 pins (drop into client/src/features/plate/): PlateScreen's two refs.
// - A planned meal's Serve waits for Storage ONCE, then never unmounts the plate on
//   a later Storage refetch (Add to storage on the spot refetches the lists; an
//   unmount would drop the new batch and put the empty container back, flagged).
// - Plan a meal keeps the meal it opened when the day's slot ids change under it
//   (another device materialized a virtual day), instead of "That meal is gone".
// PlateScreen is called as a plain function with React's useState/useRef as a
// store (the CLAUDE.md hooks-mock idiom), so one "mount" spans two renders.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannedMeal, PlanResponse, StorageItem } from "@blw/shared";

const h = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  r: 0,
  states: [] as unknown[],
  s: 0,
  search: "",
  params: {} as Record<string, string>,
  active: { data: undefined as unknown, isPending: false, isFetching: false },
  history: { data: undefined as unknown, isPending: false, isFetching: false },
  plan: { data: undefined as PlanResponse | undefined, isError: false },
  navigated: [] as unknown[][],
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useState: (init: unknown) => {
    const i = h.s++;
    if (!(i in h.states)) h.states[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [h.states[i], (value: unknown) => (h.states[i] = value)];
  },
  useRef: (init: unknown) => {
    const i = h.r++;
    if (!h.refs[i]) h.refs[i] = { current: init };
    return h.refs[i];
  },
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSearchParams: () => [new URLSearchParams(h.search)],
  useParams: () => h.params,
  useNavigate: () => (...args: unknown[]) => h.navigated.push(args),
}));
vi.mock("../../components/ui/BackButton.js", () => ({ BackButton: () => null, useBackNavigate: () => () => undefined }));
vi.mock("../babies/useActiveBaby.js", () => ({ useActiveBaby: () => ({ activeBaby: { id: "baby-1" }, isLoading: false }) }));
vi.mock("../../lib/online.js", () => ({ useIsOffline: () => false }));
vi.mock("../tracking/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMeal: () => ({ data: undefined, isError: false, refetch: async () => ({}) }),
}));
vi.mock("../catalog/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFoods: () => ({ data: { foods: [] }, isLoading: false }),
  useRecipe: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../storage/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useStorageItems: (view: string) => (view === "active" ? h.active : h.history),
}));
vi.mock("../plan/hooks.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlan: () => h.plan,
}));

import { Skeleton } from "../../components/ui/Skeleton.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { PlateForm, PlateScreen } from "./PlateScreen.js";

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
const render = (): El => {
  h.r = 0;
  h.s = 0;
  return (PlateScreen as unknown as () => El)();
};
const has = (tree: El, type: unknown) => findAll(tree, (el) => el.type === type).length > 0;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TUB = {
  id: id(20),
  label: null,
  foods: [],
  recipeId: id(11),
  recipeTitle: "Broccoli Cheese Egg Muffins",
  preparedAt: "2026-10-14T10:00:00.000Z",
  location: "fridge",
  status: "finished",
  statusChangedAt: "2026-10-14T10:00:00.000Z",
  expiresAt: "2026-11-14T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: 6,
  servingsLeft: 0,
  bestBy: null,
  notes: null,
} as StorageItem;
const LUNCH: PlannedMeal = {
  slotId: id(51),
  name: "Lunch",
  time: "12:00",
  position: 1,
  served: null,
  items: [{ kind: "storage", id: id(60), servings: 1, container: TUB }],
};
const week = (meals: PlannedMeal[]): PlanResponse => ({ today: "2026-10-14", dailyMeals: [], days: [{ date: "2026-10-14", planned: true, meals }] });

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-14T15:00:00Z"), toFake: ["Date"] });
  h.refs = [];
  h.states = [];
  h.active = { data: { items: [] }, isPending: false, isFetching: false };
  h.history = { data: { items: [TUB] }, isPending: false, isFetching: false };
  h.plan = { data: week([LUNCH]), isError: false };
  h.navigated = [];
});
afterEach(() => vi.useRealTimers());

describe("verifier p4-c1 pins: PlateScreen keeps the plate it opened", () => {
  it("a planned meal's Serve waits for Storage once; a later Storage refetch (Add to storage on the spot) never unmounts the plate", () => {
    h.search = "serve=1";
    h.params = { date: "2026-10-14", slotId: LUNCH.slotId };
    h.active = { ...h.active, isFetching: true };
    const first = render();
    expect(has(first, Skeleton)).toBe(true);
    expect(has(first, PlateForm)).toBe(false);
    h.active = { ...h.active, isFetching: false };
    expect(has(render(), PlateForm)).toBe(true);
    // The new batch was saved: Storage's lists refetch while the plate is open.
    h.active = { ...h.active, isFetching: true };
    h.history = { ...h.history, isFetching: true };
    const during = render();
    expect(has(during, PlateForm)).toBe(true);
    expect(has(during, Skeleton)).toBe(false);
  });

  it("Plan a meal keeps its meal when another write gives the day new slot ids (no 'That meal is gone')", () => {
    h.search = "";
    h.params = { date: "2026-10-14", slotId: LUNCH.slotId };
    expect(has(render(), PlateForm)).toBe(true);
    // Another device materialized the day: the meal now answers under its row id.
    h.plan = { data: week([{ ...LUNCH, slotId: id(77) }]), isError: false };
    const after = render();
    expect(has(after, PlateForm)).toBe(true);
    expect(has(after, EmptyState)).toBe(false);
  });
});

describe("a plan meal served meanwhile opens that meal's Edit (ledger 966: the meal page is retired)", () => {
  it("onPlanGone with the served meal replaces the page with /log-meal?edit=:id; without one, the meal is gone", () => {
    h.search = "";
    h.params = { date: "2026-10-14", slotId: LUNCH.slotId };
    const form = findAll(render(), (el) => el.type === PlateForm)[0]!;
    const gone = form.props.onPlanGone as (mealId: string | null) => void;
    gone(id(90));
    expect(h.navigated).toEqual([[`/log-meal?edit=${id(90)}`, { replace: true }]]);
    gone(null);
    expect(h.navigated).toHaveLength(1);
  });
});
