/**
 * Ledger 1096: keep the screen on while cook mode is open. Web-only and
 * swappable, like updateMode.ts: a native build replaces this one function
 * (e.g. a keep-awake plugin) and nothing else changes. Never needed for
 * correctness: where the Screen Wake Lock API is missing, or a request is
 * refused (low battery, not allowed), it silently does nothing.
 *
 * The browser drops the lock whenever the page is hidden, so it is asked for
 * again each time the page is visible. Returns the release, for leaving.
 */
export function keepScreenAwake(): () => void {
  if (typeof document === "undefined" || typeof navigator === "undefined" || !navigator.wakeLock) return () => {};
  const wakeLock = navigator.wakeLock;
  let lock: WakeLockSentinel | null = null;
  let pending = false;
  let stopped = false;

  const acquire = () => {
    // One request at a time: a second would leave a lock nobody releases.
    if (stopped || pending || document.visibilityState !== "visible" || (lock && !lock.released)) return;
    pending = true;
    // Through a promise, so even a request that throws stays silent.
    Promise.resolve().then(() => wakeLock.request("screen")).then(
      (sentinel) => {
        pending = false;
        // Left while the request was pending: let it go at once.
        if (stopped) void sentinel.release().catch(() => {});
        else lock = sentinel;
      },
      () => {
        pending = false;
      },
    );
  };

  document.addEventListener("visibilitychange", acquire);
  acquire();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", acquire);
    void lock?.release().catch(() => {});
    lock = null;
  };
}
