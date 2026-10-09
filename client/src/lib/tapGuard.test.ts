// Ledger 767: the brief tap guard after Serve closes its sheet. No DOM: the
// window is a stub that hands back the listener, which is then fed clicks.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ignoreTapsBriefly, TAP_GUARD_MS } from "./tapGuard.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function arm() {
  const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("window", win);
  ignoreTapsBriefly();
  const [type, listener, capture] = win.addEventListener.mock.calls[0]!;
  return { win, type, capture, listener: listener as (event: unknown) => void };
}

function click(detail: number, target: unknown = { closest: () => null }) {
  return { detail, target, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe("ignoreTapsBriefly (ledger 767)", () => {
  it("eats a tap's click in the capture phase, so neither React nor a link acts on it", () => {
    const { type, capture, listener } = arm();
    expect(type).toBe("click");
    expect(capture).toBe(true);
    for (const target of [{ closest: () => null }, null]) {
      const event = click(1, target);
      listener(event);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
  });

  it("lets a keyboard click through (Enter or Space make a click with detail 0)", () => {
    const { listener } = arm();
    const event = click(0);
    listener(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("lets a tap on the Undo banner through", () => {
    const { listener } = arm();
    const closest = vi.fn((selector: string) => (selector === "[data-tap-guard-skip]" ? {} : null));
    const event = click(1, { closest });
    listener(event);
    expect(closest).toHaveBeenCalledWith("[data-tap-guard-skip]");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("lasts a brief moment (300-400 ms), then removes exactly the listener it added", () => {
    expect(TAP_GUARD_MS).toBeGreaterThanOrEqual(300);
    expect(TAP_GUARD_MS).toBeLessThanOrEqual(400);
    vi.useFakeTimers();
    const { win, listener } = arm();
    vi.advanceTimersByTime(TAP_GUARD_MS - 1);
    expect(win.removeEventListener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(win.removeEventListener).toHaveBeenCalledWith("click", listener, true);
  });
});
