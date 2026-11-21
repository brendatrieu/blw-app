/**
 * Ledger 1052 / 1078: the soft sea + apricot glow ground, one pair per screen
 * down the page, painted on an element the page's height (no fixed anything:
 * iOS). About wears the landing's glows; every AppLayout page wears the app's
 * own, softer ones. Each glow is drawn as the landing draws it (`circle at
 * x% y%`, gone at 55% (sea) / 50% (apricot) of the farthest corner of ONE
 * screen), so no screen's edge cuts a glow.
 */
export type GlowFamily = "landing" | "app";
/** Where the sea and apricot glows sit on one screen (`x% y%`). */
export type GlowPlace = { readonly sea: string; readonly apricot: string };

function glow(family: GlowFamily, token: "sea" | "apricot", at: string) {
  const [x, y] = at.split(" ").map((part) => Number.parseFloat(part)) as [number, number];
  const radius = `calc(${token === "sea" ? 0.55 : 0.5} * hypot(${Math.max(x, 100 - x)}vw, ${Math.max(y, 100 - y)}svh))`;
  return { x, y, radius, fill: `var(--color-${family}-glow-${token}), transparent` };
}

/** `count` screens of glow, cycling through `places` (one per screen), as one
 * `background-image` of full-page layers. A page taller than `count` screens
 * ends on the bare page colour. (About: a fixed-length page.) */
export function glowScreens(family: GlowFamily, places: readonly GlowPlace[], count: number): string {
  const layer = (token: "sea" | "apricot", at: string, screen: number) => {
    const { x, y, radius, fill } = glow(family, token, at);
    return `radial-gradient(circle ${radius} at ${x}% ${screen * 100 + y}svh, ${fill})`;
  };
  return Array.from({ length: count }, (_, screen) => {
    const place = places[screen % places.length]!;
    return `${layer("sea", place.sea, screen)}, ${layer("apricot", place.apricot, screen)}`;
  }).join(", ");
}

/**
 * Ledger 1078 (verify c1): the same glows for a page of any length (the app's
 * lists grow without end). Each glow is its own no-repeat tile, the page's
 * width and its circle's height, so a pixel paints only the two or three
 * glows over it, however many screens there are (full-page layers make every
 * pixel paint every glow). Pixels as `glowScreens`.
 */
export function glowTiles(family: GlowFamily, places: readonly GlowPlace[], count: number) {
  const tiles = Array.from({ length: count }, (_, screen) => {
    const place = places[screen % places.length]!;
    return (["sea", "apricot"] as const).map((token) => {
      const { x, y, radius, fill } = glow(family, token, place[token]);
      return {
        image: `radial-gradient(circle ${radius} at ${x}% 50%, ${fill})`,
        size: `100% calc(2 * ${radius})`,
        position: `0 calc(${screen * 100 + y}svh - ${radius})`,
      };
    });
  }).flat();
  return {
    backgroundImage: tiles.map((tile) => tile.image).join(", "),
    backgroundSize: tiles.map((tile) => tile.size).join(", "),
    backgroundPosition: tiles.map((tile) => tile.position).join(", "),
    backgroundRepeat: "no-repeat",
  };
}

/** How many screens of glow a page `pageHeight` px tall needs, a screen being
 * `screen` px (100svh): every screen it reaches, plus the next one, whose sea
 * glow reaches up into the last. */
export function glowScreensFor(pageHeight: number, screen: number): number {
  if (!(pageHeight > 0) || !(screen > 0)) return 2;
  return Math.ceil(pageHeight / screen) + 1;
}

/** Keeps `onCount` in step with how many screens of glow `ground` needs, a
 * screen being `probe`'s height (a 100svh box: the glows' own unit, which on
 * iOS is neither innerHeight nor the window's). One ResizeObserver on both;
 * a no-op without one. Returns the cleanup. */
export function watchGlowScreens(ground: Element, probe: Element, onCount: (screens: number) => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() =>
    onCount(glowScreensFor(ground.getBoundingClientRect().height, probe.getBoundingClientRect().height)),
  );
  observer.observe(ground);
  observer.observe(probe);
  return () => observer.disconnect();
}
