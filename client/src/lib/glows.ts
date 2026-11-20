/**
 * Ledger 1052 / 1078: the soft sea + apricot glow ground, one pair per screen
 * down the page, as one CSS `background-image` for an element the page's
 * height (no fixed anything: iOS). About wears the landing's glows; every
 * AppLayout page wears the app's own, softer ones. Each glow is drawn as the
 * landing draws it (`circle at x% y%`, gone at 55% (sea) / 50% (apricot) of
 * the farthest corner of ONE screen), so no screen's edge cuts a glow.
 */
export type GlowFamily = "landing" | "app";
/** Where the sea and apricot glows sit on one screen (`x% y%`). */
export type GlowPlace = { readonly sea: string; readonly apricot: string };

function glowLayer(family: GlowFamily, token: "sea" | "apricot", at: string, screen: number): string {
  const [x, y] = at.split(" ").map((part) => Number.parseFloat(part)) as [number, number];
  const radius = `calc(${token === "sea" ? 0.55 : 0.5} * hypot(${Math.max(x, 100 - x)}vw, ${Math.max(y, 100 - y)}svh))`;
  return `radial-gradient(circle ${radius} at ${x}% ${screen * 100 + y}svh, var(--color-${family}-glow-${token}), transparent)`;
}

/** `count` screens of glow, cycling through `places` (one per screen). A page
 * taller than `count` screens ends on the bare page colour. */
export function glowScreens(family: GlowFamily, places: readonly GlowPlace[], count: number): string {
  return Array.from({ length: count }, (_, screen) => {
    const glow = places[screen % places.length]!;
    return `${glowLayer(family, "sea", glow.sea, screen)}, ${glowLayer(family, "apricot", glow.apricot, screen)}`;
  }).join(", ");
}
