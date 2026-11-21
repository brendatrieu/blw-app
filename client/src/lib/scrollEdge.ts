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

/** Ledger 1083: a strip that docks under the header (the Foods / Recipes
 * search, sticky at the header's height) is still in flow until it reaches
 * that offset; only then does content scroll under it. */
export function isDocked(offset: number, top: number, dockedTop: number): boolean {
  return isScrolledUnder(offset) && top <= dockedTop + 0.5;
}

/** The window, or an element that scrolls itself (a Sheet panel). */
export type ScrollSource = ({ scrollY: number } | { scrollTop: number }) & Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Keeps `data-scrolled` on `target` matching `isScrolledUnder` for `source`'s
 * offset (`docks`: `isDocked`, from the target's own sticky top). Returns the
 * cleanup, which also clears the attribute.
 * `toggleAttribute` is a no-op when the state does not change, so a scroll
 * costs one compare (a docking strip also reads its own rect and top). */
export function watchScrollEdge(target: Element, source: ScrollSource = window, docks = false): () => void {
  const update = () => {
    const offset = "scrollY" in source ? source.scrollY : source.scrollTop;
    const under = docks
      ? isDocked(offset, target.getBoundingClientRect().top, Number.parseFloat(getComputedStyle(target).top))
      : isScrolledUnder(offset);
    target.toggleAttribute("data-scrolled", under);
  };
  update();
  source.addEventListener("scroll", update, { passive: true });
  return () => {
    source.removeEventListener("scroll", update);
    target.removeAttribute("data-scrolled");
  };
}
