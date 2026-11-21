import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepScreenAwake } from "./wakeLock.js";

/** A fake Screen Wake Lock: every request is recorded and resolves to a sentinel. */
function fakeWakeLock(request?: () => Promise<unknown>) {
  const sentinels: Array<{ released: boolean; release: ReturnType<typeof vi.fn> }> = [];
  const wakeLock = {
    request: vi.fn(
      request ??
        (async () => {
          const sentinel = {
            released: false,
            release: vi.fn(async () => {
              sentinel.released = true;
            }),
          };
          sentinels.push(sentinel);
          return sentinel;
        }),
    ),
  };
  return { wakeLock, sentinels };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
let listeners: Set<() => void>;
let doc: { visibilityState: string; addEventListener: unknown; removeEventListener: unknown };

beforeEach(() => {
  listeners = new Set();
  doc = {
    visibilityState: "visible",
    addEventListener: (type: string, fn: () => void) => type === "visibilitychange" && listeners.add(fn),
    removeEventListener: (type: string, fn: () => void) => type === "visibilitychange" && listeners.delete(fn),
  };
  vi.stubGlobal("document", doc);
});

afterEach(() => vi.unstubAllGlobals());

const setVisible = (state: "visible" | "hidden") => {
  doc.visibilityState = state;
  listeners.forEach((fn) => fn());
};

describe("keepScreenAwake (ledger 1096)", () => {
  it("asks for a screen lock at once, and only once while it holds", async () => {
    const { wakeLock } = fakeWakeLock();
    vi.stubGlobal("navigator", { wakeLock });
    const release = keepScreenAwake();
    await flush();
    expect(wakeLock.request).toHaveBeenCalledWith("screen");
    setVisible("visible");
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    release();
  });

  it("never has two requests in flight (a visible event while the first is pending)", async () => {
    const { wakeLock, sentinels } = fakeWakeLock();
    vi.stubGlobal("navigator", { wakeLock });
    const release = keepScreenAwake();
    setVisible("visible");
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    release();
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1);
  });

  it("asks again when the page comes back, after the browser dropped it on hiding", async () => {
    const { wakeLock, sentinels } = fakeWakeLock();
    vi.stubGlobal("navigator", { wakeLock });
    const release = keepScreenAwake();
    await flush();
    // The browser releases the lock itself while hidden; nothing is asked then.
    sentinels[0]!.released = true;
    setVisible("hidden");
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    setVisible("visible");
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    release();
  });

  it("releases on leaving and stops listening", async () => {
    const { wakeLock, sentinels } = fakeWakeLock();
    vi.stubGlobal("navigator", { wakeLock });
    const release = keepScreenAwake();
    await flush();
    release();
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it("lets go of a lock that arrives after leaving", async () => {
    const { wakeLock, sentinels } = fakeWakeLock();
    vi.stubGlobal("navigator", { wakeLock });
    keepScreenAwake()();
    await flush();
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1);
  });

  it("does not ask while the page is hidden", async () => {
    const { wakeLock } = fakeWakeLock();
    vi.stubGlobal("navigator", { wakeLock });
    doc.visibilityState = "hidden";
    keepScreenAwake()();
    await flush();
    expect(wakeLock.request).not.toHaveBeenCalled();
  });

  it("is a silent no-op where the API is missing, refused, or throws", async () => {
    vi.stubGlobal("navigator", {});
    expect(() => keepScreenAwake()()).not.toThrow();
    expect(listeners.size).toBe(0);

    for (const request of [
      () => Promise.reject(new Error("NotAllowedError")),
      () => {
        throw new Error("boom");
      },
    ]) {
      const { wakeLock } = fakeWakeLock(request as () => Promise<unknown>);
      vi.stubGlobal("navigator", { wakeLock });
      const release = keepScreenAwake();
      await flush();
      expect(wakeLock.request).toHaveBeenCalled();
      expect(release).not.toThrow();
    }
  });

  it("does nothing without a document (server rendering, node)", () => {
    vi.stubGlobal("document", undefined);
    expect(() => keepScreenAwake()()).not.toThrow();
  });
});
