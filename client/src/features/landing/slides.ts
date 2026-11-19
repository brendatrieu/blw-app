import { TOUR_SLIDES } from "../tour/slides.js";

/**
 * The signed-out landing's slides (ledger 992, 1008), in order, as data so
 * the copy is pinned word for word (`slides.test.ts`) and a native app or App
 * Store listing can reuse it. The first is the plain intro (logo, name and
 * tagline on a gradient: no screenshot). Every other `shot` names a pair of
 * screenshots, `client/public/landing/{shot}-{light,dark}.webp`: 390x844 @2x
 * app screens with made-up data (baby "Mila"), taken on an isolated stack
 * with the app header hidden and scrolled to the slide's key content.
 * Retake them when Log meal, Meal Plan, Home's Storage, the ladder or Foods change.
 */
export type LandingShot = "log" | "plan" | "storage" | "allergens" | "foods";

export type LandingSlide = { title: string; body: string } & ({ shot: LandingShot; alt: string } | { shot: null });

export const LANDING_SLIDES: readonly LandingSlide[] = [
  // The tagline sits on the gradient; the sheet carries the tour's welcome line.
  { title: "Starting solids, made simpler.", body: TOUR_SLIDES[0]!.body, shot: null },
  {
    title: "Log what they ate.",
    body: "Put each food on the plate, rate it with stars if you like, and note any reaction.",
    shot: "log",
    alt: "Log meal with Avocado and Banana on the plate, each rated with stars.",
  },
  {
    title: "Plan ahead, if you like.",
    body: "Fill in the days ahead, then serve today's meals with one tap.",
    shot: "plan",
    alt: "Meal Plan for today: Breakfast, Lunch, Snack and Dinner planned, each with its foods and a Serve button.",
  },
  {
    title: "Keep track of what you've prepped.",
    body: "Each batch shows the servings left and when to use it by.",
    shot: "storage",
    alt: "Storage with two Fridge and two Freezer containers, each showing the servings left and how long to use it within.",
  },
  {
    title: "Introduce allergens step by step.",
    body: "Work through the top 9, with a nudge when one is due for a serve.",
    shot: "allergens",
    alt: "Allergen ladder: Peanut is established and due for a serve, with Milk and Wheat started below.",
  },
  {
    title: "Find iron-rich foods.",
    body: "Filter for High iron, and see how to prep each one by age.",
    shot: "foods",
    alt: "Foods filtered to High iron: Beef, Cashews, Chia Seeds, Lentils and more iron-rich foods.",
  },
];

/** Shown under the last slide and at the end of About: one sentence, one place. */
export const DISCLAIMER = "Little Meals is educational, not medical advice. Consult your pediatrician.";
