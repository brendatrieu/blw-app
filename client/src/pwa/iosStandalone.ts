/**
 * Ledger 892: marks the installed iOS/iPadOS Home Screen app with
 * <html data-ios-standalone>, so styles/index.css can push the page's top
 * content below iOS's own soft top blur (--top-edge-clearance). The page can't
 * switch that blur off. `navigator.standalone` exists only in iOS/iPadOS
 * Safari and is true only in a Home Screen app, so Safari tabs, desktop and
 * Android are untouched. Web-only: a native build drops this call and owns its
 * own top inset.
 */
export function markIosStandalone(nav: Navigator = navigator, root: HTMLElement = document.documentElement): void {
  if ((nav as Navigator & { standalone?: boolean }).standalone === true) root.dataset.iosStandalone = "";
}
