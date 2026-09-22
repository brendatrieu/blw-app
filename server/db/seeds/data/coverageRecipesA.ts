import type { RecipeSeed } from './types'

// Batch A of the recipe-coverage set (ledger items 338-339). Twenty curated recipes written to
// the design in .workflow/scratch/recipe-coverage/design.md, which chose the ingredient slugs so
// that every catalog food reaches the owner's minimum (>= 3 recipes per food, >= 2 per spice).
// The slugs in `ingredients` are load-bearing for that proof — do not drop or swap one without
// re-running coverage-proof.mts.
//
// Every rule the curated 15 already obey applies here too: no added salt, no added sugar, no
// honey at any age; every cooking step names a method, a temperature (ovens in °F with °C in
// parentheses; stovetop as "over medium heat"), a time range, and the doneness cue that settles
// it — poultry 165°F (74°C), beef/pork/lamb 160°F (71°C), fish 145°F (63°C), egg-set dishes
// 160°F (71°C), "fork-tender" / "mashes easily between two fingers" for produce.
//
// Two extra rules this batch leans on hard, both from the food catalog's own safety copy:
//   - Nuts and seeds are ground to a fine meal, bloomed, or thinned runny, and every one of them
//     goes in COLD or OFF the heat. No nut or seed enters a batter that is then cooked.
//   - Spices and herbs are real catalog ingredients with a quantity note, cooked into the dish
//     rather than sprinkled on dry; fresh herbs are chopped very finely and stirred in at the end.
export const coverageRecipesA: RecipeSeed[] = [
  // Oats, chia and mashed strawberry soaked overnight, with almond butter thinned runny and
  // stirred through. No cooking at any stage.
  {
    slug: 'strawberry-almond-overnight-oats',
    title: 'Strawberry & Almond Butter Overnight Oats',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'oats', quantityNote: '1/3 cup rolled oats' },
      { foodSlug: 'strawberry', quantityNote: '3 strawberries, hulled and finely mashed' },
      {
        foodSlug: 'almond_butter',
        quantityNote: '1 tablespoon smooth almond butter, whisked runny with warm water',
      },
      { foodSlug: 'chia_seeds', quantityNote: '1 teaspoon chia seeds' },
    ],
    extraIngredients: [{ name: 'breast milk, formula, or water to soak' }],
    variants: {
      '6': {
        textureNote:
          'Smooth, thinned overnight oats loose enough to drip slowly off a spoon, with the strawberry mashed so no round berry shape is left.',
        steps: [
          'Stir the oats and chia seeds together in a small bowl with enough breast milk, formula, or water to cover them well.',
          'Leave them in the fridge overnight, or at least 10 minutes if you are in a hurry, until every chia seed has swelled into a soft gel with no dry grit left.',
          'Hull the strawberries and mash them completely flat, so no round or half-berry shape remains, then stir them through.',
          'Whisk the almond butter with a little warm water until it is runny, never thick or straight from the jar, and swirl it through the oats.',
          'Thin with extra milk or water to a smooth, drippy consistency and serve on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Thicker, spoonable oats with finely diced strawberry in pea-sized pieces for pincer-grasp practice.',
        steps: [
          'Soak the oats and chia seeds in a little less liquid than the 6-month version, overnight or for at least 10 minutes, until the chia has gelled and nothing is still dry.',
          'Hull the strawberries and dice them finely so no round or half-berry shape remains, then fold them in.',
          'Whisk the almond butter runny with warm water and stir it through, so no thick pocket is left anywhere.',
          'Serve with a spoon for self-feeding, with a few strawberry pieces on the tray for fingers, and sit with baby throughout.',
        ],
      },
      '12': {
        textureNote: 'Thick, family-style overnight oats with small bite-sized pieces of strawberry.',
        steps: [
          'Soak the oats and chia seeds overnight in enough milk or water for a thick, family-style porridge, long enough that every seed has swelled soft.',
          'Hull and quarter the strawberries lengthwise, never leaving a whole round berry, and stir most of them through.',
          'Whisk the almond butter runny and ripple it over the top, keeping the layer thin rather than a glob.',
          'Serve cold with a spoon and let baby scoop for themselves, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A nut-free porridge that gets its richness from sunflower seed butter and ground flax stirred
  // in at the end.
  {
    slug: 'pear-sunflower-flax-porridge',
    title: 'Pear, Flax & Sunflower Seed Porridge',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'oats', quantityNote: '1/3 cup rolled oats' },
      { foodSlug: 'pear', quantityNote: '1/2 ripe pear, peeled, cored, and finely diced' },
      {
        foodSlug: 'sunflower_seed_butter',
        quantityNote: '1 tablespoon smooth sunflower seed butter, thinned until runny',
      },
      { foodSlug: 'flax_seeds', quantityNote: '1 teaspoon flaxseed, ground to a meal' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch, stirred in as the oats cook' },
    ],
    extraIngredients: [{ name: 'breast milk, formula, or water to thin' }],
    variants: {
      '6': {
        textureNote:
          'Smooth, thin porridge loose enough to drip slowly off a spoon, with the pear cooked until it mashes easily between two fingers.',
        steps: [
          'Simmer the diced pear in a splash of water over low heat for 5-7 minutes, until it mashes easily between two fingers.',
          'Cook the oats with breast milk, formula, or water over medium-low heat for 4-5 minutes, with a pinch of cinnamon stirred in as they go, until soft and smooth.',
          'Take the pan off the heat, then stir in the softened pear and the ground flaxseed until it disappears into the porridge.',
          'Whisk the sunflower seed butter with a little warm water until it is runny, then swirl it through so no thick pocket is left.',
          'Thin with extra liquid to a drippy consistency and serve on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Thicker, spoonable porridge with small soft pieces of pear left in for pincer-grasp practice.',
        steps: [
          'Simmer the diced pear in a splash of water over low heat for 5-7 minutes, until it squashes easily between two fingers, leaving some pea-to-bite-sized pieces whole.',
          'Cook the oats over medium-low heat for 4-5 minutes with a pinch of cinnamon, until thick enough to sit on a spoon.',
          'Off the heat, stir through the pear, the ground flaxseed, and the sunflower seed butter whisked runny with warm water.',
          'Serve with a spoon for self-feeding, checking the pear pieces squash easily first, and sit with baby throughout.',
        ],
      },
      '12': {
        textureNote: 'Thick, family-style porridge with small bite-sized pieces of ripe pear.',
        steps: [
          'Cook the oats over medium-low heat for 5-6 minutes with a pinch of cinnamon, until thick and family-style.',
          'Dice a ripe pear into small bite-sized pieces, softening it first over low heat for 5-7 minutes if it is still firm, then fold it in.',
          'Stir in the ground flaxseed and a swirl of sunflower seed butter whisked runny, mixed evenly so no thick pockets remain.',
          'Serve warm with a spoon, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Smashed blueberries and banana folded through yogurt with a dusting of fine pecan meal.
  {
    slug: 'blueberry-pecan-yogurt-smash',
    title: 'Blueberry & Pecan Yogurt Smash',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'yogurt', quantityNote: '1/2 cup plain whole-milk yogurt' },
      { foodSlug: 'blueberry', quantityNote: '1/4 cup blueberries, smashed completely flat' },
      { foodSlug: 'pecans', quantityNote: '1 teaspoon pecans, ground to a fine meal' },
      { foodSlug: 'banana', quantityNote: '1/2 ripe banana, mashed' },
    ],
    variants: {
      '6': {
        textureNote:
          'A smooth, spoonable smash — every blueberry crushed flat and the banana mashed, with the pecans ground to a fine, flour-like meal.',
        steps: [
          'Smash each blueberry flat with a fork, so no whole, round berry shape remains.',
          'Mash the banana smooth and fold it through the yogurt.',
          'Grind the pecans to a fine, flour-like meal — never a half or a piece — and stir a teaspoon of it through until it disappears.',
          'Fold in the smashed blueberries and serve on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Thick yogurt with pea-sized pieces of banana and quartered blueberries baby can pick up between finger and thumb.',
        steps: [
          'Smash the blueberries flat or quarter them lengthwise, so no round or half-berry shape is left.',
          'Cut the banana into half-moons or small pea-to-bite-sized pieces and stir most of them into the yogurt.',
          'Stir in the finely ground pecan meal so nothing crunchy remains.',
          'Serve with a spoon, keeping a few pieces of fruit on the tray for pincer-grasp practice, and stay close and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Family-style yogurt bowl with small bite-sized fruit and a dusting of fine pecan meal.',
        steps: [
          'Quarter the blueberries lengthwise rather than serving them whole, even now that chewing is improving.',
          'Slice the banana into small bite-sized pieces and add them to the yogurt.',
          'Stir a teaspoon of finely ground pecan meal through the bowl — halves and pieces stay off the menu.',
          'Serve cold with a spoon and let baby scoop for themselves, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A soft chia pudding set in mashed kiwi and banana — no cooking, no sweetener.
  {
    slug: 'kiwi-banana-chia-pudding',
    title: 'Kiwi & Banana Chia Pudding',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'chia_seeds', quantityNote: '1 1/2 tablespoons chia seeds, enough for 2-3 baby portions' },
      { foodSlug: 'kiwi', quantityNote: '1 ripe kiwi, peeled and mashed' },
      { foodSlug: 'banana', quantityNote: '1/2 ripe banana, mashed' },
    ],
    extraIngredients: [{ name: 'breast milk, formula, or water to soak' }],
    variants: {
      '6': {
        textureNote:
          'A soft, spoonable pudding thinned until it drips slowly off a spoon, with the kiwi and banana mashed smooth.',
        steps: [
          'Stir the chia seeds into the breast milk, formula, or water and leave them at least 10 minutes, or overnight in the fridge, until every seed has swelled into a soft gel with no dry grit left.',
          'Peel the kiwi and mash it with the banana until smooth.',
          'Fold the fruit through the gelled chia.',
          'Thin with a little more milk or water to a smooth, drippy consistency and serve on a pre-loaded spoon.',
          'Keep the portion small — chia is very high in fiber, so a teaspoon of seed a serving is plenty — and offer water in an open cup alongside, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Soft, spoonable pudding with the fruit in pea-to-bite-sized pieces baby can pick up.',
        steps: [
          'Soak the chia seeds in milk or water for at least 10 minutes, or overnight, until they have swelled into a soft gel and nothing is still dry.',
          'Peel and dice the kiwi into pea-to-bite-sized soft pieces and cut the banana into half-moons.',
          'Stir most of the fruit through the gelled chia, keeping a few pieces back for the tray.',
          'Serve with a spoon for self-feeding, with water alongside, and sit with baby throughout.',
        ],
      },
      '12': {
        textureNote: 'Thicker, family-style pudding with small bite-sized kiwi and banana.',
        steps: [
          'Soak the chia seeds in milk or water overnight — never stirred in dry — until the gel is thick and spoonable.',
          'Peel and dice the kiwi into small bite-sized pieces and slice the banana into small rounds.',
          'Fold the fruit through and serve cold with a spoon.',
          'Keep the portion small and offer water alongside, since a spoonful of chia carries a lot of fiber, and serve with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A cool summer breakfast — soft melon and kiwi with yogurt and hemp hearts.
  {
    slug: 'watermelon-kiwi-hemp-bowl',
    title: 'Watermelon, Kiwi & Hemp Yogurt Bowl',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'watermelon', quantityNote: '1 thick finger-length strip of seedless watermelon' },
      { foodSlug: 'kiwi', quantityNote: '1/2 ripe kiwi, peeled' },
      { foodSlug: 'hemp_seeds', quantityNote: '1 teaspoon hulled hemp hearts' },
      { foodSlug: 'yogurt', quantityNote: '1/4 cup plain whole-milk yogurt' },
    ],
    variants: {
      '6': {
        textureNote:
          'Finger-length strips of melon and kiwi to grip, with yogurt and hemp hearts alongside on a pre-loaded spoon.',
        steps: [
          'Remove all the seeds and rind from the watermelon and cut a thick finger-length strip that is not too thin to grip.',
          'Peel the kiwi and cut a finger-length wedge from the soft, ripe flesh.',
          'Spoon the yogurt into a small bowl and sprinkle a pinch of hulled hemp hearts over it, so they cling to the wet surface rather than scattering.',
          'Serve the fruit strips alongside for dipping, and load a spoon with yogurt for baby to take, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Pea-to-bite-sized pieces of melon and kiwi for pincer-grasp practice, with hemp hearts stirred through the yogurt.',
        steps: [
          'Remove every seed and all the rind from the watermelon and dice it into pea-to-bite-sized pieces.',
          'Peel the kiwi and dice it the same size.',
          'Stir a pinch of hulled hemp hearts through the yogurt so they soften into it.',
          'Serve the fruit on the tray with the yogurt in a bowl for dipping and scooping, and sit with baby throughout — melon can be slippery.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized fruit in a family-style yogurt bowl finished with hemp hearts.',
        steps: [
          'Dice the deseeded, derinded watermelon and the peeled kiwi into small bite-sized pieces.',
          'Spoon the yogurt into a bowl and fold the fruit through.',
          'Sprinkle a pinch of hulled hemp hearts over the top, onto the wet yogurt so they cling.',
          'Serve cold with a spoon, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Soft toast fingers under a thin layer of runny almond butter, mashed banana, and ground flax.
  {
    slug: 'banana-almond-butter-toast-fingers',
    title: 'Banana & Almond Butter Toast Fingers',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'wheat_toast', quantityNote: '1 slice bread' },
      {
        foodSlug: 'almond_butter',
        quantityNote: '1 tablespoon smooth almond butter, whisked runny with warm water',
      },
      { foodSlug: 'banana', quantityNote: '1/2 ripe banana, mashed' },
      { foodSlug: 'flax_seeds', quantityNote: '1 teaspoon flaxseed, ground to a meal' },
    ],
    extraIngredients: [{ name: 'water or milk to moisten the bread' }],
    variants: {
      '6': {
        textureNote:
          'Soft finger-length strips that bend without snapping, under a very thin layer of runny almond butter and mashed banana.',
        steps: [
          'Toast the bread lightly for 1-2 minutes, then moisten it with a little water or milk until it is soft and bends without snapping.',
          'Cut it into finger-length strips.',
          'Whisk the almond butter with warm water until it is runny, never thick or straight from the jar, and spread a very thin layer over each strip.',
          'Mash the banana smooth, smooth it over the top, and dust the ground flaxseed over so it disappears into the banana.',
          'Serve straight away, while the strips are still soft, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Small soft squares for pincer-grasp self-feeding, with banana in pea-sized pieces on top.',
        steps: [
          'Toast and moisten the bread for 1-2 minutes, until it is soft, then cut it into small squares.',
          'Whisk the almond butter runny with warm water and spread it thinly over each square.',
          'Cut the banana into half-moons or small pea-sized pieces and press a few onto each square.',
          'Sprinkle the ground flaxseed over the wet nut butter so it sticks rather than scattering.',
          'Serve on the tray for self-feeding, with baby sitting upright and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Small bite-sized squares or triangles, family-style, with a thin nut-butter layer and soft banana.',
        steps: [
          'Toast the bread for 1-2 minutes, until golden, and cut it into small bite-sized squares or triangles.',
          'Whisk the almond butter runny for spreading — still no thick spoonfuls or globs — and spread a thin layer on each piece.',
          'Slice the banana into small bite-sized rounds and add them on top with a sprinkle of ground flaxseed.',
          'Serve with a vitamin-C side like orange segments with the membrane removed, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A mild muhammara-style dip — sweet roasted pepper blended smooth with fine walnut meal and a
  // pinch of cumin warmed in oil first.
  {
    slug: 'roasted-pepper-walnut-dip',
    title: 'Roasted Red Pepper & Walnut Dip',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: false,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'bell_pepper', quantityNote: '1 red bell pepper' },
      { foodSlug: 'walnuts', quantityNote: '2 tablespoons walnuts, ground to a fine meal' },
      { foodSlug: 'wheat_toast', quantityNote: '1 slice bread, for dipping fingers' },
      { foodSlug: 'cumin', quantityNote: 'a pinch, warmed in a little oil and blended into the dip' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'lemon juice', quantityNote: 'a squeeze of' },
    ],
    variants: {
      '6': {
        textureNote:
          'A smooth, thick dip that holds on a soft finger-length strip of bread, with the pepper cooked until the skin wrinkles and peels away.',
        steps: [
          'Roast the whole bell pepper at 425°F (220°C) for 20-25 minutes, until the skin blisters and the flesh is completely soft.',
          'Let it cool, then peel off every scrap of skin and pull out the seeds and stalk — the skin is tough and stays out of a baby dip.',
          'Warm a pinch of cumin in a little olive oil over medium heat for 30-60 seconds, until it smells fragrant, then take the pan off the heat.',
          'Grind the walnuts to a fine, flour-like meal — never a half or a piece — and blend them raw into the peeled pepper with the cumin oil and a squeeze of lemon juice, until smooth with nothing crunchy left.',
          'Toast the bread for 1-2 minutes and moisten it until it bends without snapping, then cut it into finger-length strips.',
          'Spread a thin layer of the dip along each strip and serve, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Smooth dip with small soft squares of bread for pincer-grasp dipping, the pepper cooked soft and the skin removed.',
        steps: [
          'Roast the bell pepper at 425°F (220°C) for 20-25 minutes, until the skin blisters and the flesh gives completely, then cool and peel it.',
          'Warm the cumin in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Blend the peeled pepper with the finely ground walnut meal, the cumin oil, and a squeeze of lemon juice, until smooth.',
          'Toast and moisten the bread for 1-2 minutes, until soft, then cut it into small squares for pincer-grasp self-feeding.',
          'Serve the dip in a shallow bowl with the squares alongside, with baby sitting upright and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Family-style dip with small bite-sized bread triangles, still smooth and completely salt-free.',
        steps: [
          'Roast the pepper at 425°F (220°C) for 20-25 minutes, until soft and blistered, then cool and peel it, removing every seed.',
          'Warm the cumin in a little olive oil over medium heat for 30-60 seconds, until it smells fragrant.',
          'Blend it with the finely ground walnut meal and lemon juice until smooth — the meal stays ground, since nut pieces are off the menu until age 4-5.',
          'Toast the bread for 1-2 minutes, until golden, and cut it into small bite-sized triangles.',
          'Serve as part of a plate with soft vegetables, with no added salt anywhere, and with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Soft black beans and sweet potato smashed together, finished with fine pumpkin seed meal and a
  // little cilantro off the heat.
  {
    slug: 'black-bean-pumpkin-seed-smash',
    title: 'Black Bean & Sweet Potato Smash',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      {
        foodSlug: 'black_beans',
        quantityNote: '1/2 cup cooked no-salt-added black beans, rinsed',
      },
      { foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato, peeled and cubed' },
      { foodSlug: 'bell_pepper', quantityNote: '1/4 bell pepper, finely diced' },
      { foodSlug: 'pumpkin_seeds', quantityNote: '2 teaspoons pumpkin seeds, ground to a fine meal' },
      {
        foodSlug: 'cilantro',
        quantityNote: 'a small amount, chopped very finely and stirred in at the end',
      },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A thick, scoopable smash — every bean squashed flat and the sweet potato mashed until it gives easily between two fingers.',
        steps: [
          'Steam the cubed sweet potato for 12-15 minutes, until a cube mashes easily between two fingers.',
          'Soften the finely diced bell pepper in a little olive oil over medium heat for 4-5 minutes, until completely tender with no papery skin left.',
          'Add the rinsed black beans and warm them through over medium heat for 3-4 minutes, then mash them well so no bean keeps its round shape.',
          'Mash the sweet potato in and take the pan off the heat.',
          'Grind the pumpkin seeds to a fine meal and stir a couple of teaspoons through off the heat, with a little very finely chopped cilantro.',
          'Cool to a safe temperature and serve thick and scoopable on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Soft smash with pea-to-bite-sized cubes of sweet potato and pepper, and every bean squashed flat.',
        steps: [
          'Steam the cubed sweet potato for 12-15 minutes, until soft, then cut it into pea-to-bite-sized cubes.',
          'Soften the finely diced bell pepper in a little olive oil over medium heat for 4-5 minutes, until tender all the way through.',
          'Warm the beans through over medium heat for 3-4 minutes and squash each one flat between your fingers, leaving some soft texture.',
          'Off the heat, stir in the finely ground pumpkin seed meal and a little very finely chopped cilantro.',
          'Cool and serve on the tray for pincer-grasp self-feeding, with a spoon alongside, staying close and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Family-style bowl with small bite-sized pieces and whole soft beans that squash easily between two fingers.',
        steps: [
          'Roast the cubed sweet potato at 400°F (200°C) for 20-25 minutes, until fork-tender, then dice it into small bite-sized pieces.',
          'Soften the diced pepper in a little olive oil over medium heat for 4-5 minutes, until tender.',
          'Warm the beans through over medium heat for 3-4 minutes and squash any that are still firm, so each one gives easily between two fingers.',
          'Stir it all together off the heat with the finely ground pumpkin seed meal and finely chopped cilantro leaves, keeping the stringy stalks out.',
          'Cool to a safe temperature, then serve as part of a family plate, with no added salt, and baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A gentle, chili-free chili — beef and black beans simmered soft in tomato with cumin and sweet
  // paprika.
  {
    slug: 'beef-black-bean-chili-mash',
    title: 'Mild Beef & Black Bean Chili Mash',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'beef', quantityNote: '225g (8oz) lean ground beef' },
      {
        foodSlug: 'black_beans',
        quantityNote: '1/2 cup cooked no-salt-added black beans, rinsed and mashed',
      },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'cumin', quantityNote: 'a pinch, warmed in the pan before the meat' },
      { foodSlug: 'paprika', quantityNote: 'a pinch of sweet (mild) paprika' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A soft, thick mash with the beef minced very finely and moistened with the sauce, and every bean squashed flat.',
        steps: [
          'Warm a pinch of cumin and a pinch of sweet (mild) paprika in a little olive oil over medium heat for 30-60 seconds, until they smell fragrant.',
          'Brown the ground beef over medium heat for 5-6 minutes, breaking it up as it goes, until no pink is left on the outside.',
          'Add the skinned, diced tomatoes and the rinsed beans, then simmer covered over low heat for 20-25 minutes, until the beef is well-done at 160°F (71°C) with no pink left and the tomato has broken down.',
          'Mash the beans so none keeps its round shape, and mince or shred the beef very finely so nothing tough or stringy is left.',
          'Moisten it all with the sauce so it is never dry, cool to a safe temperature, and serve thick on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Soft, pea-sized pieces of beef and squashed beans in a thick sauce baby can pick up or scoop.',
        steps: [
          'Warm a pinch of cumin and sweet paprika in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Brown the beef over medium heat for 5-6 minutes, then add the skinned, diced tomato and the rinsed beans.',
          'Simmer covered over low heat for 20-25 minutes, until the beef reads 160°F (71°C) with no pink left and the sauce is thick.',
          'Finely chop or shred the beef into soft, pea-sized pieces and squash each bean flat.',
          'Cool and serve on the tray for pincer-grasp self-feeding, with a spoon for the sauce, staying close throughout.',
        ],
      },
      '12': {
        textureNote:
          'Family-style chili with small bite-sized beef and soft whole beans, still mild and salt-free.',
        steps: [
          'Warm the cumin and sweet paprika in a little olive oil over medium heat for 30-60 seconds — sweet paprika only, never hot, smoked hot, or chili powder.',
          'Brown the beef over medium heat for 5-6 minutes, then add the diced tomato and beans.',
          'Simmer covered over low heat for 25-30 minutes, until the beef is tender and well past 160°F (71°C) and the beans squash easily between two fingers.',
          'Dice or shred the beef into small, soft bite-sized pieces, cool to a safe temperature, and serve with soft rice on the side, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Finely shredded chicken thigh folded through quinoa with soft broccoli and a little cooked
  // garlic.
  {
    slug: 'chicken-thigh-broccoli-quinoa',
    title: 'Chicken Thigh, Broccoli & Quinoa',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      {
        foodSlug: 'chicken_thigh',
        quantityNote: '1 boneless, skinless chicken thigh (about 115g/4oz)',
      },
      { foodSlug: 'quinoa', quantityNote: '1/2 cup cooked quinoa' },
      { foodSlug: 'broccoli', quantityNote: '1 cup broccoli florets' },
      { foodSlug: 'garlic', quantityNote: '1/2 small clove, finely minced and softened in the pan' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Quinoa pressed into a soft patty shape rather than loose grains, with finely shredded thigh meat and florets that mash easily between two fingers.',
        steps: [
          'Soften half a small clove of finely minced garlic in a little olive oil over medium heat for 30-60 seconds, until it smells sweet rather than raw.',
          'Cook the chicken thigh in the same pan over medium heat for about 6-7 minutes a side, until it is cooked through to 165°F (74°C) with no pink left, then rest it and shred it finely.',
          'Steam the broccoli florets for 8-10 minutes, keeping a bit of stem as a handle, until they mash easily between two fingers.',
          'Stir the cooked quinoa through the garlicky pan juices and press it into a soft patty shape, since loose grains are hard to pick up.',
          'Serve the patty with a floret to hold and a small pile of shredded thigh moistened with a little olive oil so it is not dry, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Loose soft quinoa for pincer-grasp practice with pea-sized pieces of thigh meat and small florets.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Cook the thigh through to 165°F (74°C) — about 6-7 minutes a side over medium heat — until no pink is left, then chop or shred it into soft, pea-sized pieces.',
          'Steam the broccoli for 8-10 minutes, until soft, and cut it into small pea-to-bite-sized florets.',
          'Fold the cooked quinoa through the pan juices and serve it loose for pincer-grasp practice.',
          'Combine on the tray, with the chicken moistened so it does not crumble apart, and sit with baby throughout.',
        ],
      },
      '12': {
        textureNote:
          'Family-style bowl of soft quinoa with small bite-sized chicken and tender florets.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium heat for 30-60 seconds.',
          'Cook the thigh to 165°F (74°C) — about 6-7 minutes a side over medium heat — until no pink is left, then rest it and dice it into small, soft bite-sized pieces.',
          'Roast the broccoli at 400°F (200°C) for 15-18 minutes, until tender, and cut it into small bite-sized florets.',
          'Stir it all through the quinoa and serve with a fork and fingers together, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A no-salt weeknight stew — chicken, carrot, and green beans simmered until everything gives
  // under a fork, spooned over soft rice.
  {
    slug: 'chicken-carrot-green-bean-stew',
    title: 'Chicken, Carrot & Green Bean Stew',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chicken', quantityNote: '1 chicken breast (about 150g/5oz), diced' },
      { foodSlug: 'carrot', quantityNote: '1 carrot, peeled and diced' },
      {
        foodSlug: 'green_beans',
        quantityNote: 'a handful of green beans, topped, tailed, and cut small',
      },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice, cooked fresh to serve' },
      { foodSlug: 'black_pepper', quantityNote: 'a small pinch, finely ground, cooked in' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water or no-salt-added stock' },
    ],
    variants: {
      '6': {
        textureNote:
          'A soft stew mashed thick and scoopable, with the chicken shredded finely and moistened, the carrot mashing easily between two fingers, and the rice pressed into a soft ball.',
        steps: [
          'Dice the chicken breast, peel and dice the carrot, and top, tail, and cut the green beans small.',
          'Cover with water or a no-salt-added stock, add a small pinch of finely ground black pepper, and simmer covered over low heat for 25-30 minutes, until the carrot is fork-tender and the chicken reads 165°F (74°C) with no pink left.',
          'Lift the chicken out and shred it finely, moistening it with the cooking liquid so it is never dry or stringy.',
          'Mash the carrot and green beans until they give easily between two fingers, then stir the chicken back in.',
          'Press the soft, sticky rice into a small ball or patty and serve it alongside the stew on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Soft stew with pea-to-bite-sized carrot and green bean pieces and pea-sized chicken, with loose soft rice.',
        steps: [
          'Simmer the diced chicken, carrot, and green beans in water or no-salt-added stock over low heat for 25-30 minutes, with a small pinch of finely ground black pepper, until the carrot is soft and the chicken reads 165°F (74°C).',
          'Shred or chop the chicken into soft, pea-sized pieces, moistened so they do not crumble apart.',
          'Cut the carrot and green beans into pea-to-bite-sized pieces.',
          'Serve the soft rice loose for pincer-grasp practice, with the stew spooned over, and stay close and supervised.',
        ],
      },
      '12': {
        textureNote: 'Family-style stew with small bite-sized pieces, served over soft rice.',
        steps: [
          'Simmer the chicken, carrot, and green beans over low heat for 25-30 minutes, with a pinch of finely ground pepper, until everything is tender and the chicken is 165°F (74°C) throughout.',
          'Dice the chicken into small, soft bite-sized pieces and cut the vegetables the same size.',
          'Serve over soft rice, reheating leftover rice only once and discarding anything left after that.',
          'Let baby practice with a spoon and fingers, with no added salt in the pot, and baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A korma-gentle curry thickened with cashew butter stirred in off the heat, no chili and no salt.
  {
    slug: 'cashew-chicken-mild-curry',
    title: 'Mild Cashew Chicken Curry',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chicken', quantityNote: '1 chicken breast (about 150g/5oz), diced' },
      {
        foodSlug: 'cashew_butter',
        quantityNote: '1 tablespoon smooth cashew butter, whisked runny with warm water',
      },
      { foodSlug: 'butternut_squash', quantityNote: '1 cup butternut squash, peeled and cubed' },
      {
        foodSlug: 'curry_powder',
        quantityNote: 'a pinch of mild, salt-free, chili-free curry powder, cooked in',
      },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice, cooked fresh to serve' },
    ],
    extraIngredients: [
      { name: 'unsweetened coconut milk' },
      { name: 'olive oil', quantityNote: 'a drizzle of' },
    ],
    variants: {
      '6': {
        textureNote:
          'A thick, well-mashed curry that is scoopable but not smooth, with the squash mashing easily between two fingers and the chicken shredded finely.',
        steps: [
          'Warm a pinch of mild, salt-free, chili-free curry powder in a little olive oil over medium heat for 30-60 seconds, until it smells fragrant.',
          'Add the diced chicken, the cubed butternut squash, and the coconut milk, then simmer covered over low heat for 20-25 minutes, until the squash falls apart under a fork and the chicken reads 165°F (74°C) with no pink left.',
          'Shred the chicken finely and mash the squash, so nothing needs chewing.',
          'Take the pan off the heat, whisk the cashew butter with a little warm water until runny, and stir it through so no thick pocket is left anywhere.',
          'Press the soft rice into a small ball and serve it alongside the curry on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Soft curry with pea-sized chicken and small soft cubes of squash, with loose rice for pincer-grasp practice.',
        steps: [
          'Warm the mild curry powder in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Simmer the diced chicken and cubed squash in coconut milk over low heat for 20-25 minutes, until the squash is soft and the chicken reads 165°F (74°C).',
          'Chop the chicken into soft, pea-sized pieces and cut the squash into pea-to-bite-sized cubes.',
          'Off the heat, stir through the cashew butter whisked runny with warm water.',
          'Serve with soft rice for pincer-grasp practice and a spoon for the sauce, with baby sitting upright and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Family-style mild curry with small bite-sized chicken and squash over soft rice.',
        steps: [
          'Warm the mild curry powder in a little olive oil over medium heat for 30-60 seconds — a blend with no salt and no chili in it.',
          'Simmer the chicken and squash in coconut milk over low heat for 20-25 minutes, until tender and the chicken is 165°F (74°C) throughout.',
          'Dice both into small bite-sized pieces and stir the runny cashew butter through off the heat, never as a thick glob.',
          'Serve over soft rice with a spoon and fingers, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Soft turkey-and-spinach meatballs baked, not fried, and simmered into an oregano tomato sauce.
  {
    slug: 'turkey-spinach-meatballs',
    title: 'Turkey & Spinach Meatballs in Tomato Sauce',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'turkey', quantityNote: '225g (8oz) ground turkey' },
      {
        foodSlug: 'spinach',
        quantityNote: 'a large handful of spinach, wilted and chopped very finely',
      },
      {
        foodSlug: 'tomato',
        quantityNote: '2 tomatoes, skinned and diced, or 200g passata with no added salt',
      },
      {
        foodSlug: 'oregano',
        quantityNote: 'a pinch of dried oregano, rubbed fine between your fingers',
      },
      { foodSlug: 'wheat_pasta', quantityNote: '60g small pasta shapes, to serve' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Finger-length turkey logs rather than round meatballs, soft and moist, with very soft pasta and a smooth tomato sauce.',
        steps: [
          'Wilt the spinach for 2-3 minutes, until very soft, then chop it very finely and squeeze the water out.',
          'Mix it through the ground turkey with a little olive oil and a pinch of dried oregano rubbed fine between your fingers, then shape finger-length logs rather than balls — a firm, round meatball never goes on the tray whole.',
          'Bake the logs at 375°F (190°C) for 16-18 minutes, until they read 165°F (74°C) in the centre with no pink left.',
          'Simmer the skinned, diced tomatoes over low heat for 15-20 minutes, until they collapse into a soft sauce, then mash it smooth.',
          'Cook the pasta for 10-12 minutes, well past al dente, until it is soft enough to squash against the roof of the mouth.',
          'Spoon the sauce over the pasta, moisten the turkey logs with it so they are never dry, and serve, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Soft, pea-sized pieces of turkey and small pasta shapes for pincer-grasp self-feeding.',
        steps: [
          'Wilt the spinach for 2-3 minutes, chop it very finely, squeeze the water out, and mix it into the turkey with a little olive oil and a pinch of finely rubbed oregano.',
          'Bake small meatballs at 375°F (190°C) for 14-16 minutes, until they read 165°F (74°C) in the centre, then squash each one flat rather than serving it round.',
          'Simmer the skinned, diced tomato over low heat for 15-20 minutes, until it breaks down into a soft sauce.',
          'Cook the small pasta shapes for 10-12 minutes, past al dente, until soft.',
          'Break the meatballs into soft, pea-sized pieces and serve them through the pasta and sauce, staying close and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Family-style pasta with small bite-sized meatball pieces in an oregano tomato sauce.',
        steps: [
          'Squeeze the water out of the finely chopped wilted spinach, then mix it into the turkey with a pinch of finely rubbed oregano and a little olive oil, which keeps lean turkey from turning dry and crumbly.',
          'Bake the meatballs at 375°F (190°C) for 16-18 minutes, until they are 165°F (74°C) in the centre.',
          'Simmer the tomato sauce over low heat for 15-20 minutes, until thick, and stir a little more oregano through.',
          'Cook the pasta for 10-12 minutes, until tender, and toss it through the sauce.',
          'Cut the meatballs into small bite-sized pieces — never a whole round meatball — and serve with no added salt, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Flaked cod, sweet potato, and squashed peas bound with egg into soft finger-shaped cakes.
  {
    slug: 'cod-pea-fish-cakes',
    title: 'Cod, Pea & Sweet Potato Fish Cakes',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: false,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'cod', quantityNote: '175g (6oz) cod fillet' },
      { foodSlug: 'peas', quantityNote: '1/2 cup peas' },
      { foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato, peeled and cubed' },
      { foodSlug: 'dill', quantityNote: 'a little, fronds snipped finely and stirred in' },
      { foodSlug: 'egg', quantityNote: '1 egg, beaten' },
    ],
    extraIngredients: [{ name: 'olive oil for the pan' }],
    variants: {
      '6': {
        textureNote:
          'Soft finger-shaped cakes about the length and thickness of an adult finger, easy to gum and mash against the roof of the mouth.',
        steps: [
          'Bake the cod at 375°F (190°C) for 10-12 minutes, until it is opaque and flakes easily at 145°F (63°C), then run your fingers through every flake and remove any bones.',
          'Steam the cubed sweet potato for 12-15 minutes and the peas for 4-5 minutes, until both mash easily between two fingers.',
          'Mash the sweet potato, squash every pea flat so none keeps its round shape, and fold in the flaked cod with the beaten egg and a little finely snipped dill.',
          'Shape finger-length cakes and pan-fry them in a little olive oil over medium heat for about 3 minutes a side, until firm and set through to 160°F (71°C) in the centre.',
          'Cool until just warm, check a cake mashes easily, and serve whole or torn into strips, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Pea-sized, soft crumbled pieces of fish cake baby can pick up between finger and thumb.',
        steps: [
          'Bake the cod at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), checking every flake for bones by feel.',
          'Steam the sweet potato for 12-15 minutes and the peas for 4-5 minutes, until soft, then squash each pea flat.',
          'Mix with the beaten egg and finely snipped dill fronds, and shape small cakes.',
          'Pan-fry in a little olive oil over medium heat for about 3 minutes a side, until set to 160°F (71°C), then cool and break into soft, pea-sized pieces.',
          'Serve on the tray for pincer-grasp self-feeding, staying close and supervised.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces, or a mini cake to pick up and bite from.',
        steps: [
          'Bake the cod at 375°F (190°C) for 10-12 minutes, until it flakes at 145°F (63°C), then flake it and check thoroughly for bones.',
          'Steam the sweet potato and peas for 12-15 minutes, until tender, and mash them together.',
          'Bind with the beaten egg and finely snipped dill, shape mini cakes, and pan-fry in a little olive oil over medium heat for about 3 minutes a side, until golden and 160°F (71°C) in the centre.',
          'Cool until just warm, cut into small bite-sized pieces, and serve with soft vegetables on the side, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Cod baked in a soft garlicky tomato sauce with green beans, finished with fresh basil off the
  // heat.
  {
    slug: 'baked-cod-tomato-green-beans',
    title: 'Baked Cod with Tomato & Green Beans',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: false,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'cod', quantityNote: '175g (6oz) cod fillet' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      {
        foodSlug: 'green_beans',
        quantityNote: 'a handful of green beans, topped, tailed, and cut small',
      },
      {
        foodSlug: 'basil',
        quantityNote: '2 leaves, chopped very finely and stirred in at the end',
      },
      { foodSlug: 'garlic', quantityNote: '1/2 small clove, finely minced and softened in the pan' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A soft finger-length piece of flaked cod under a smooth tomato sauce, with whole steamed green beans to hold.',
        steps: [
          'Soften half a small clove of finely minced garlic in a little olive oil over medium heat for 30-60 seconds, until it smells sweet rather than raw.',
          'Add the skinned, diced tomatoes and simmer over low heat for 10-12 minutes, until they collapse into a soft sauce.',
          'Spoon the sauce over the cod and bake at 375°F (190°C) for 12-15 minutes, until the fish is opaque and flakes easily at 145°F (63°C).',
          'Steam the trimmed green beans for 8-10 minutes, until they mash easily between two fingers, and serve them whole as a finger food.',
          'Run your fingers through every flake of cod for bones, stir the very finely chopped basil through the sauce off the heat, and spoon it over, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Pea-sized flakes of cod with pea-to-bite-sized green beans for pincer-grasp self-feeding.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium heat for 30-60 seconds, then simmer the skinned, diced tomato over low heat for 10-12 minutes, until soft.',
          'Bake the cod under the sauce at 375°F (190°C) for 12-15 minutes, until opaque and flaking at 145°F (63°C).',
          'Flake it into soft, pea-sized pieces, re-checking for stray bones as you go.',
          'Steam the green beans for 8-10 minutes, until soft, and cut them into pea-to-bite-sized pieces.',
          'Stir the finely chopped basil in off the heat and serve on the tray, staying close and supervised.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of fish and beans in a family-style tomato sauce.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium heat for 30-60 seconds and simmer the diced tomato over low heat for 10-12 minutes, until thick.',
          'Bake the cod at 375°F (190°C) for 12-15 minutes, until it flakes at 145°F (63°C), then check it for bones and break it into small bite-sized pieces.',
          'Steam the green beans for 8-10 minutes, until tender, and cut them into small bite-sized pieces.',
          'Chop the basil very finely, stir it in at the end so the flavour stays bright, and serve with no added salt, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Flaked salmon and soft broccoli over rice with a pinch of sesame onto the wet grains.
  {
    slug: 'salmon-broccoli-sesame-rice-bowl',
    title: 'Salmon, Broccoli & Sesame Rice Bowl',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 30,
    ingredients: [
      { foodSlug: 'salmon', quantityNote: '115g (4oz) salmon fillet' },
      { foodSlug: 'broccoli', quantityNote: '1 cup broccoli florets' },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice' },
      {
        foodSlug: 'sesame_seeds',
        quantityNote: 'a pinch of sesame seeds, sprinkled onto the wet rice',
      },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Soft, sticky rice pressed into a ball, a finger-length flake of salmon, and florets that mash easily between two fingers.',
        steps: [
          'Bake the salmon at 375°F (190°C) for 10-12 minutes, until it is opaque and flakes easily at 145°F (63°C), then check thoroughly with your fingers for bones and remove them all.',
          'Steam the broccoli florets for 8-10 minutes, keeping a bit of stem as a handle, until they mash easily between two fingers.',
          'Press the soft, sticky rice into a small ball or patty rather than serving loose grains.',
          'Flake the salmon into a soft finger-length piece and moisten it with a little olive oil so it is not dry.',
          'Sprinkle a pinch of sesame seeds over the wet rice so they cling rather than scatter, and serve, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Loose soft rice for pincer-grasp practice with pea-sized salmon flakes and small florets.',
        steps: [
          'Bake the salmon at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then re-check every flake for stray bones.',
          'Steam the broccoli for 8-10 minutes, until soft, and cut it into pea-to-bite-sized florets.',
          'Serve the soft rice loose for pincer-grasp practice.',
          'Flake the salmon into soft, pea-sized pieces over the top and sprinkle a pinch of sesame seeds onto the wet rice, and sit with baby throughout.',
        ],
      },
      '12': {
        textureNote:
          'Family-style bowl with small bite-sized salmon and tender broccoli over soft rice.',
        steps: [
          'Bake the salmon at 375°F (190°C) for 10-12 minutes, until it reads 145°F (63°C), then check for bones and flake it into small bite-sized pieces.',
          'Roast the broccoli at 400°F (200°C) for 15-18 minutes, until tender, and cut it into small bite-sized florets.',
          'Spoon it all over soft rice and finish with a pinch of sesame seeds on the wet grains.',
          'Serve with a fork, keeping the sesame a pinch rather than a spoonful, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A store-cupboard pasta — mashed sardines folded through a soft tomato sauce with basil.
  {
    slug: 'sardine-tomato-basil-pasta',
    title: 'Sardine, Tomato & Basil Pasta',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      {
        foodSlug: 'sardines',
        quantityNote: '1 can (about 90g) boneless sardines in water, drained and mashed',
      },
      { foodSlug: 'wheat_pasta', quantityNote: '60g small pasta shapes' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'basil', quantityNote: '2 leaves, chopped very finely' },
      { foodSlug: 'garlic', quantityNote: '1/2 small clove, finely minced and softened in the pan' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Very soft, large pasta shapes to hold whole, under a smooth tomato sauce with the sardines mashed through.',
        steps: [
          'Soften half a small clove of finely minced garlic in a little olive oil over medium heat for 30-60 seconds, until it smells sweet rather than raw.',
          'Add the skinned, diced tomatoes and simmer over low heat for 12-15 minutes, until they break down into a soft sauce.',
          'Cook the pasta for 10-12 minutes, well past al dente, until it is very soft, and keep larger shapes whole as a finger food.',
          'Drain the boneless sardines, check them by feel for any small soft bones, and mash them well.',
          'Fold the mashed sardines through the sauce off the heat, stir in the very finely chopped basil, and spoon it over the pasta, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Small soft pasta shapes for pincer-grasp self-feeding with a thick sardine-and-tomato sauce.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium heat for 30-60 seconds, then simmer the skinned, diced tomato over low heat for 12-15 minutes, until soft.',
          'Cook the small pasta shapes for 10-12 minutes, past al dente, until they squash easily.',
          'Mash or flake the drained, boneless sardines into soft, pea-sized pieces, double-checking for any small bones.',
          'Fold them through the sauce off the heat with the finely chopped basil, then toss it with the pasta, staying close and supervised.',
        ],
      },
      '12': {
        textureNote: 'Family-style pasta with the sardines flaked into small bite-sized pieces.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium heat for 30-60 seconds and simmer the diced tomato over low heat for 12-15 minutes, until thick.',
          'Cook the pasta for 10-12 minutes, until tender, and drain it.',
          'Flake the drained sardines into small bite-sized pieces, checking by feel for bones, and fold them through the sauce off the heat.',
          'Chop the basil finely, stir it in at the end, and serve with no added salt, with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A meat-free bolognese with the body of ground walnuts stirred in off the heat.
  {
    slug: 'walnut-lentil-bolognese',
    title: 'Walnut & Lentil Bolognese',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/2 cup cooked red or brown lentils' },
      { foodSlug: 'walnuts', quantityNote: '2 tablespoons walnuts, ground to a fine meal' },
      {
        foodSlug: 'tomato',
        quantityNote: '2 tomatoes, skinned and diced, or 200g passata with no added salt',
      },
      { foodSlug: 'oregano', quantityNote: 'a pinch of dried oregano, rubbed fine' },
      { foodSlug: 'wheat_pasta', quantityNote: '60g small pasta shapes' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A thick, smooth sauce spooned over very soft, large pasta shapes baby can hold whole.',
        steps: [
          'Simmer the cooked lentils with the skinned, diced tomatoes and a pinch of dried oregano rubbed fine between your fingers, over low heat for 20-25 minutes, until the lentils collapse and mash easily.',
          'Mash the sauce smooth, so nothing needs chewing.',
          'Grind the walnuts to a fine, flour-like meal — never a half or a piece — and stir it through the finished sauce off the heat, until nothing crunchy is left.',
          'Cook the pasta for 10-12 minutes, well past al dente, until very soft, and keep larger shapes whole as a finger food.',
          'Spoon the sauce over and serve, loosening it with a little olive oil if it is stiff, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Small soft pasta shapes for pincer-grasp self-feeding under a thick lentil sauce.',
        steps: [
          'Simmer the lentils and skinned, diced tomato with a pinch of finely rubbed oregano over low heat for 20-25 minutes, until the lentils are soft with a little texture left.',
          'Stir the finely ground walnut meal through off the heat, so nothing crunchy remains.',
          'Cook the small pasta shapes for 10-12 minutes, past al dente, until soft.',
          'Toss the pasta through the sauce and serve on the tray for self-feeding, with baby sitting upright and supervised.',
        ],
      },
      '12': {
        textureNote: 'Family-style bolognese with soft pasta, still completely salt-free.',
        steps: [
          'Simmer the lentils, diced tomato, and finely rubbed oregano over low heat for 20-25 minutes, until thick.',
          'Stir the finely ground walnut meal through off the heat — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Cook the pasta for 10-12 minutes, until tender, and toss it through the sauce.',
          'Serve with a fork and let baby practice twirling, with no added salt in the pan, and with baby sitting upright and supervised.',
        ],
      },
    },
  },

  // Soft tofu and broccoli on rice under a runny, salt-free peanut sauce whisked rather than
  // simmered.
  {
    slug: 'peanut-satay-tofu-bowl',
    title: 'Peanut Satay Tofu Bowl',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 30,
    ingredients: [
      { foodSlug: 'tofu', quantityNote: '200g (7oz) firm tofu, pressed and cubed' },
      {
        foodSlug: 'peanut_butter',
        quantityNote: '1 tablespoon smooth peanut butter, whisked with warm water until runny',
      },
      { foodSlug: 'broccoli', quantityNote: '1 cup broccoli florets' },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice' },
      { foodSlug: 'ginger', quantityNote: 'a small pinch, peeled and finely grated, cooked in' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'warm water to thin the peanut butter' },
    ],
    variants: {
      '6': {
        textureNote:
          'Finger-length strips of lightly pan-fried tofu, florets that mash easily between two fingers, and sticky rice pressed into a soft ball, all under a runny sauce.',
        steps: [
          'Press the firm tofu dry, cut it into finger-length strips, and pan-fry them in a little olive oil over medium heat for 2-3 minutes a side, until lightly golden and still soft inside.',
          'Soften a small pinch of finely grated ginger in the same pan over medium heat for 30-60 seconds, until it smells warm rather than raw.',
          'Steam the broccoli florets for 8-10 minutes, keeping a bit of stem as a handle, until they mash easily between two fingers.',
          'Whisk the peanut butter with warm water until it is completely runny — never thick or straight from the jar — and stir the cooked ginger through it off the heat.',
          'Press the soft, sticky rice into a small ball, arrange the tofu strips and florets alongside, and spoon the thin sauce over, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Pea-to-bite-sized cubes of tofu and small florets for pincer-grasp practice, with loose soft rice.',
        steps: [
          'Cut the pressed tofu into pea-to-bite-sized cubes and pan-fry them in a little olive oil over medium heat for 2-3 minutes a side, until lightly golden and easy for little fingers to grip.',
          'Soften the finely grated ginger in the pan over medium heat for 30-60 seconds, until fragrant.',
          'Steam the broccoli for 8-10 minutes, until soft, and cut it into pea-to-bite-sized florets.',
          'Whisk the peanut butter with warm water until it is runny, stir the ginger through, and spoon the sauce over the rice, tofu, and broccoli.',
          'Cool to just-warm, then serve the soft rice loose on the tray with the tofu and broccoli for pincer-grasp self-feeding, with baby sitting upright and supervised.',
        ],
      },
      '12': {
        textureNote:
          'Family-style bowl of soft rice with small bite-sized tofu and tender broccoli under a thin peanut sauce.',
        steps: [
          'Cut the tofu into small bite-sized cubes and pan-fry in a little olive oil over medium heat for 2-3 minutes a side, until soft inside and lightly crisp outside.',
          'Soften the grated ginger in the pan over medium heat for 30-60 seconds, until fragrant.',
          'Roast the broccoli at 400°F (200°C) for 15-18 minutes, until tender, and cut it into small bite-sized florets.',
          'Whisk the peanut butter with warm water until it is runny — still no thick spoonfuls or globs — and spoon it, with the tofu and broccoli, over a family-style bowl of soft rice, with a fork alongside and baby sitting upright and supervised.',
        ],
      },
    },
  },

  // A bright, mild soup — red lentils and carrot cooked down soft, lifted with orange off the heat
  // so the vitamin C survives.
  {
    slug: 'carrot-lentil-orange-soup',
    title: 'Carrot, Lentil & Orange Soup',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/2 cup red lentils' },
      { foodSlug: 'carrot', quantityNote: '2 carrots, peeled and diced' },
      {
        foodSlug: 'orange',
        quantityNote: 'the juice and finely grated zest of 1/2 orange, stirred in at the end',
      },
      {
        foodSlug: 'curry_powder',
        quantityNote: 'a pinch of mild, salt-free, chili-free curry powder, cooked in',
      },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water or no-salt-added stock' },
    ],
    variants: {
      '6': {
        textureNote:
          'A smooth, thick soup loose enough to drip slowly off a spoon, with the carrot cooked until it mashes easily between two fingers.',
        steps: [
          'Warm a pinch of mild, salt-free, chili-free curry powder in a little olive oil over medium heat for 30-60 seconds, until it smells fragrant.',
          'Add the peeled, diced carrot and the red lentils with water or a no-salt-added stock, then simmer covered over low heat for 20-25 minutes, until the lentils have collapsed and the carrot is fork-tender.',
          'Blend until completely smooth, so nothing needs chewing.',
          'Take the pan off the heat and stir in the juice and finely grated zest of half an orange, which keeps the vitamin C that helps the lentils along.',
          'Thin with a little more liquid to a drippy consistency, cool to a safe temperature, and serve on a pre-loaded spoon, with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote:
          'Thicker soup with pea-to-bite-sized pieces of carrot, plus membrane-free orange segments on the tray.',
        steps: [
          'Warm the mild curry powder in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Simmer the diced carrot and lentils in water or no-salt-added stock over low heat for 20-25 minutes, until the carrot is soft and the lentils have broken down.',
          'Mash rather than blending, leaving pea-to-bite-sized pieces of carrot with some texture.',
          'Stir the orange juice and finely grated zest in off the heat.',
          'Cool to a safe temperature and serve with a spoon, with a few small membrane-free orange segment pieces alongside for pincer-grasp practice, staying close and supervised.',
        ],
      },
      '12': {
        textureNote: 'Family-style soup with soft bite-sized carrot, finished with orange.',
        steps: [
          'Warm the mild curry powder in a little olive oil over medium heat for 30-60 seconds — a blend with no salt and no chili in it.',
          'Simmer the diced carrot and lentils over low heat for 20-25 minutes, until tender.',
          'Stir the juice and finely grated zest of half an orange in off the heat, so the flavour and the vitamin C both survive.',
          'Cool to a safe temperature and serve in a bowl with a spoon, with membrane-free orange segments cut into small bite-sized pieces on the side, and baby sitting upright and supervised.',
        ],
      },
    },
  },
]
