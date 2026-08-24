import type { PairingSeed } from './types'

// Curated iron-food -> vitamin-C-food pairings. Vitamin C meaningfully boosts absorption of
// non-heme (plant-based) iron; heme iron from meat, poultry, and fish already absorbs well on
// its own, but a vitamin-C side still rounds out the meal, so a few heme pairings are included
// for variety alongside the non-heme pairings that matter most nutritionally.
export const pairings: PairingSeed[] = [
  {
    ironFoodSlug: 'lentils',
    vitCFoodSlug: 'bell_pepper',
    reason: "Vitamin C from bell pepper converts lentils' non-heme iron into a form baby's body absorbs much more efficiently.",
  },
  {
    ironFoodSlug: 'chickpeas',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C boosts absorption of the plant-based iron in chickpeas.",
  },
  {
    ironFoodSlug: 'black_beans',
    vitCFoodSlug: 'orange',
    reason: 'A little orange alongside black beans meaningfully increases how much non-heme iron gets absorbed.',
  },
  {
    ironFoodSlug: 'tofu',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of tofu's non-heme iron.",
  },
  {
    ironFoodSlug: 'iron_fortified_oats',
    vitCFoodSlug: 'strawberry',
    reason: 'Mashed strawberry stirred into iron-fortified oats boosts absorption of the added non-heme iron.',
  },
  {
    ironFoodSlug: 'spinach',
    vitCFoodSlug: 'kiwi',
    reason: "Kiwi's vitamin C helps offset spinach's natural absorption-blocking compounds (oxalates) and improves non-heme iron uptake.",
  },
  {
    ironFoodSlug: 'quinoa',
    vitCFoodSlug: 'mango',
    reason: "Mango's vitamin C helps baby absorb more of quinoa's non-heme iron.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'sweet_potato',
    reason: "Sweet potato adds vitamin C variety alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'chicken_thigh',
    vitCFoodSlug: 'butternut_squash',
    reason: "Butternut squash's vitamin C rounds out the meal alongside chicken thigh's heme iron.",
  },
  {
    ironFoodSlug: 'salmon',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C complements salmon's heme iron and adds flavor and nutrient variety.",
  },
  {
    ironFoodSlug: 'sardines',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C pairs well with sardines' heme iron for a nutrient-dense combination.",
  },
  {
    ironFoodSlug: 'egg',
    vitCFoodSlug: 'strawberry',
    reason: "Strawberry's vitamin C adds a nutrient boost alongside egg's easily-absorbed iron.",
  },
]
