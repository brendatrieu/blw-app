/**
 * The first-run tour's content, in order. Copy is fixed — five slides, one
 * idea each, no subtitle and no extra sentences — so it lives here as data
 * rather than inside the dialog's markup, and `slides.test.ts` can pin it
 * word for word.
 */
export interface TourSlide {
  title: string;
  body: string;
  /** One large glyph on an `emoji-disc`; the tour carries no illustrations. */
  emoji: string;
}

export const TOUR_SLIDES: readonly TourSlide[] = [
  {
    title: "Welcome to Little Meals",
    body: "Here to help you start solids with confidence, one little meal at a time.",
    emoji: "👋",
  },
  {
    title: "Log meals",
    body: "Tap Log meal after each meal. If a reaction shows up, you can trace it back.",
    emoji: "🍽️",
  },
  {
    title: "Plan the week ahead",
    body: "Use the calendar at the top, then tap Serve on Home.",
    emoji: "🗓️",
  },
  {
    title: "Help when you need it",
    body: "Safety guides and Symptom Check are under More. Always stay with baby and keep them upright while they eat.",
    emoji: "🛟",
  },
  {
    title: "You're ready",
    body: "Add your baby's profile, then log the first meal.",
    emoji: "✨",
  },
];

/** Read straight off the data, so the dots and the aria labels cannot drift. */
export const TOUR_SLIDE_COUNT = TOUR_SLIDES.length;
