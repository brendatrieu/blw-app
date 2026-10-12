/* global self, caches */
// Ledger 790: imported by the generated sw.js. Before 790 the service worker
// took over on its own (autoUpdate), and a page from then has no way to send
// the SKIP_WAITING a prompt-mode worker waits for, so the first prompt-mode
// worker could sit waiting behind it. A worker installing where no
// prompt-mode worker has ever run (no marker cache) therefore takes over at
// once, exactly as before; every later one waits for Reload.
const PROMPT_MARKER = "little-meals-prompt-sw";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.has(PROMPT_MARKER).then((seen) => (seen ? undefined : self.skipWaiting())));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.open(PROMPT_MARKER));
});
