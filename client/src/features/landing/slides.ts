import { TOUR_SLIDES } from "../tour/slides.js";

/**
 * The signed-out landing's slides (ledger 992, 1008), in order, as data so
 * the copy is pinned word for word (`slides.test.ts`) and a native app or App
 * Store listing can reuse it. The first is the plain intro (logo, name and
 * tagline on a gradient: no screenshot). Every other `shot` names a pair of
 * screenshots, `client/public/landing/{shot}-{light,dark}.webp`: 390x844 @2x
 * app screens with made-up data (baby "Mila"), taken on an isolated stack
 * with the app header hidden and scrolled to the slide's key content.
 * Retake them when Log meal, Meal Plan, Home's Storage, the ladder or Recipes change.
 */
export type LandingShot = "log" | "plan" | "storage" | "allergens" | "recipes";

export type LandingSlide = { title: string; body: string } & ({ shot: LandingShot; alt: string } | { shot: null });

export const LANDING_SLIDES: readonly LandingSlide[] = [
  // The tagline sits on the gradient; the sheet carries the tour's welcome line.
  { title: "Starting solids, made simpler.", body: TOUR_SLIDES[0]!.body, shot: null },
  {
    title: "Log what they ate.",
    body: "Rate each food and note any reaction.",
    shot: "log",
    alt: "Log meal with Avocado and Banana on the plate, each rated with stars.",
  },
  {
    title: "Plan ahead, if you like.",
    body: "Then serve today's meals in one tap.",
    shot: "plan",
    alt: "Meal Plan for today: Breakfast, Lunch, Snack and Dinner planned, each with its foods and a Serve button.",
  },
  {
    title: "Keep track of what you've prepped.",
    body: "See servings left and when to use each batch.",
    shot: "storage",
    alt: "Home with the Storage section highlighted: Pear and Spinach in the Fridge and Sweet Potato Lentil Patties in the Freezer, each with the days left.",
  },
  {
    title: "Introduce allergens step by step.",
    body: "The top 9, with a nudge when one is due.",
    shot: "allergens",
    alt: "Allergen ladder with the progress ring at the top, 2 of 9 established, then Peanut, established and due for a serve.",
  },
  {
    title: "Find food and recipe ideas.",
    body: "Recipes and first foods, with prep for your baby's age.",
    shot: "recipes",
    alt: "Recipes list with search and All, Favorites and Custom chips: Apple Cinnamon Tahini Oatmeal, Baked Butter Beans in Tomato Sauce and more, each marked 6m+ with its foods.",
  },
];

/** Shown under the last slide and at the end of About: one sentence, one place. */
export const DISCLAIMER = "Little Meals is educational, not medical advice. Consult your pediatrician.";
