import { TOUR_SLIDES } from "../tour/slides.js";

/**
 * One floating card on a landing slide (ledger 1040): an element screenshot
 * of the app's own card, `client/public/landing/chips/{name}.webp`, taken
 * light (shown light in both modes) at 3x on an isolated stack with made-up
 * data (baby "Mila"). `width`/`height` are the image's pixels (its shape);
 * `x`/`y` place it in the slide's collage in mockup px at a 390-wide screen,
 * where a 358px app card shows 304px wide (0.85). An `optional` card is left
 * out on a short screen (ledger 1040: "or two of them if three don't fit").
 * Retake when the card changes.
 */
export type LandingChip = { name: string; alt: string; width: number; height: number; x: number; y: number; optional?: true };

/** Where the sea and apricot glows sit behind the slide (`x% y%`), moving per slide. */
export type LandingGlow = { sea: string; apricot: string };

/**
 * The signed-out landing's slides (ledger 992, 1008, 1040), in order, as data
 * so the copy is pinned word for word (`slides.test.ts`) and a native app or
 * App Store listing can reuse it. The first is the intro (logo, name, the
 * tagline as its title and the tour's welcome line); it has no chips.
 */
export type LandingSlide = { title: string; body: string; glow: LandingGlow; chips: readonly LandingChip[] };

/** Every card is a 358px-wide app card, captured 1074px wide (3x). */
const card = (name: string, alt: string, height: number, x: number, y: number): LandingChip => ({ name, alt, width: 1074, height, x, y });

export const LANDING_SLIDES: readonly LandingSlide[] = [
  {
    title: "Starting solids, made simpler.",
    body: TOUR_SLIDES[0]!.body,
    glow: { sea: "50% 28%", apricot: "84% 84%" },
    chips: [],
  },
  {
    title: "Log what they ate.",
    body: "Rate each food and note any reaction.",
    glow: { sea: "22% 62%", apricot: "80% 46%" },
    chips: [
      card("log-avocado", "Avocado on the plate, rated 5 stars.", 254, 0, 64),
      card("log-banana", "Banana on the plate, rated 4 stars.", 254, 24, 164),
    ],
  },
  {
    title: "Plan the week ahead.",
    body: "Then serve today's meals in one tap.",
    glow: { sea: "76% 56%", apricot: "20% 72%" },
    chips: [
      card("plan-week", "The meal plan's week, Sunday 15 to Saturday 21, with today, Friday 20, picked and dots under the planned days.", 210, 24, 48),
      card("plan-breakfast", "Breakfast at 8:00 AM, planned with Iron-Fortified Oats and Banana, and a Serve button.", 336, 0, 140),
    ],
  },
  {
    title: "Keep track of what you've prepped.",
    body: "See servings left and when to use each batch.",
    glow: { sea: "26% 52%", apricot: "82% 66%" },
    chips: [
      card(
        "storage-list",
        "Storage: Pear and Spinach in the fridge and Sweet Potato Lentil Patties in the freezer, each with its servings and days left.",
        654,
        0,
        40,
      ),
    ],
  },
  {
    title: "Introduce allergens step by step.",
    body: "Know what's started, established, and due next.",
    glow: { sea: "72% 58%", apricot: "16% 48%" },
    chips: [
      card("allergens-ring", "Allergen progress ring: 2 of 9 established, 1 due for a serve, 2 started and 5 not started yet.", 318, 0, 28),
      card("allergens-peanut", "Peanut, established, with how to serve it safely and a Serve again soon nudge.", 510, 24, 140),
    ],
  },
  {
    title: "Find food and recipe ideas.",
    body: "Recipes and first foods, with prep for your baby's age.",
    glow: { sea: "30% 54%", apricot: "80% 40%" },
    chips: [
      card("recipe-egg-muffins", "Recipe card: Broccoli Cheese Egg Muffins, with broccoli, cheese and egg, from 6 months.", 306, 0, 20),
      card("recipe-beet-hummus", "Recipe card: Pink Beet Hummus, with beets, chickpeas, lemon and tahini, from 6 months.", 306, 24, 116),
      { ...card("recipe-omelet-fingers", "Recipe card: Veggie Omelet Fingers, with bell pepper, egg and spinach, from 6 months.", 306, 0, 212), optional: true },
    ],
  },
];

/** Shown under the last slide and at the end of About: one sentence, one place. */
export const DISCLAIMER = "Little Meals is educational, not medical advice. Consult your pediatrician.";
