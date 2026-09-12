import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePreferences } from "./hooks.js";
import { shouldOpenTour } from "./tour.js";
import { TourDialog } from "./TourDialog.js";

interface TourContextValue {
  /** Opens the tour over whatever is on screen. More's "Take the tour" row. */
  openTour: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  // A missing provider would mean a silently dead "Take the tour" row, which
  // is worse than a loud failure at the first render that needs it.
  if (!value) throw new Error("useTour must be used inside a TourProvider");
  return value;
}

/**
 * Owns whether the tour is open, and opens it once on a first run.
 *
 * Nothing about the gate renders: while the preferences query is in flight
 * the app looks exactly as it always did, and the dialog appears only once
 * the answer is actually known (see `shouldOpenTour` for why "known" means
 * the network answered, not the cache). The tour is a modal over the app
 * now, so there is no redirect and no route to come back from — the parent
 * stays exactly where they were, both while it is open and after it closes.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { data: preferences, status, fetchStatus } = usePreferences();
  const [open, setOpen] = useState(false);
  // One automatic opening per session, however the visit ends — otherwise a
  // failed PATCH would re-open the tour on every route change.
  const openedRef = useRef(false);

  useEffect(() => {
    const shouldOpen = shouldOpenTour({
      status,
      fetchStatus,
      tourCompletedAt: preferences?.tourCompletedAt,
      alreadyOpened: openedRef.current,
    });
    if (!shouldOpen) return;
    openedRef.current = true;
    setOpen(true);
  }, [status, fetchStatus, preferences]);

  const openTour = useCallback(() => {
    // Latched here too: a parent who opens the tour by hand before the query
    // answers must not then have it opened at them a second time.
    openedRef.current = true;
    setOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo(() => ({ openTour }), [openTour]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {/* Mounted only while open, so the dialog's replay latch is decided
          fresh on every visit rather than once per session. */}
      {open ? <TourDialog onClose={closeTour} /> : null}
    </TourContext.Provider>
  );
}
