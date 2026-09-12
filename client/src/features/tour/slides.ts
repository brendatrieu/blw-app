/**
 * The first-run tour's content, in order. Copy is fixed — six slides, one
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
    body: "Tap Log meal after your baby eats. Over time you get a full picture of what they've tried, and if a reaction shows up you can trace it back to the foods and allergens served that day.",
    emoji: "🍽️",
  },
  {
    title: "Keep track of what you've prepped",
    body: "Add batches to Storage. Each item shows how long it stays fresh, so you serve it in time and toss it when it's expired.",
    emoji: "📦",
  },
  {
    title: "Introduce allergens step by step",
    body: "Mark each allergen as established once it's been tolerated, and the ladder will nudge you when it's time to serve it again.",
    emoji: "🪜",
  },
  {
    title: "Help when you need it",
    body: "Learn has short guides on choking, allergies, and tummy changes. Symptom check helps you decide if you should seek care. Find both under More.",
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
