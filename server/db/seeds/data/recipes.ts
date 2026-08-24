import type { RecipeSeed } from './types'

// 15 starter recipes, each with 6/9/12-month variants. No added salt or sugar anywhere, and no
// honey at any age (baked or otherwise). foodSlug references resolve against foods.ts;
// extraIngredients cover pantry staples (oils, spices, chia, lemon) not tracked in the food
// catalog.
export const recipes: RecipeSeed[] = [
  {
    slug: 'beef-sweet-potato-strips',
    title: 'Beef & Sweet Potato Strips',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'beef', quantityNote: '115g (4oz) lean ground beef or a thin-cut steak' },
      { foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato, peeled' },
    ],
    extraIngredients: ['olive oil', 'pinch of cumin (optional)'],
    variants: {
      '6': {
        textureNote:
          'Finger-length, soft strips baby can hold in a fist with some poking out the top; beef cooked well-done and shredded fine, sweet potato steamed until it mashes easily between two fingers.',
        steps: [
          'Peel and cube the sweet potato, then steam or boil until a fork slides through with no resistance, about 15 minutes.',
          'Season the beef with a pinch of cumin if using (no added salt), then pan-fry or bake until well-done and cooked through.',
          'Once cool enough to handle, mince or finely shred the beef so no tough or stringy pieces remain, and mash the sweet potato with a drizzle of olive oil.',
          'Cut the sweet potato into finger-length wedges and serve alongside a small pile of minced beef moistened with a little olive oil or cooking liquid so it is not dry.',
          'Sit with baby throughout the meal and supervise closely.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft pieces baby can pick up with a pincer grasp; beef finely chopped or shredded, sweet potato in small cubes.',
        steps: [
          'Steam or roast the sweet potato until fork-tender, then cut into pea-sized cubes.',
          'Cook the beef through, then finely chop or shred into small, soft pieces, moistened with a little olive oil.',
          'Combine on a plate for baby to self-feed with fingers or a pre-loaded spoon.',
          'Offer water in an open cup alongside the meal.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces closer to family food, still soft and easy to chew with emerging molars.',
        steps: [
          'Dice the sweet potato into small bite-sized pieces and roast or steam until tender.',
          'Cook and dice the beef into small, tender bite-sized pieces (a slow-cooked cut works well for tenderness).',
          'Serve together, optionally with a soft grain on the side, no added salt.',
          'Let baby practice using a fork or spoon alongside fingers.',
        ],
      },
    },
  },
  {
    slug: 'salmon-oat-patties',
    title: 'Salmon Oat Patties',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'salmon', quantityNote: '115g (4oz) cooked, deboned salmon fillet' },
      { foodSlug: 'iron_fortified_oats', quantityNote: '1/4 cup rolled oats' },
      { foodSlug: 'egg', quantityNote: '1 egg, beaten' },
    ],
    extraIngredients: ['olive oil for the pan'],
    variants: {
      '6': {
        textureNote: 'Soft finger-shaped patties, about the length and thickness of an adult finger, easy to gum and mash against the roof of the mouth.',
        steps: [
          'Bake or poach the salmon until just cooked through, then check thoroughly with your fingers for any bones and remove them all.',
          'Flake the salmon finely into a bowl, add the oats and beaten egg, and mix until it holds together.',
          "Shape into finger-length oval patties and pan-fry in a little olive oil over medium heat, about 3 minutes per side, until firm and cooked through.",
          'Cool until just warm and check the texture mashes easily before serving whole or torn into strips.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft crumbled pieces of patty baby can pick up between finger and thumb.',
        steps: [
          'Prepare the patty mixture as for the 6-month version, double-checking the salmon is completely bone-free.',
          'Shape into smaller patties, or one larger patty to slice after cooking.',
          'Cook through in a little olive oil until firm, then cool and break into pea-sized, soft pieces.',
          'Serve on a plate for baby to self-feed.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized patty pieces or a mini whole patty baby can pick up and bite from.',
        steps: [
          'Make the mixture as above and shape into small mini patties suited to little hands.',
          'Cook through in a little olive oil until golden and firm.',
          'Cut into bite-sized pieces or serve whole for baby to bite pieces off with supervision.',
          'Pair with a vitamin-C side like steamed broccoli for extra iron absorption.',
        ],
      },
    },
  },
  {
    slug: 'lentil-veggie-fritters',
    title: 'Lentil Veggie Fritters',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/2 cup cooked red lentils' },
      { foodSlug: 'zucchini', quantityNote: '1/2 small zucchini, grated' },
      { foodSlug: 'carrot', quantityNote: '1 small carrot, grated' },
      { foodSlug: 'egg', quantityNote: '1 egg, beaten' },
    ],
    extraIngredients: ['olive oil for the pan', 'pinch of cumin or mild paprika (optional)'],
    variants: {
      '6': {
        textureNote: 'Soft, finger-length fritters that squish easily between two fingers.',
        steps: [
          'Cook the lentils until very soft, then drain well.',
          'Squeeze excess water from the grated zucchini and carrot using a clean towel.',
          'Mix the lentils, zucchini, carrot, and beaten egg together with a pinch of cumin if using.',
          'Spoon into finger-length oval shapes and pan-fry in olive oil over medium-low heat, about 3-4 minutes per side, until set and golden.',
          'Cool until warm and check a fritter mashes easily between your fingers before serving.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft crumbled pieces.',
        steps: [
          'Prepare the fritter mixture as above.',
          'Cook small spoonfuls in olive oil until firm and cooked through.',
          'Cool and break into pea-sized, soft pieces for pincer-grasp self-feeding.',
          'Serve with a spoon nearby for baby to practice self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized fritter pieces, family-style.',
        steps: [
          'Make the mixture as above, forming slightly larger patty shapes.',
          'Cook through until golden on both sides.',
          'Cut into bite-sized pieces and serve with a fork for baby to practice.',
          'Great alongside a vitamin-C side like tomato wedges (quartered lengthwise) for iron absorption.',
        ],
      },
    },
  },
  {
    slug: 'banana-pb-oat-pancakes',
    title: 'Banana Peanut Butter Oat Pancakes',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'banana', quantityNote: '1 ripe banana, mashed' },
      { foodSlug: 'iron_fortified_oats', quantityNote: '1/2 cup rolled oats, blended into flour' },
      { foodSlug: 'peanut_butter', quantityNote: '1 tablespoon smooth peanut butter' },
      { foodSlug: 'egg', quantityNote: '1 egg' },
    ],
    extraIngredients: ['pinch of cinnamon (optional)'],
    variants: {
      '6': {
        textureNote: 'Soft, thin mini pancakes cut into finger-length strips.',
        steps: [
          'Blend the oats into a coarse flour.',
          'In a bowl, thoroughly whisk the peanut butter with a tablespoon of warm water until smooth and runny — never serve peanut butter thick or straight from the jar.',
          'Mash the banana and mix with the egg, oat flour, thinned peanut butter, and cinnamon if using into a smooth batter.',
          'Cook small, thin pancakes in a lightly oiled non-stick pan, about 2 minutes per side, until fully set with no wet batter inside.',
          'Cool and cut into finger-length strips to serve.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft pieces of pancake.',
        steps: [
          'Make the batter as above and cook into small, thin pancakes.',
          'Cool and tear into small, pea-sized pieces.',
          'Serve on a plate for baby to self-feed with fingers.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pancake pieces or mini pancakes baby can hold.',
        steps: [
          'Make the batter as above, cooking into small silver-dollar-sized pancakes.',
          'Cut into quarters or bite-sized strips.',
          'Serve with mashed banana on the side, no syrup or added sugar.',
        ],
      },
    },
  },
  {
    slug: 'veggie-omelet-fingers',
    title: 'Veggie Omelet Fingers',
    minAgeMonths: 6,
    prepMinutes: 12,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 30,
    ingredients: [
      { foodSlug: 'egg', quantityNote: '2 eggs, beaten' },
      { foodSlug: 'bell_pepper', quantityNote: '1/4 bell pepper, finely diced' },
      { foodSlug: 'spinach', quantityNote: 'a small handful of spinach, finely chopped' },
    ],
    extraIngredients: ['olive oil for the pan'],
    variants: {
      '6': {
        textureNote: 'Soft omelet cut into finger-length strips.',
        steps: [
          'Finely dice the bell pepper and chop the spinach.',
          'Whisk the eggs and stir in the vegetables.',
          'Pour into a lightly oiled pan over low-medium heat and cook, covered, until fully set with no runny egg remaining, about 4-5 minutes.',
          'Cool and cut into finger-length strips baby can hold and gum.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft pieces of omelet.',
        steps: [
          'Cook the omelet as above until fully set.',
          'Cool and cut into small, pea-sized pieces.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized omelet pieces, family-style.',
        steps: [
          'Cook the omelet as above, or scramble it soft.',
          'Cut into bite-sized pieces.',
          'Serve alongside soft toast strips for a full meal.',
        ],
      },
    },
  },
  {
    slug: 'broccoli-cheese-egg-muffins',
    title: 'Broccoli Cheese Egg Muffins',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'egg', quantityNote: '4 eggs, beaten' },
      { foodSlug: 'broccoli', quantityNote: '1 cup broccoli florets, finely chopped and steamed' },
      { foodSlug: 'cheese', quantityNote: '1/4 cup mild cheese, finely grated' },
    ],
    variants: {
      '6': {
        textureNote: 'Soft mini muffin cut into quarters or finger-length strips.',
        steps: [
          'Steam the broccoli until very soft, then finely chop.',
          'Whisk the eggs and stir in the broccoli and grated cheese.',
          'Pour into a well-greased mini muffin tin and bake at 180C (350F) for about 12-15 minutes until fully set with no wobble in the centre.',
          'Cool completely, then cut each muffin into quarters or finger-length strips before serving.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft muffin pieces.',
        steps: [
          'Bake the muffins as above.',
          'Cool and break into pea-sized pieces.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized muffin pieces or a whole mini muffin to hold.',
        steps: [
          'Bake the muffins as above.',
          'Serve whole mini muffins or cut into halves for baby to hold and bite from with supervision.',
          'Pair with fruit on the side for a balanced meal.',
        ],
      },
    },
  },
  {
    slug: 'overnight-oats-chia-pear',
    title: 'Overnight Oats with Chia & Pear',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: true,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'iron_fortified_oats', quantityNote: '1/3 cup rolled oats' },
      { foodSlug: 'pear', quantityNote: '1/2 ripe pear, grated or finely diced' },
      { foodSlug: 'yogurt', quantityNote: '1/4 cup plain whole-milk yogurt' },
    ],
    extraIngredients: ['1 teaspoon chia seeds', 'breast milk, formula, or water to thin'],
    variants: {
      '6': {
        textureNote: 'Smooth, thinned porridge-like texture loose enough to drip slowly off a spoon.',
        steps: [
          'Combine the oats, chia seeds, yogurt, and enough breast milk, formula, or water to make a loose, smooth mixture.',
          'Stir in the grated pear.',
          'Cover and refrigerate overnight, or at least 2 hours, until the oats and chia have softened and thickened slightly.',
          'Stir in a little extra liquid before serving to loosen it to a smooth, drippy consistency for a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Thicker, lumpier porridge with soft, small pear pieces baby can self-feed with a spoon.',
        steps: [
          'Prepare as above but use less liquid for a thicker, spoonable texture.',
          'Leave the pear in small, soft, finely diced pieces rather than grating.',
          'Refrigerate overnight, then stir well before serving.',
          "Offer a pre-loaded spoon for baby to bring to their own mouth.",
        ],
      },
      '12': {
        textureNote: 'Thick, family-style overnight oats with diced pear pieces.',
        steps: [
          'Prepare as above with a thicker ratio of oats to liquid.',
          'Dice the pear into small bite-sized pieces and stir through.',
          'Refrigerate overnight and serve chilled or gently warmed, checking the temperature is not hot before serving.',
          'Let baby practice self-feeding with a spoon.',
        ],
      },
    },
  },
  {
    slug: 'chicken-apple-meatballs',
    title: 'Chicken Apple Meatballs',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chicken_thigh', quantityNote: '225g (8oz) ground chicken thigh' },
      { foodSlug: 'apple', quantityNote: '1/2 apple, peeled and finely grated' },
    ],
    extraIngredients: ['pinch of dried thyme or sage (optional)', 'olive oil for the pan'],
    variants: {
      '6': {
        textureNote: 'Soft finger-length meat logs or well-mashed meatballs.',
        steps: [
          'Peel, core, and finely grate the apple.',
          'Mix the ground chicken with the grated apple and herbs if using.',
          'Shape into finger-length logs rather than round balls — easier for baby to grip and lower choking risk.',
          'Bake at 190C (375F) for about 18-20 minutes until cooked through with no pink remaining, or pan-fry in olive oil until fully cooked.',
          'Cool, then flake or mash slightly to ensure the texture is soft enough to squish easily.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft meatball pieces.',
        steps: [
          'Prepare and cook the mixture as above, shaping into small meatballs.',
          'Cook through fully, then cool and cut or shred into pea-sized, soft pieces.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized meatballs baby can pick up and bite from.',
        steps: [
          'Shape into small bite-sized meatballs and cook through fully.',
          'Serve whole or halved alongside a soft grain and vegetable.',
          'Supervise closely while baby bites pieces off.',
        ],
      },
    },
  },
  {
    slug: 'hummus-avocado-toast-fingers',
    title: 'Hummus Avocado Toast Fingers',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'chickpeas', quantityNote: '1/2 cup cooked chickpeas' },
      { foodSlug: 'tahini', quantityNote: '1 tablespoon tahini' },
      { foodSlug: 'avocado', quantityNote: '1/4 ripe avocado' },
      { foodSlug: 'wheat_toast', quantityNote: '1 slice bread, toasted' },
    ],
    extraIngredients: ['squeeze of lemon juice', 'drizzle of olive oil'],
    variants: {
      '6': {
        textureNote: 'Thick hummus and mashed avocado spread thinly on soft toast fingers.',
        steps: [
          'Blend the chickpeas, tahini, a squeeze of lemon juice, and a drizzle of olive oil with a splash of water until smooth, thinning further with water if needed so it is not sticky or thick.',
          'Mash the avocado until smooth.',
          'Toast the bread lightly, then moisten it slightly with water or extra olive oil so it is not dry or hard.',
          'Spread a thin layer of hummus and avocado onto the toast, then cut into finger-length strips.',
          'Check the toast bends without snapping into hard shards before serving.',
        ],
      },
      '9': {
        textureNote: 'Chunkier mashed hummus and avocado on toast, cut into small pieces.',
        steps: [
          'Prepare the hummus with a slightly thicker, chunkier texture.',
          'Spread hummus and mashed avocado onto soft toast.',
          'Cut into small, pea-to-bite-sized squares for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style hummus and avocado toast cut into small bite-sized pieces.',
        steps: [
          'Spread hummus and mashed or sliced avocado onto toast.',
          'Cut into small bite-sized squares or triangles.',
          'Serve as finger food alongside a piece of fruit.',
        ],
      },
    },
  },
  {
    slug: 'tofu-nuggets',
    title: 'Tofu Nuggets',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: true,
    fridgeHoursOverride: 72,
    freezerDaysOverride: 90,
    ingredients: [
      { foodSlug: 'tofu', quantityNote: '200g (7oz) firm tofu, pressed' },
      { foodSlug: 'iron_fortified_oats', quantityNote: '1/4 cup oats, blended into fine crumbs' },
    ],
    extraIngredients: ['olive oil for the pan', 'pinch of garlic powder (optional)'],
    variants: {
      '6': {
        textureNote: 'Soft finger-length tofu strips with a lightly crisp oat coating.',
        steps: [
          'Press the tofu to remove excess water, then slice into finger-length strips.',
          'Blend the oats into fine crumbs and season lightly with garlic powder if using.',
          'Press each tofu strip into the oat crumbs to coat.',
          'Pan-fry in olive oil over medium heat for 2-3 minutes per side until lightly golden, keeping the inside soft.',
          'Cool slightly and check the strip squishes easily before serving.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft tofu nugget pieces.',
        steps: [
          'Cut the pressed tofu into smaller, pea-to-bite-sized cubes before coating in oat crumbs.',
          'Pan-fry as above until lightly golden and cooked through.',
          'Cool and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized tofu nuggets, family-style.',
        steps: [
          'Cut the tofu into small bite-sized cubes and coat in the oat crumbs.',
          'Pan-fry or bake until golden on the outside.',
          'Serve with a dipping side like plain yogurt.',
        ],
      },
    },
  },
  {
    slug: 'sardine-mash-on-toast',
    title: 'Sardine Mash on Toast',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'sardines', quantityNote: '1 can (about 90g) boneless sardines in water, drained' },
      { foodSlug: 'avocado', quantityNote: '1/4 ripe avocado' },
      { foodSlug: 'wheat_toast', quantityNote: '1 slice bread, toasted' },
    ],
    extraIngredients: ['squeeze of lemon juice'],
    variants: {
      '6': {
        textureNote: 'Soft mashed sardine and avocado spread thinly on soft toast fingers.',
        steps: [
          'Check the sardines carefully and remove any remaining small bones, then mash well with a fork.',
          'Mash the avocado with a squeeze of lemon juice and combine with the sardines.',
          'Toast the bread lightly, then moisten it slightly so it is not dry or hard.',
          'Spread a thin layer of the sardine-avocado mash onto the toast and cut into finger-length strips.',
        ],
      },
      '9': {
        textureNote: 'Chunkier mashed sardine and avocado on toast, cut into small pieces.',
        steps: [
          'Mash the sardines and avocado together, leaving a slightly chunkier texture.',
          'Spread onto soft toast.',
          'Cut into small squares for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style sardine and avocado toast cut into small bite-sized pieces.',
        steps: [
          'Combine mashed sardines and avocado with a squeeze of lemon juice.',
          'Spread onto toast and cut into small bite-sized pieces or triangles.',
          'Serve alongside vegetable sticks.',
        ],
      },
    },
  },
  {
    slug: 'chickpea-sweet-potato-mild-curry',
    title: 'Chickpea Sweet Potato Mild Curry',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chickpeas', quantityNote: '1 cup cooked chickpeas' },
      { foodSlug: 'sweet_potato', quantityNote: '1 medium sweet potato, peeled and cubed' },
      { foodSlug: 'tomato', quantityNote: '1 tomato, diced' },
    ],
    extraIngredients: [
      'unsweetened coconut milk',
      'mild curry spices such as cumin, turmeric, and coriander (no added salt)',
      'olive oil',
    ],
    variants: {
      '6': {
        textureNote: 'Soft, well-mashed curry with a thick, scoopable texture; sweet potato mashes easily against the roof of the mouth.',
        steps: [
          'Sauté the mild spices briefly in olive oil, then add the sweet potato, chickpeas, tomato, and coconut milk.',
          'Simmer covered until the sweet potato is completely soft and falls apart easily, about 15-20 minutes.',
          'Mash roughly with a fork so the mixture is soft and scoopable but not fully smooth.',
          'Cool to a safe temperature and serve loaded onto a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Soft curry with small chunks baby can pick up or scoop with a spoon.',
        steps: [
          'Prepare the curry as above, mashing only lightly so small, soft chunks remain.',
          'Cool to a safe temperature.',
          'Serve with a spoon for self-feeding, offering some pieces for fingers too.',
        ],
      },
      '12': {
        textureNote: 'Family-style mild curry with soft bite-sized chunks.',
        steps: [
          'Prepare the curry as above without mashing, keeping the sweet potato and chickpeas in soft bite-sized pieces.',
          'Serve with soft rice on the side.',
          'Let baby practice self-feeding with a spoon and fingers.',
        ],
      },
    },
  },
  {
    slug: 'zucchini-quinoa-bites',
    title: 'Zucchini Quinoa Bites',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'quinoa', quantityNote: '1/2 cup cooked quinoa' },
      { foodSlug: 'zucchini', quantityNote: '1 small zucchini, grated' },
      { foodSlug: 'egg', quantityNote: '1 egg, beaten' },
      { foodSlug: 'cheese', quantityNote: '2 tablespoons mild cheese, finely grated' },
    ],
    extraIngredients: ['olive oil for the pan'],
    variants: {
      '6': {
        textureNote: 'Soft finger-length bites, easy to squish between gums.',
        steps: [
          'Squeeze excess water from the grated zucchini using a clean towel.',
          'Mix the cooked quinoa, zucchini, beaten egg, and cheese together.',
          'Spoon into finger-length shapes and pan-fry in olive oil over medium-low heat, about 3 minutes per side, until set and lightly golden.',
          'Cool until warm and check the bite mashes easily before serving.',
        ],
      },
      '9': {
        textureNote: 'Pea-sized, soft crumbled pieces.',
        steps: [
          'Prepare the mixture as above.',
          'Cook small spoonfuls until firm and cooked through.',
          'Cool and break into pea-sized pieces for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces, family-style.',
        steps: [
          'Shape the mixture into small patties and cook through.',
          'Cut into bite-sized pieces.',
          'Serve with a vitamin-C side like orange segments (membrane removed) for iron absorption.',
        ],
      },
    },
  },
  {
    slug: 'apple-cinnamon-tahini-porridge',
    title: 'Apple Cinnamon Tahini Porridge',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: true,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'iron_fortified_oats', quantityNote: '1/3 cup rolled oats' },
      { foodSlug: 'apple', quantityNote: '1/2 apple, peeled, cored, and finely diced' },
      { foodSlug: 'tahini', quantityNote: '1 teaspoon tahini' },
    ],
    extraIngredients: ['pinch of cinnamon', 'breast milk, formula, or water to thin'],
    variants: {
      '6': {
        textureNote: 'Smooth, thinned porridge loose enough to drip slowly off a spoon.',
        steps: [
          'Simmer the diced apple in a little water until completely soft and squishable, about 5-7 minutes.',
          'Cook the oats with breast milk, formula, or water until soft, then blend or mash until mostly smooth.',
          'Stir in the softened apple, a thin swirl of tahini fully mixed through (never a thick glob), and a pinch of cinnamon.',
          'Thin with extra liquid to a smooth, drippy consistency and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Thicker, spoonable porridge with small soft apple pieces.',
        steps: [
          'Cook the oats to a thicker consistency than the 6-month version.',
          'Stir in the softened diced apple, tahini mixed in thoroughly, and cinnamon.',
          'Serve with a pre-loaded spoon for self-feeding, checking apple pieces are soft.',
        ],
      },
      '12': {
        textureNote: 'Thick, family-style porridge with soft diced apple.',
        steps: [
          'Cook the oats to a thick, family-style porridge consistency.',
          'Stir in the softened apple and tahini, mixed evenly through so no thick pockets remain.',
          'Sprinkle with a pinch of cinnamon and serve with a spoon.',
        ],
      },
    },
  },
  {
    slug: 'greek-yogurt-with-smashed-berries',
    title: 'Greek Yogurt with Smashed Berries',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'yogurt', quantityNote: '1/2 cup plain whole-milk Greek yogurt' },
      { foodSlug: 'blueberry', quantityNote: '1/4 cup blueberries' },
      { foodSlug: 'strawberry', quantityNote: '2 strawberries' },
    ],
    variants: {
      '6': {
        textureNote: 'Smooth yogurt with thoroughly smashed berries stirred through — no whole or halved berries.',
        steps: [
          'Wash the blueberries and strawberries.',
          'Smash the blueberries completely flat with a fork so no whole or half berries remain.',
          'Hull and finely mash the strawberries.',
          'Stir the smashed berries through the plain whole-milk yogurt and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Yogurt with small smashed or quartered berry pieces baby can pick up or scoop.',
        steps: [
          'Smash the blueberries or quarter them lengthwise so no round, whole shape remains.',
          'Hull and quarter or finely dice the strawberries.',
          'Stir some berries through the yogurt and leave a few small pieces on top for baby to pick up with fingers.',
        ],
      },
      '12': {
        textureNote: 'Yogurt with quartered berries, family-style.',
        steps: [
          "Quarter the blueberries and strawberries lengthwise so they can't form a round, airway-blocking shape.",
          'Stir through or serve on top of the yogurt.',
          'Offer a spoon for baby to practice self-feeding.',
        ],
      },
    },
  },
]
