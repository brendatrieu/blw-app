/**
 * Ledger 1079 / 1081: a pinned header (the app header, a Sheet's title row) is
 * clear while nothing is under it and frosted once content scrolls under it.
 * The rule is plain TS (a native shell reads its own scroll offset and asks
 * the same question); the DOM binding is one passive listener that keeps
 * `data-scrolled` on the header in step (index.css .app-frost-edge).
 */

/** Whether any content sits under the header. iOS rubber-banding past the
 * top reports a negative offset: still the top. */
export function isScrolledUnder(offset: number): boolean {
  return offset > 0;
}

/** The window, or an element that scrolls itself (a Sheet panel). */
export type ScrollSource = ({ scrollY: number } | { scrollTop: number }) & Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Keeps `data-scrolled` on `target` matching `isScrolledUnder` for `source`'s
 * offset. Returns the cleanup, which also clears the attribute.
 * `toggleAttribute` is a no-op when the state does not change, so a scroll
 * costs one compare. */
export function watchScrollEdge(target: Element, source: ScrollSource = window): () => void {
  const update = () => {
    target.toggleAttribute("data-scrolled", isScrolledUnder("scrollY" in source ? source.scrollY : source.scrollTop));
  };
  update();
  source.addEventListener("scroll", update, { passive: true });
  return () => {
    source.removeEventListener("scroll", update);
    target.removeAttribute("data-scrolled");
  };
}
