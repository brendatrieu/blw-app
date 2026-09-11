/**
 * The first-run tour's content, in order. Copy is fixed — six slides, one
 * idea each, no product-name preamble and no extra sentences — so it lives
 * here as data rather than inside the page's markup, and the renderToString
 * test can pin it word for word.
 */
export interface TourSlide {
  title: string;
  body: string;
  /** One large glyph on an `emoji-disc`; the tour carries no illustrations. */
  emoji: string;
}

export const TOUR_SLIDES: readonly TourSlide[] = [
  {
    title: "Welcome",
    body: "A quick look at what you can do here. Swipe to continue, or skip anytime.",
    emoji: "👋",
  },
  {
    title: "Log every meal",
    body: "Tap Log meal after your baby eats. Over time you get a full picture of what they've tried, and if a reaction shows up you can trace it back to the foods and allergens served that day.",
    emoji: "🍽️",
  },
  {
    title: "Keep track of what you've prepped",
    body: "Add batches to Storage with where they live: fridge, freezer, or counter. Each item shows how long it stays fresh, so you serve it in time and toss it when it's past.",
    emoji: "📦",
  },
  {
    title: "Introduce allergens step by step",
    body: "The allergen ladder lists the common allergens. Mark each one established once it's been tolerated, and tap it to see which foods carry it and when you served them.",
    emoji: "🪜",
  },
  {
    title: "Help when you need it",
    body: "Learn has short guides on choking, allergies, and tummy changes. Symptom check helps you decide when to call someone. Find both under More.",
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
