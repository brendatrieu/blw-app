import { createContext, useContext } from "react";

/**
 * The app header's left-hand slot on inner pages (item 654). `AppLayout`
 * provides the element; `BackButton`/`CloseButton` portal into it so a page's
 * way out sits in the one slim header row instead of a second row above the
 * title. Null outside `AppLayout` (signed-out pages), on Home, and during
 * server rendering — the buttons then render inline where the page put them.
 * Its own module so the buttons don't import `AppLayout` and tests can mock it.
 */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

export function useHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlotContext);
}
