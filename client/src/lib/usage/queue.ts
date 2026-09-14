import { del, get, set } from "idb-keyval";
import { USAGE_BATCH_MAX, usageEventEnvelopeSchema, type UsageEventEnvelope } from "@blw/shared";

/**
 * The outbox: a persisted, capped, replay-safe queue in front of
 * `POST /api/usage`.
 *
 * Everything about it is arranged so that analytics can fail completely
 * without the app noticing. Nothing awaits a flush, nothing renders from it,
 * a blocked endpoint costs a bounded amount of IndexedDB and a dropped
 * batch costs nothing at all — the events have no other job.
 *
 * Persisted with `idb-keyval`, the same library and the same kind of key as
 * the react-query cache (see `lib/persister.ts`): a parent who logs a meal
 * and closes the tab has that event on disk before the network is involved.
 */

/** IndexedDB key holding the pending events. Namespaced like `blw.reactQueryCache`. */
export const USAGE_QUEUE_KEY = "blw.usageQueue";

/**
 * Hard ceiling on stored events, oldest dropped first.
 *
 * 500 is roughly a fortnight of ordinary use for one parent, and about 200 KB
 * on disk. The cap exists for the case where the endpoint is blocked (a
 * content blocker, a captive portal, a proxy) and NOTHING ever drains: the
 * queue has to stop growing, and it has to stop growing without ever
 * dropping the event a parent just caused.
 */
export const USAGE_QUEUE_MAX = 500;

/** Idle flush cadence. */
export const USAGE_FLUSH_INTERVAL_MS = 15_000;
/** Queue depth that flushes immediately rather than waiting for the timer. */
export const USAGE_FLUSH_AT_COUNT = 20;

/** Deliberately not `/api/event`, `/api/collect` or `/track` — all on EasyPrivacy. */
export const USAGE_ENDPOINT = "/api/usage";

/**
 * What to do with a batch after the server has answered.
 *
 * `retry` keeps it (the ledger's "removed only on 2xx" case: offline, a 5xx,
 * a rate limit — all fixed by waiting). `drop` is the one addition, and it is
 * deliberate: a 4xx means the server will reject this exact payload every
 * time, so keeping it would wedge the head of the queue forever, re-POST it
 * every 15 seconds, and push out every real event behind it. Events are
 * disposable; a livelock is not.
 */
export type SendOutcome = "sent" | "retry" | "drop";

export function classifySendResponse(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "sent";
  // A timeout or a rate limit is a "later", not a "never".
  if (status === 408 || status === 429) return "retry";
  if (status >= 400 && status < 500) return "drop";
  return "retry";
}

/** Appends under the cap, dropping from the OLDEST end. Pure. */
export function appendCapped(
  queue: readonly UsageEventEnvelope[],
  events: readonly UsageEventEnvelope[],
  max: number = USAGE_QUEUE_MAX,
): UsageEventEnvelope[] {
  const next = [...queue, ...events];
  return next.length <= max ? next : next.slice(next.length - max);
}

export interface QueueStorage {
  read(): Promise<UsageEventEnvelope[]>;
  write(events: readonly UsageEventEnvelope[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * IndexedDB storage. Reads are re-validated against the shared schema:
 * a queue written by an older bundle can hold an event whose shape has since
 * changed, and replaying it would be a batch the server rejects forever.
 */
export function idbQueueStorage(): QueueStorage {
  return {
    read: async () => {
      const raw = await get<unknown>(USAGE_QUEUE_KEY);
      if (!Array.isArray(raw)) return [];
      const valid: UsageEventEnvelope[] = [];
      for (const entry of raw) {
        const parsed = usageEventEnvelopeSchema.safeParse(entry);
        if (parsed.success) valid.push(parsed.data);
      }
      return valid;
    },
    write: async (events) => {
      await set(USAGE_QUEUE_KEY, [...events]);
    },
    clear: async () => {
      await del(USAGE_QUEUE_KEY);
    },
  };
}

/** `fetch` with `keepalive`, so the batch sent as the tab closes still goes. */
export async function postUsageBatch(events: readonly UsageEventEnvelope[]): Promise<SendOutcome> {
  try {
    const response = await fetch(USAGE_ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    return classifySendResponse(response.status);
  } catch {
    // Offline, DNS, a blocked request: all "later".
    return "retry";
  }
}

export interface UsageQueueDeps {
  storage?: QueueStorage;
  send?: (events: readonly UsageEventEnvelope[]) => Promise<SendOutcome>;
  batchMax?: number;
  queueMax?: number;
}

export interface UsageQueue {
  enqueue(events: readonly UsageEventEnvelope[]): void;
  flush(): Promise<void>;
  /** Forgets everything, in memory and on disk. Used by consent-off, sign-out and delete. */
  discard(): Promise<void>;
  size(): number;
  /** Wires the flush triggers. Idempotent. */
  start(): void;
  stop(): void;
}

export function createUsageQueue(deps: UsageQueueDeps = {}): UsageQueue {
  const storage = deps.storage ?? idbQueueStorage();
  const send = deps.send ?? postUsageBatch;
  const batchMax = deps.batchMax ?? USAGE_BATCH_MAX;
  const queueMax = deps.queueMax ?? USAGE_QUEUE_MAX;

  let buffer: UsageEventEnvelope[] = [];
  /** The one-shot restore from disk; awaited by every read AND every write. */
  let hydration: Promise<void> | null = null;
  let flushing: Promise<void> | null = null;
  /** Bumped by `discard`, so a flush that was mid-send cannot re-splice a queue that no longer exists. */
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let listening = false;

  /**
   * Restores a previous session's queue, exactly once.
   *
   * Awaited by `persist` as well as by `drain`, and that is load-bearing: an
   * event enqueued in the first tick after boot would otherwise write the
   * one-event buffer over everything the last session left on disk.
   */
  function hydrate(): Promise<void> {
    hydration ??= (async () => {
      try {
        const stored = await storage.read();
        if (stored.length === 0) return;
        // Stored events are OLDER than anything queued this session, so they
        // go in front — the flush order stays chronological. Ids already in
        // the buffer are skipped: a persist may have written them out and
        // this read may have brought the same rows back.
        const seen = new Set(buffer.map((entry) => entry.id));
        buffer = appendCapped(
          stored.filter((entry) => !seen.has(entry.id)),
          buffer,
          queueMax,
        );
      } catch {
        // Nothing to restore; carry on with this session's events.
      }
    })();
    return hydration;
  }

  async function persist(): Promise<void> {
    await hydrate();
    try {
      if (buffer.length === 0) await storage.clear();
      else await storage.write(buffer);
    } catch {
      // A full or unavailable IndexedDB costs us the persisted copy, never
      // the session's own events and never an error a parent can see.
    }
  }

  async function drain(): Promise<void> {
    await hydrate();
    while (buffer.length > 0) {
      const mine = generation;
      const batch = buffer.slice(0, batchMax);
      const outcome = await send(batch);
      // A discard while the request was in flight wins outright.
      if (mine !== generation) return;
      if (outcome === "retry") return;
      if (outcome === "drop") {
        console.error(`usage: server rejected a batch of ${batch.length} events; dropping it`);
      }
      // Splice from the HEAD: anything enqueued during the await is at the
      // tail and is untouched by this.
      buffer.splice(0, batch.length);
      await persist();
    }
  }

  function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = drain()
      .catch(() => {
        // `send` already swallows its own failures; this is the last net.
      })
      .finally(() => {
        flushing = null;
      });
    return flushing;
  }

  return {
    enqueue(events) {
      if (events.length === 0) return;
      buffer = appendCapped(buffer, events, queueMax);
      void persist();
      if (buffer.length >= USAGE_FLUSH_AT_COUNT) void flush();
    },
    flush,
    async discard() {
      generation += 1;
      // Synchronous, so a flush started in the same tick as an account
      // deletion finds nothing left to send — and the restore is settled to
      // "nothing", so a pending hydrate cannot bring the rows back.
      buffer = [];
      hydration = Promise.resolve();
      try {
        await storage.clear();
      } catch {
        // Same reasoning as `persist`.
      }
    },
    size() {
      return buffer.length;
    },
    start() {
      if (timer === null) {
        timer = setInterval(() => void flush(), USAGE_FLUSH_INTERVAL_MS);
        // Never hold a Node process (or a test runner) open on our account.
        (timer as { unref?: () => void }).unref?.();
      }
      if (listening || typeof window === "undefined") return;
      listening = true;
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("online", onOnline);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      if (!listening || typeof window === "undefined") return;
      listening = false;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };

  function onPageHide(): void {
    void flush();
  }
  function onOnline(): void {
    void flush();
  }
  function onVisibilityChange(): void {
    // `hidden` is the last reliable moment on mobile Safari — `pagehide`
    // fires too, but a backgrounded tab may never get one.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") void flush();
  }
}
