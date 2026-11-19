/**
 * The signed-out landing's slides (ledger 992), in order, as data so the
 * copy is pinned word for word (`slides.test.ts`) and a native app or App
 * Store listing can reuse it. Each `shot` names a pair of screenshots,
 * `client/public/landing/{shot}-{light,dark}.webp`: whole 390x844 @2x app
 * screens with made-up data (baby "Mila"), taken on an isolated stack.
 * Retake them when Log meal, Meal Plan, Storage, the ladder or Foods change.
 */
export interface LandingSlide {
  title: string;
  body: string;
  shot: "log" | "plan" | "storage" | "allergens" | "foods";
  alt: string;
}

export const LANDING_SLIDES: readonly LandingSlide[] = [
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
    alt: "Meal Plan for today: Breakfast served, with stars on each food, and Lunch with a Serve button.",
  },
  {
    title: "Keep track of what you've prepped.",
    body: "Each batch shows the servings left and when to use it by.",
    shot: "storage",
    alt: "Storage with Fridge and Freezer containers, each showing servings left and days left.",
  },
  {
    title: "Introduce allergens step by step.",
    body: "Work through the top 9, with a nudge when one is due for a serve.",
    shot: "allergens",
    alt: "Allergen ladder: Peanut due for a serve, Egg established, Milk and Wheat started.",
  },
  {
    title: "Find iron-rich foods.",
    body: "Filter for High iron, and see how to prep each one by age.",
    shot: "foods",
    alt: "Foods filtered to High iron: a grid of iron-rich foods.",
  },
];

/** Shown under the last slide and at the end of About: one sentence, one place. */
export const DISCLAIMER = "Little Meals is educational, not medical advice. Consult your pediatrician.";
