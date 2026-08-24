import type { LadderStepSeed } from './types'

// Top-9 allergen ladder: egg -> peanut -> dairy -> wheat -> soy -> sesame -> tree nut -> fish ->
// shellfish. Protocol: introduce one new allergen at a time, in the morning at home (not at
// daycare or a restaurant), with a tiny first portion; wait the listed number of days before
// introducing the next new allergen; once tolerated, keep the food in rotation 2-3x/week to
// maintain tolerance. Any baby with eczema or an existing food allergy should see a doctor
// before starting the ladder.
export const ladderSteps: LadderStepSeed[] = [
  {
    step: 1,
    allergen: 'egg',
    starterFoodSlug: 'egg',
    howTo:
      'Offer a pea-sized taste of well-cooked, fully mashed whole egg (yolk and white together), thinned with a little breast milk, formula, or water. Watch for about 2 hours after the first taste before offering any other new food.',
    waitDays: 3,
  },
  {
    step: 2,
    allergen: 'peanut',
    starterFoodSlug: 'peanut_butter',
    howTo:
      'Thin about 1/4 teaspoon of smooth peanut butter with 2-3 teaspoons of warm water or breast milk until runny, then offer a small taste on the tip of a spoon or spread very thinly on a strip of toast. Never offer a spoonful of peanut butter straight from the jar or any whole or chopped peanuts.',
    waitDays: 3,
  },
  {
    step: 3,
    allergen: 'milk',
    starterFoodSlug: 'yogurt',
    howTo:
      'Offer a spoon-tip taste (about 1/2 teaspoon) of plain, unsweetened, pasteurized whole-milk yogurt. If tolerated, gradually increase the amount offered over the following days.',
    waitDays: 3,
  },
  {
    step: 4,
    allergen: 'wheat',
    starterFoodSlug: 'wheat_pasta',
    howTo:
      'Offer a pea-sized piece of well-cooked, very soft wheat pasta, or a small strip of wheat toast moistened with milk or water.',
    waitDays: 3,
  },
  {
    step: 5,
    allergen: 'soy',
    starterFoodSlug: 'tofu',
    howTo:
      'Offer a pea-sized, soft cube of well-cooked tofu.',
    waitDays: 3,
  },
  {
    step: 6,
    allergen: 'sesame',
    starterFoodSlug: 'tahini',
    howTo:
      'Thin about 1/4 teaspoon of tahini with warm water or breast milk until runny, then offer a small taste on the tip of a spoon or spread very thinly on toast.',
    waitDays: 3,
  },
  {
    step: 7,
    allergen: 'tree_nut',
    starterFoodSlug: 'almond_butter',
    howTo:
      'Thin about 1/4 teaspoon of smooth almond butter with warm water or breast milk until runny, then offer a small taste on the tip of a spoon. Never offer a spoonful of nut butter straight from the jar or any whole or chopped nuts.',
    waitDays: 3,
  },
  {
    step: 8,
    allergen: 'fish',
    starterFoodSlug: 'salmon',
    howTo:
      'Offer a pea-sized flake of well-cooked, thoroughly deboned salmon.',
    waitDays: 3,
  },
  {
    step: 9,
    allergen: 'shellfish',
    starterFoodSlug: 'shrimp',
    howTo:
      'Offer one small, finely chopped, pea-sized piece of well-cooked shrimp.',
    waitDays: 3,
  },
]
