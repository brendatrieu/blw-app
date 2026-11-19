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
    body: "Tap Log meal after your baby eats, and rate each food if you like. Over time you get a full picture of what they've tried, and if a reaction shows up you can trace it back to the foods and allergens served that day.",
    emoji: "🍽️",
  },
  {
    title: "Plan ahead, if you like",
    body: "Tap the calendar at the top to plan meals for the days ahead. When it's time, tap Serve under Up next on Home to log the meal.",
    emoji: "🗓️",
  },
  {
    title: "Help when you need it",
    body: "Learn has short guides on choking, allergies, and tummy changes. Symptom Check helps you decide if you should seek care. Find both under More, along with how-tos for using the app. Always stay with baby and keep them sitting upright while they eat.",
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
