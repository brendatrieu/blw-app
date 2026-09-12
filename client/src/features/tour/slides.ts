/**
 * The first-run tour's content, in order. Copy is fixed — six slides, one
 * idea each, no subtitle and no extra sentences — so it lives here as data
 * rather than inside the dialog's markup, and `slides.test.ts` can pin it
 * word for word.
 *
 * Slide 5's body carries a real `\n`: two sentences about two different
 * places to get help, and they read as two lines. The dialog renders bodies
 * with `whitespace-pre-line` so the break survives into the DOM — it is
 * content, not formatting, which is why it lives in the string here rather
 * than as a `<br>` in the component.
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
    body: "Learn has short guides on choking, allergies, and tummy changes.\nSymptom check helps you decide if you should seek care. Find both under More.",
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
