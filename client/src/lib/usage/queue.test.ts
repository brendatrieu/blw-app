import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USAGE_BATCH_MAX, usageContextSchema, type UsageEventEnvelope } from "@blw/shared";

/** A fake IndexedDB, so the storage adapter itself can be pinned too. */
const idb = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

vi.mock("idb-keyval", () => ({ get: idb.get, set: idb.set, del: idb.del }));

import { buildEvent } from "./buildEvent.js";
import {
  USAGE_ENDPOINT,
  USAGE_FLUSH_AT_COUNT,
  USAGE_QUEUE_KEY,
  USAGE_QUEUE_MAX,
  appendCapped,
  classifySendResponse,
  createUsageQueue,
  idbQueueStorage,
  postUsageBatch,
  type QueueStorage,
  type SendOutcome,
} from "./queue.js";

const CONTEXT = usageContextSchema.parse({
  app_version: "test",
  standalone: false,
  theme: "system",
  platform: "other",
  online: true,
  baby_age_bucket: "none",
  baby_count: "0",
  has_ai_key: false,
});

let serial = 0;
function event(): UsageEventEnvelope {
  serial += 1;
  return buildEvent("session_started", {}, { context: CONTEXT, pathname: null, id: uuid(serial) })!;
}
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
function events(count: number): UsageEventEnvelope[] {
  return Array.from({ length: count }, () => event());
}

/** In-memory stand-in for the persisted queue. */
function fakeStorage(initial: UsageEventEnvelope[] = []) {
  let rows: UsageEventEnvelope[] = [...initial];
  const writes: number[] = [];
  const storage: QueueStorage = {
    read: async () => [...rows],
    write: async (next) => {
      rows = [...next];
      writes.push(rows.length);
    },
    clear: async () => {
      rows = [];
      writes.push(0);
    },
  };
  return { storage, writes, rows: () => rows };
}

/** A fake transport whose answer each call is programmable. */
function fakeSend(outcomes: SendOutcome[] = []) {
  const batches: UsageEventEnvelope[][] = [];
  const send = async (batch: readonly UsageEventEnvelope[]): Promise<SendOutcome> => {
    batches.push([...batch]);
    return outcomes.shift() ?? "sent";
  };
  return { send, batches };
}

beforeEach(() => {
  idb.store.clear();
  idb.get.mockClear();
  idb.set.mockClear();
  idb.del.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifySendResponse", () => {
  it("removes a batch only on 2xx", () => {
    for (const status of [200, 201, 204, 299]) expect(classifySendResponse(status)).toBe("sent");
  });

  it("keeps it for anything waiting will fix: 5xx, a rate limit, a timeout", () => {
    for (const status of [500, 502, 503, 504, 429, 408, 0]) expect(classifySendResponse(status)).toBe("retry");
  });

  it("DROPS a batch the server will reject every time, rather than wedging the queue", () => {
    // A 400 kept forever would sit at the head, be re-POSTed every 15s and
    // push every real event out through the cap. Events are disposable; a
    // livelock is not.
    for (const status of [400, 401, 403, 404, 413, 422]) expect(classifySendResponse(status)).toBe("drop");
  });
});

describe("appendCapped", () => {
  it("drops from the OLDEST end, so what a parent just did always survives", () => {
    const existing = events(USAGE_QUEUE_MAX);
    const fresh = events(3);
    const next = appendCapped(existing, fresh, USAGE_QUEUE_MAX);
    expect(next).toHaveLength(USAGE_QUEUE_MAX);
    expect(next.slice(-3)).toEqual(fresh);
    expect(next[0]).toBe(existing[3]);
  });

  it("leaves an under-cap queue alone", () => {
    const a = events(2);
    expect(appendCapped(a, [], USAGE_QUEUE_MAX)).toEqual(a);
  });
});

describe("the queue", () => {
  it("caps at 500 in the queue itself, dropping oldest", async () => {
    const storage = fakeStorage();
    const queue = createUsageQueue({ storage: storage.storage, send: async () => "retry" });
    queue.enqueue(events(USAGE_QUEUE_MAX + 10));
    expect(queue.size()).toBe(USAGE_QUEUE_MAX);
  });

  it("persists on every enqueue, so a tab closed before a flush loses nothing", async () => {
    const storage = fakeStorage();
    const queue = createUsageQueue({ storage: storage.storage, send: async () => "retry" });
    queue.enqueue([event()]);
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.rows()).toHaveLength(1);
  });

  it("sends in batches of at most the shared maximum", async () => {
    const storage = fakeStorage();
    const send = fakeSend();
    const queue = createUsageQueue({ storage: storage.storage, send: send.send });
    queue.enqueue(events(USAGE_BATCH_MAX + 7));
    await queue.flush();
    expect(send.batches.map((b) => b.length)).toEqual([USAGE_BATCH_MAX, 7]);
    expect(queue.size()).toBe(0);
    expect(storage.rows()).toHaveLength(0);
  });

  it("removes a batch on 2xx and KEEPS it on a retryable failure", async () => {
    const storage = fakeStorage();
    const send = fakeSend(["retry"]);
    const queue = createUsageQueue({ storage: storage.storage, send: send.send });
    const three = events(3);
    queue.enqueue(three);

    await queue.flush();
    expect(queue.size()).toBe(3);
    expect(storage.rows()).toHaveLength(3);

    // Next flush re-sends exactly the same events, in the same order.
    await queue.flush();
    expect(send.batches).toHaveLength(2);
    expect(send.batches[1]!.map((e) => e.id)).toEqual(three.map((e) => e.id));
    expect(queue.size()).toBe(0);
  });

  it("stops flushing at the first retryable failure rather than burning the whole queue", async () => {
    const storage = fakeStorage();
    const send = fakeSend(["sent", "retry"]);
    const queue = createUsageQueue({ storage: storage.storage, send: send.send, batchMax: 2 });
    queue.enqueue(events(6));
    await queue.flush();
    expect(send.batches).toHaveLength(2);
    expect(queue.size()).toBe(4);
  });

  it("drops a batch the server refuses, and carries on with the rest", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = fakeStorage();
    const send = fakeSend(["drop", "sent"]);
    const queue = createUsageQueue({ storage: storage.storage, send: send.send, batchMax: 2 });
    queue.enqueue(events(4));
    await queue.flush();
    expect(queue.size()).toBe(0);
    expect(errors).toHaveBeenCalledOnce();
  });

  it("flushes by itself once 20 events are waiting", async () => {
    const storage = fakeStorage();
    const send = fakeSend();
    const queue = createUsageQueue({ storage: storage.storage, send: send.send });
    queue.enqueue(events(USAGE_FLUSH_AT_COUNT - 1));
    expect(send.batches).toHaveLength(0);
    queue.enqueue([event()]);
    await queue.flush();
    expect(send.batches.length).toBeGreaterThanOrEqual(1);
    expect(queue.size()).toBe(0);
  });

  it("sends what a previous session left on disk FIRST, so the order stays chronological", async () => {
    const stored = events(2);
    const storage = fakeStorage(stored);
    const send = fakeSend();
    const queue = createUsageQueue({ storage: storage.storage, send: send.send });
    const fresh = events(1);
    queue.enqueue(fresh);
    await queue.flush();
    expect(send.batches[0]!.map((e) => e.id)).toEqual([...stored, ...fresh].map((e) => e.id));
  });

  it("never sends the same batch twice for two overlapping flushes", async () => {
    const storage = fakeStorage();
    const send = fakeSend();
    const queue = createUsageQueue({ storage: storage.storage, send: send.send });
    queue.enqueue(events(3));
    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);
    expect(send.batches).toHaveLength(1);
  });

  it("discard forgets everything, in memory and on disk, and beats an in-flight send", async () => {
    const stored = events(2);
    const storage = fakeStorage(stored);
    let resolveSend: (outcome: SendOutcome) => void = () => {};
    const queue = createUsageQueue({
      storage: storage.storage,
      send: () => new Promise<SendOutcome>((resolve) => (resolveSend = resolve)),
    });
    queue.enqueue(events(1));

    const flushing = queue.flush();
    await Promise.resolve();
    // The account is deleted while the request is out.
    await queue.discard();
    expect(queue.size()).toBe(0);
    expect(storage.rows()).toHaveLength(0);

    // The response lands afterwards: it must not splice a queue that is gone,
    // nor resurrect anything.
    resolveSend("sent");
    await flushing;
    expect(queue.size()).toBe(0);
    expect(storage.rows()).toHaveLength(0);
  });

  it("discard is synchronous enough that a flush started in the same tick finds nothing", async () => {
    const storage = fakeStorage();
    const send = fakeSend();
    const queue = createUsageQueue({ storage: storage.storage, send: send.send });
    queue.enqueue(events(3));
    void queue.discard();
    await queue.flush();
    expect(send.batches).toHaveLength(0);
  });

  it("survives a storage that throws on every call", async () => {
    const broken: QueueStorage = {
      read: async () => {
        throw new Error("no indexeddb");
      },
      write: async () => {
        throw new Error("quota");
      },
      clear: async () => {
        throw new Error("nope");
      },
    };
    const send = fakeSend();
    const queue = createUsageQueue({ storage: broken, send: send.send });
    queue.enqueue(events(2));
    await expect(queue.flush()).resolves.toBeUndefined();
    await expect(queue.discard()).resolves.toBeUndefined();
    expect(send.batches[0]).toHaveLength(2);
  });
});

describe("idbQueueStorage", () => {
  it("uses its own namespaced key, never the react-query cache's", async () => {
    const storage = idbQueueStorage();
    await storage.write(events(1));
    expect(idb.set).toHaveBeenCalledWith(USAGE_QUEUE_KEY, expect.any(Array));
    expect(USAGE_QUEUE_KEY).not.toBe("blw.reactQueryCache");
  });

  it("re-validates what it reads back, dropping anything an older bundle wrote", async () => {
    const good = event();
    idb.store.set(USAGE_QUEUE_KEY, [good, { name: "from_an_older_bundle" }, null, "nonsense"]);
    // A stale event would otherwise be a batch the server rejects forever.
    await expect(idbQueueStorage().read()).resolves.toEqual([good]);
  });

  it("reads an empty queue out of a store that has nothing in it", async () => {
    await expect(idbQueueStorage().read()).resolves.toEqual([]);
  });
});

describe("postUsageBatch", () => {
  it("POSTs to /api/usage with keepalive, so the last batch survives the tab closing", async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return { status: 204 } as Response;
    });
    const batch = events(2);
    await expect(postUsageBatch(batch)).resolves.toBe("sent");

    const [url, init] = calls[0]!;
    expect(url).toBe(USAGE_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ events: batch });
    vi.unstubAllGlobals();
  });

  it("treats a thrown fetch (offline, blocked, DNS) as 'try again later'", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(postUsageBatch(events(1))).resolves.toBe("retry");
    vi.unstubAllGlobals();
  });
});
