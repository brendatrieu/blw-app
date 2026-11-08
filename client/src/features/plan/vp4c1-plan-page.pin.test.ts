// Verifier p4-c1 pin (drop into client/src/features/plan/): a past day's Serve on the
// plan card hands the one-tap hook the PLAN's today, so the hook opens the plate
// (When = the planned time) instead of one-tapping a past day (400 not_today, which
// only refetches: the parent could never serve that day from the card).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanResponse } from "@blw/shared";

const h = vi.hoisted(() => ({
  search: new URLSearchParams(),
  i: 0,
  states: [] as unknown[],
  plan: { data: undefined as PlanResponse | undefined, isLoading: false, isError: false },
  serves: [] as unknown[][],
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // The page's effects (951's "Copied" reveal, A-N3's scroll padding) are not this pin's concern.
  useEffect: () => {},
  useState: (init: unknown) => {
    const i = h.i++;
    if (!(i in h.states)) h.states[i] = init;
    return [h.states[i], (value: unknown) => (h.states[i] = value)];
  },
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSearchParams: () => [h.search, () => undefined],
}));
vi.mock("../../components/ui/BackButton.js", () => ({ BackButton: () => null }));
vi.mock("../babies/useActiveBaby.js", () => ({ useActiveBaby: () => ({ activeBaby: { id: "baby-1" }, isLoading: false }) }));
vi.mock("./hooks.js", () => ({
  usePlan: () => h.plan,
  useOneTapServe: () => ({ pendingSlot: null, failedSlot: null, serve: (...args: unknown[]) => h.serves.push(args) }),
}));
vi.mock("./plan.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan.js")>()),
  deviceTimeZone: () => "UTC",
}));

import { PlanMealCard } from "./PlanMealCard.js";
import { PlanPage } from "./PlanPage.js";

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
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plan: PlanResponse = {
  today: "2026-10-14",
  dailyMeals: [],
  days: ["2026-10-12", "2026-10-13", "2026-10-14"].map((date) => ({
    date,
    planned: true,
    meals: [{ slotId: id(1), name: "Dinner", time: "17:30", position: 0, served: null, items: [{ kind: "food", id: id(9) }] }],
  })) as PlanResponse["days"],
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-14T15:00:00Z"), toFake: ["Date"] });
  h.states = [];
  h.serves.length = 0;
  h.plan = { data: plan, isLoading: false, isError: false };
});
afterEach(() => vi.useRealTimers());

describe("verifier p4-c1 pin: a past day's Serve on the plan card", () => {
  it("passes the day and the plan's today (not the day twice), so the hook opens the plate", () => {
    h.search = new URLSearchParams("date=2026-10-13");
    h.i = 0;
    const cards = findAll((PlanPage as unknown as () => El)(), (el) => el.type === PlanMealCard);
    expect(cards.map((card) => [card.props.date, card.props.today])).toEqual([["2026-10-13", "2026-10-14"]]);
    (cards[0]!.props.onServe as () => void)();
    expect(h.serves.map(([date, today]) => [date, today])).toEqual([["2026-10-13", "2026-10-14"]]);
  });
});
