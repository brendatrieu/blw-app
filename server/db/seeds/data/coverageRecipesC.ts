import type { RecipeSeed } from './types'

// Batch C (ledger item 343): the four curated recipes that bring the two plain tree nuts
// added by item 342 — `almonds` and `cashews` — to the coverage rule's three recipes each,
// counting their own `Simple <nut>` basic as one. Two per nut, which is the floor: no real
// dish grinds two different tree nuts into the same bowl, and the tree-nut ladder wants one
// nut per sitting so a reaction is attributable. Design and coverage proof:
// .workflow/scratch/recipe-coverage/design-nuts.md
//
// Same rules as batches A and B (.workflow/scratch/recipe-coverage/design.md §1): no honey,
// no added salt, no added sugar; every cooking step carries a verb, a temperature (ovens in
// °F with °C in parentheses, stovetop as "over medium heat"), a time range, and the doneness
// cue that settles it. Nuts are the special case: they are NEVER cooked, never whole and
// never in pieces — always ground to a fine, flour-like meal and stirred in cold or off the
// heat, which is also the only way the catalog's own prep text lets them be served.
//
// Item 357 appends two more, under the same rules: `potato` arrived with item 356 and its
// own `Simple potato` basic counts as one of its three, so two real dishes are the floor.
//
// Item 510 appends two more for `cauliflower` (item 508), the same way: its `Simple cauliflower`
// basic is the third. Every cooking time is copied from a basic — cauliflower's own steam and
// roast times, and simple-lentils' simmer — so nothing here is timed from scratch.
//
// Item 728 appends three for `onion`. Onion has no `Simple onion` basic (owner's call, see
// NO_BASIC_RECIPE_FOODS in basic-recipes.test.ts), so all three of its recipes are real
// dishes. Times are copied from simple-lentils, simple-sweet-potato,
// beef-potato-carrot-cottage-mash and turkey-sweet-potato-pepper-hash, and the onion roast
// (400°F for 30-40 minutes) is Purdue Extension's. Draft and sources:
// .workflow/scratch/onion/DRAFT-v2.md
//
// Item 835 appends ten, two for each fall/winter food (Brussels sprouts, pumpkin, kale, beets,
// cranberries); each food's own `Simple <food>` basic is its third. Drafts, USDA levels and
// sources: .workflow/scratch/catalog-835/FOOD-*.md
//
// Item 841 appends ten, two for each bean (kidney, pinto, white, butter, edamame), the same way.
// Drafts, USDA levels and sources: .workflow/scratch/catalog-beans/FOOD-*.md
export const coverageRecipesC: RecipeSeed[] = [
  {
    slug: 'butternut-squash-almond-soup',
    title: 'Butternut Squash & Almond Soup',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: false,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'butternut_squash', quantityNote: '1/2 small butternut squash, peeled, deseeded, and cut into chunks' },
      { foodSlug: 'almonds', quantityNote: '2 tablespoons shelled almonds, ground to a fine meal' },
      { foodSlug: 'garlic', quantityNote: '1 clove, roasted soft in its skin' },
      { foodSlug: 'cumin', quantityNote: 'a pinch of ground cumin, cooked in' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water or no-salt-added stock' },
    ],
    variants: {
      '6': {
        textureNote:
          'A smooth, thick soup that drips slowly off a spoon, with a finger-length wedge of soft squash alongside to hold.',
        steps: [
          'Peel and deseed the squash, cut it into chunks, toss them with a drizzle of olive oil and a pinch of ground cumin, and roast at 400°F (200°C) for 25-30 minutes, until a chunk mashes easily between two fingers.',
          'Roast the garlic clove alongside in its skin at 400°F (200°C) for the last 15-20 minutes, until it is completely soft, then squeeze it out of the skin — garlic is never served raw.',
          'Set two soft chunks aside as finger-length wedges, then blend the rest with the garlic and a little water or no-salt-added stock until completely smooth, so nothing needs chewing.',
          'Off the heat, stir the finely ground almond meal through until the soup is smooth and slightly thickened — ground meal only, never a piece, a half, or a whole nut.',
          'Thin to a consistency that drips slowly off a spoon, cool to a safe temperature, and serve on a pre-loaded spoon with the squash wedges alongside.',
        ],
      },
      '9': {
        textureNote:
          'Mashed rather than blended, with small bite-sized pieces of soft squash (no bigger than ½ inch) on the tray for pincer-grasp practice.',
        steps: [
          'Toss the squash chunks with a little olive oil and a pinch of ground cumin, and roast them with the garlic clove in its skin at 400°F (200°C) for 25-30 minutes, until the squash is fork-tender and the garlic is soft.',
          'Squeeze the garlic out of its skin, mash the squash rather than blending it so some texture is left, and loosen it with a little water or no-salt-added stock.',
          'Stir the finely ground almond meal through off the heat, until nothing hard is left in the bowl.',
          'Cool to a safe temperature and serve thick in a bowl with a spoon, with a few small bite-sized pieces of soft squash (no bigger than ½ inch) on the tray.',
        ],
      },
      '12': {
        textureNote: 'A smooth family-style soup thickened with ground almond, and completely salt-free.',
        steps: [
          'Toss the squash chunks with olive oil and a pinch of ground cumin and roast them with the garlic clove at 400°F (200°C) for 25-30 minutes, until tender.',
          'Squeeze the garlic from its skin, then blend everything with water or no-salt-added stock to a smooth soup.',
          'Stir the finely ground almond meal through off the heat — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Cool to a safe temperature and serve family-style in a bowl with a spoon, with no added salt in the pan.',
        ],
      },
    },
  },
  {
    slug: 'banana-almond-rice-pudding',
    title: 'Creamy Banana & Almond Rice Pudding',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: false,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'rice', quantityNote: '1/3 cup short-grain white rice' },
      { foodSlug: 'banana', quantityNote: '1 small ripe banana, mashed smooth' },
      { foodSlug: 'almonds', quantityNote: '1 tablespoon shelled almonds, ground to a fine meal' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch of ground cinnamon, stirred in as it cooks' },
    ],
    extraIngredients: [{ name: 'water, breast milk, formula, or whole milk (once baby has had yogurt or cheese)' }],
    variants: {
      '6': {
        textureNote:
          'A loose, creamy pudding that drips slowly off a spoon, with a finger-length strip of ripe banana to hold.',
        steps: [
          'Simmer the rice with plenty of water, breast milk, formula, or whole milk and a pinch of ground cinnamon over low heat for 20-25 minutes, stirring often, until the grains have collapsed into a thick, creamy pudding.',
          'Take the pan off the heat and let the pudding cool until it is only just warm.',
          'Mash the ripe banana completely smooth and stir it through, leaving no lump that needs chewing.',
          'Stir the finely ground almond meal through off the heat, until the pudding is smooth and nothing hard is left — never a piece, a half, or a whole nut.',
          'Serve on a pre-loaded spoon, loose enough to drip slowly, with a finger-length strip of ripe banana alongside.',
        ],
      },
      '9': {
        textureNote: 'Thick, creamy pudding with small bite-sized pieces of soft banana (no bigger than ½ inch) on the tray.',
        steps: [
          'Simmer the rice with water, breast milk, formula, or whole milk and a pinch of ground cinnamon over low heat for 20-25 minutes, until the grains are soft and creamy.',
          'Cool the pudding to just warm, then mash half the banana through it and dice the rest into small bite-sized pieces (no bigger than ½ inch).',
          'Stir the finely ground almond meal through off the heat, so nothing hard is left.',
          'Serve thick in a bowl with the banana pieces on the tray for pincer-grasp practice.',
        ],
      },
      '12': {
        textureNote: 'A family-style rice pudding, unsweetened apart from the ripe banana.',
        steps: [
          'Simmer the rice with water, breast milk, formula, or whole milk and a pinch of ground cinnamon over low heat for 20-25 minutes, until thick and creamy.',
          'Cool to just warm, mash the banana through it, and stir the finely ground almond meal in off the heat — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Serve family-style in a bowl with a spoon, with no added sugar: the ripe banana is all the sweetness it needs.',
          'Pair with a vitamin-C side like orange segments with the membrane removed, or a few smashed strawberries.',
        ],
      },
    },
  },
  {
    slug: 'spinach-cashew-dal',
    title: 'Mild Spinach & Cashew Dal',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/2 cup red lentils, rinsed' },
      { foodSlug: 'spinach', quantityNote: '2 large handfuls of spinach, finely chopped' },
      { foodSlug: 'cashews', quantityNote: '2 tablespoons plain, unsalted cashews, ground to a fine meal' },
      { foodSlug: 'turmeric', quantityNote: 'a pinch of ground turmeric, cooked in' },
      { foodSlug: 'garlic', quantityNote: '1 clove, minced and cooked in' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water or no-salt-added stock' },
    ],
    variants: {
      '6': {
        textureNote:
          'A smooth, creamy dal loose enough to drip slowly off a spoon, with the lentils cooked until they mash easily.',
        steps: [
          'Soften the minced garlic with a pinch of ground turmeric in a little olive oil over medium-low heat for 2-3 minutes, until fragrant — garlic is always cooked, never raw.',
          'Add the rinsed lentils with water or a no-salt-added stock, then simmer covered over low heat for 20-25 minutes, until the lentils have collapsed and mash easily.',
          'Stir the finely chopped spinach in and simmer over low heat for 2-3 minutes more, until it has wilted right down into the dal.',
          'Take the pan off the heat, then stir the finely ground cashew meal through until the dal is smooth and creamy — ground meal only, never a piece, a half, or a whole nut.',
          'Blend or mash smooth, cool to a safe temperature, and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Thicker dal with a little texture left in the lentils, for spoon practice.',
        steps: [
          'Soften the minced garlic and a pinch of ground turmeric in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Simmer the rinsed lentils in water or no-salt-added stock over low heat for 20-25 minutes, until soft with a little texture left.',
          'Stir in the finely chopped spinach and simmer over low heat for 2-3 minutes, until wilted.',
          'Stir the finely ground cashew meal through off the heat, so nothing hard is left.',
          'Cool to a safe temperature and serve thick in a bowl for spoon practice, with soft bread fingers on the tray to dip.',
        ],
      },
      '12': {
        textureNote: 'Family-style dal, thick and creamy, with no added salt.',
        steps: [
          'Soften the minced garlic with a pinch of ground turmeric in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Simmer the lentils in water or no-salt-added stock over low heat for 20-25 minutes, until thick, stirring the finely chopped spinach in for the last 2-3 minutes, until wilted.',
          'Stir the finely ground cashew meal through off the heat — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Cool to a safe temperature and serve family-style with soft rice, with no added salt in the pan.',
        ],
      },
    },
  },
  {
    slug: 'broccoli-cashew-cream-pasta',
    title: 'Creamy Cashew & Broccoli Pasta',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'wheat_pasta', quantityNote: '60g small pasta shapes' },
      { foodSlug: 'broccoli', quantityNote: '1 cup small broccoli florets' },
      { foodSlug: 'cashews', quantityNote: '3 tablespoons plain, unsalted cashews, ground to a fine meal' },
      { foodSlug: 'garlic', quantityNote: '1 clove, minced and cooked in' },
      { foodSlug: 'black_pepper', quantityNote: 'a tiny pinch, finely ground' },
      { foodSlug: 'lemon', quantityNote: 'a squeeze of juice' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'warm water, to soak and blend the ground cashew meal' },
    ],
    variants: {
      '6': {
        textureNote:
          'Large, very soft pasta shapes baby can hold whole, coated in a smooth cashew cream, with a soft broccoli floret as a finger food.',
        steps: [
          'Grind the cashews to a fine, flour-like meal, cover it with warm water, and leave it to soak for 10 minutes — never a piece, a half, or a whole nut.',
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant and golden — garlic is always cooked, never raw.',
          'Blend the soaked meal with the garlic, a squeeze of lemon juice, and a tiny pinch of finely ground black pepper into a completely smooth, pourable cream with no grit or fleck left in it.',
          'Steam the broccoli florets for 8-10 minutes, until the stems mash easily between two fingers, then mash most of it and keep two florets whole as finger food.',
          'Cook the pasta for 10-12 minutes, well past al dente, until very soft, keeping larger shapes whole for baby to hold.',
          'Stir the cream through the warm pasta and mashed broccoli off the heat, then let it cool and test a piece on your wrist before serving with a whole floret alongside.',
        ],
      },
      '9': {
        textureNote:
          'Small soft pasta shapes and small bite-sized broccoli pieces (no bigger than ½ inch) in a smooth cream, for pincer-grasp self-feeding.',
        steps: [
          'Grind the cashews to a fine meal, cover it with warm water, and leave it to soak for 10 minutes.',
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Blend the soaked meal with the garlic, a squeeze of lemon juice, and a tiny pinch of finely ground black pepper to a completely smooth, pourable cream.',
          'Steam the broccoli for 8-10 minutes, until soft, and chop it into small bite-sized pieces (no bigger than ½ inch); cook the small pasta shapes for 10-12 minutes, past al dente, until soft.',
          'Toss the pasta and broccoli through the cream off the heat, let it cool to warm rather than hot, and serve on the tray for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style pasta in a smooth cashew cream, still completely salt-free.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant — garlic is always cooked, never raw.',
          'Grind the cashews to a fine meal, soak it in warm water for 10 minutes, then blend it with the garlic, a squeeze of lemon juice, and a pinch of finely ground black pepper to a smooth, pourable cream — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Steam the broccoli for 8-10 minutes, until tender, and cook the pasta for 10-12 minutes, until soft.',
          'Toss everything through the cream off the heat, give it a few minutes to cool, and serve family-style, with no added salt in the pan.',
        ],
      },
    },
  },
  {
    slug: 'potato-pea-dill-mash',
    title: 'Potato & Pea Mash with Dill',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'potato', quantityNote: '1 medium Yukon Gold potato, green patches and sprouts trimmed away' },
      { foodSlug: 'peas', quantityNote: '1/2 cup frozen or fresh peas' },
      { foodSlug: 'dill', quantityNote: 'a few soft fronds, snipped very finely and stirred in at the end' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'breast milk, formula, whole milk (once baby has had yogurt or cheese), or water, to loosen' },
    ],
    variants: {
      '6': {
        textureNote:
          'A soft, loose mash that drips slowly off a spoon, with a thick finger-length wedge of potato to hold.',
        steps: [
          'Scrub, peel, and chunk the potato, cutting away any green patches or sprouts.',
          'Steam or boil the chunks for 12-15 minutes, until a chunk mashes easily between two fingers, cooking the peas with them for the last 3-4 minutes, until the peas squash flat between finger and thumb.',
          'Set one soft chunk aside as a thick finger-length wedge for baby to hold.',
          'Mash the rest with a drizzle of olive oil, squashing every pea flat — whole round peas are a choking hazard.',
          'Stir the finely snipped dill through off the heat, then loosen the mash with a little breast milk, formula, whole milk, or water until it is soft and spoonable rather than stiff or gluey.',
          'Cool to just-warm and serve on a pre-loaded spoon with the potato wedge alongside, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'A rougher mash, with small bite-sized soft pieces of potato (no bigger than ½ inch) on the tray for pincer practice.',
        steps: [
          'Scrub and chunk the potato, cutting away any green patches or sprouts — the skin can stay on once baby handles it well.',
          'Steam or boil the chunks for 12-15 minutes, until they mash easily between two fingers, cooking the peas with them for the last 3-4 minutes, until soft.',
          'Mash most of it roughly with a drizzle of olive oil, squashing every pea flat, and cut a little of the potato into small bite-sized soft pieces (no bigger than ½ inch) for the tray.',
          'Stir the finely snipped dill through off the heat, then loosen the mash with a little breast milk, formula, whole milk, or water until it is soft and spoonable rather than stiff or gluey, and serve just warm, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'A family-style loose mash with small bite-sized pieces of potato through it, still completely salt-free.',
        steps: [
          'Scrub and chunk the potato, cutting away any green patches or sprouts, then steam or boil it for 12-15 minutes, until it mashes easily between two fingers.',
          'Cook the peas with it for the last 3-4 minutes, until soft, then drain everything.',
          'Mash it loosely with a drizzle of olive oil — broken up just enough to eat, never beaten until it turns gluey — squashing the peas flat, since a whole pea stays the riskier option.',
          'Stir the finely snipped dill through off the heat, loosen the mash with a little breast milk, formula, whole milk, or water until it is soft rather than stiff or gluey, cool to just-warm, and serve family-style in small bite-sized spoonfuls, with no added salt in the pan.',
        ],
      },
    },
  },
  {
    slug: 'beef-potato-carrot-cottage-mash',
    title: 'Beef, Potato & Carrot Cottage Mash',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'beef', quantityNote: '1/2 cup lean ground beef' },
      { foodSlug: 'potato', quantityNote: '1 medium Yukon Gold potato, peeled, green patches and sprouts trimmed away' },
      { foodSlug: 'carrot', quantityNote: '1 small carrot, peeled and chunked' },
      { foodSlug: 'tomato', quantityNote: '1 small tomato, skinned, deseeded, and chopped' },
      { foodSlug: 'garlic', quantityNote: 'half a small clove, minced and cooked in' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water or no-salt-added stock' },
    ],
    variants: {
      '6': {
        textureNote:
          'A soft, loose mash of potato and carrot with ground beef, broken up very fine, stirred through, moist enough to need no chewing.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant — garlic is always cooked, never raw.',
          'Brown the ground beef with it over medium heat for 5-7 minutes, breaking it up very small, until no pink is left and it reads 160°F (71°C) on a thermometer.',
          'Add the skinned, deseeded tomato and a splash of water or no-salt-added stock, then simmer over low heat for 12-15 minutes, until the beef is very tender and the sauce has thickened.',
          'Steam or boil the potato and carrot for 12-15 minutes, until both mash easily between two fingers — carrot is never served raw or firm.',
          'Mash the potato and carrot together with a drizzle of olive oil, loose rather than stiff, and stir the beef sauce through it.',
          'Cool to just-warm and serve on a pre-loaded spoon, moist enough that nothing needs chewing, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'A rougher mash with soft, small bite-sized pieces of beef and potato (no bigger than ½ inch) on the tray.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Brown the ground beef with it over medium heat for 5-7 minutes, until no pink is left and it reads 160°F (71°C) on a thermometer.',
          'Add the skinned, deseeded tomato and a little water or no-salt-added stock, then simmer over low heat for 12-15 minutes, until the beef is soft and shreds easily into small bite-sized pieces (no bigger than ½ inch).',
          'Steam or boil the potato and carrot for 12-15 minutes, until they mash easily between two fingers, then mash most of it roughly and keep a few small bite-sized soft pieces (no bigger than ½ inch) for the tray.',
          'Spoon the beef over the mash, cool to just-warm, and serve with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style cottage mash, in small bite-sized pieces of soft beef, potato and carrot.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Brown the ground beef over medium heat for 5-7 minutes, until it reads 160°F (71°C) on a thermometer, then add the skinned, deseeded tomato and a little no-salt-added stock.',
          'Simmer over low heat for 15-20 minutes, until thick and tender, while you steam or boil the potato and carrot for 12-15 minutes, until fork-tender.',
          'Mash the potato and carrot loosely with a drizzle of olive oil — never beaten until it turns gluey — spoon the beef over the top, cool to just-warm, and serve family-style in small bite-sized pieces, with no added salt in the pan.',
        ],
      },
    },
  },
  {
    slug: 'red-lentil-cauliflower-mash',
    title: 'Red Lentil & Cauliflower Mash',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/4 cup dried red lentils (about 1/2 cup cooked)' },
      { foodSlug: 'cauliflower', quantityNote: '3-4 cauliflower florets' },
    ],
    extraIngredients: [{ name: 'water, for cooking and thinning' }],
    variants: {
      '6': {
        textureNote:
          'A soft, scoopable mash of red lentils and cauliflower, with one whole steamed floret to hold.',
        steps: [
          'Rinse the lentils, then simmer them in plenty of unsalted water over low heat for 15-20 minutes, until they collapse and mash easily against the side of the pan.',
          'Meanwhile, wash the cauliflower, cut it into florets, and steam them over boiling water for 8-10 minutes, until a floret mashes easily between two fingers — raw or under-cooked cauliflower is firm and hard to chew.',
          'Set one whole floret aside, with a bit of stem as a handle, for baby to hold.',
          'Drain the lentils and mash them with the rest of the cauliflower until smooth, thinning with a little of the cooking water until it is scoopable rather than stiff.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon with the floret alongside, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A rougher lentil and cauliflower mash, with small bite-sized soft pieces of cauliflower (no bigger than ½ inch) on the tray.',
        steps: [
          'Rinse the lentils and simmer them in unsalted water over low heat for 15-20 minutes, until they squash easily between two fingers, then drain them well.',
          'Wash the cauliflower, cut it into florets, and steam them over boiling water for 8-10 minutes, until they mash easily between two fingers.',
          'Mash the lentils with most of the cauliflower, leaving some texture, and cut the rest into small bite-sized pieces (no bigger than ½ inch) for pincer practice.',
          'Cool to just-warm and serve the mash with a spoon for baby to practice with and the soft pieces on the tray, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Soft red lentils stirred through small bite-sized cauliflower florets, family-style.',
        steps: [
          'Rinse the lentils and simmer them in unsalted water over low heat for 15-20 minutes, until soft, then drain them.',
          'Wash the cauliflower, cut it into florets, and steam them for 8-10 minutes, until fork-tender.',
          'Cut the cauliflower into small bite-sized florets and stir them through the lentils, or pre-load a fork with a soft piece for baby to practice with.',
          'Cool to just-warm and serve in small spoonfuls, with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'cauliflower-cheese-mash',
    title: 'Cauliflower Cheese Mash',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'cauliflower', quantityNote: '4-5 cauliflower florets' },
      { foodSlug: 'cheese', quantityNote: '1 tablespoon finely grated mild, pasteurized cheese, such as mild cheddar' },
    ],
    extraIngredients: [{ name: 'breast milk, formula, whole milk, or water, to loosen' }],
    variants: {
      '6': {
        textureNote:
          'A smooth, loose cauliflower mash with finely grated cheese stirred through, plus one whole soft floret to hold.',
        steps: [
          'Wash the cauliflower, cut it into florets, and steam them over boiling water for 8-10 minutes, until a floret mashes easily between two fingers — raw or under-cooked cauliflower is firm and hard to chew.',
          'Set one whole floret aside, with a bit of stem as a handle, for baby to hold.',
          'Mash the rest until smooth and stir the finely grated cheese through it off the heat, so the cheese melts in rather than sitting in firm shreds.',
          'Loosen the mash with a little breast milk, formula, whole milk, or water until it is soft and spoonable.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon with the floret alongside, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A rougher cheesy mash, with small bite-sized soft pieces of cauliflower (no bigger than ½ inch) on the tray.',
        steps: [
          'Wash the cauliflower, cut it into florets, and steam them over boiling water for 8-10 minutes, until they mash easily between two fingers.',
          'Mash most of it roughly and stir the finely grated cheese through off the heat, then cut the rest into small bite-sized pieces (no bigger than ½ inch) for pincer practice.',
          'Loosen the mash with a little breast milk, formula, whole milk, or water if it is stiff.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized florets tossed with grated cheese, or a looser family-style mash.',
        steps: [
          'Wash the cauliflower and cut it into florets, then steam them for 8-10 minutes, or roast them at 400°F (200°C) for 25-30 minutes, until fork-tender and just golden on top.',
          'Trim off any crispy or burnt edges from roasted florets, then cut them into small bite-sized florets and toss them with the finely grated cheese while hot, or mash them with the cheese, loosened with a little breast milk, formula, whole milk, or water.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'red-lentil-tomato-onion-dal',
    title: 'Red Lentil, Tomato & Onion Dal',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/4 cup dried red lentils (about 1/2 cup cooked)' },
      { foodSlug: 'onion', quantityNote: '1/4 small yellow or sweet onion, peeled, root end cut off, and very finely chopped' },
      { foodSlug: 'tomato', quantityNote: '1 small tomato, skinned, deseeded, and chopped' },
    ],
    extraIngredients: [{ name: 'water, for cooking and thinning' }],
    variants: {
      '6': {
        textureNote: 'A smooth, loose dal of red lentils, tomato, and onion, thin enough to drip slowly off a spoon.',
        steps: [
          'Rinse the lentils and put them in a pan with the very finely chopped onion, chopped tomato, and plenty of unsalted water.',
          'Simmer over low heat for 15-20 minutes, until the lentils collapse and the onion is completely soft and squashes easily between two fingers — onion is always cooked soft, never raw.',
          'Blend or mash until smooth, thinning with a little of the cooking water until it is loose and scoopable rather than stiff.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'A thicker dal with soft lentils and onion and a little texture left, for spoon practice.',
        steps: [
          'Rinse the lentils and put them in a pan with the very finely chopped onion, chopped tomato, and plenty of unsalted water.',
          'Simmer over low heat for 15-20 minutes, until the lentils squash easily between two fingers and the onion is completely soft — onion is always cooked soft, never raw.',
          'Mash lightly, leaving some texture, and loosen it with a little of the cooking water if it is stiff, thinning it until it is soft and scoopable.',
          'Cool to just-warm and serve thick in a bowl with a spoon for baby to practice with, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style dal, thick and soft, with no added salt.',
        steps: [
          'Rinse the lentils and put them in a pan with the finely chopped onion, chopped tomato, and plenty of unsalted water.',
          'Simmer over low heat for 15-20 minutes, until the lentils are soft and the onion is tender.',
          'Stir well, thinning it with a splash of the cooking water if it is too thick.',
          'Cool to just-warm and serve in small spoonfuls, or pre-load a spoon for baby to practice with, with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'roasted-sweet-potato-onion-wedges',
    title: 'Roasted Sweet Potato & Onion Wedges',
    minAgeMonths: 6,
    prepMinutes: 50,
    ironFocus: false,
    ingredients: [
      { foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato' },
      { foodSlug: 'onion', quantityNote: '1/2 small yellow or sweet onion' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote: 'Soft roasted sweet potato wedges and a large soft onion wedge, each squashing easily between two fingers.',
        steps: [
          'Peel the onion and slice off just the dry, hairy tip of the root, then halve the onion through the root end and cut each half into 3 thick wedges, so a little root end holds each wedge together.',
          'Peel the sweet potato and cut it into thick, finger-length wedges.',
          'Toss the onion wedges in a little olive oil and roast them at 400°F (200°C) for 10 minutes, then add the sweet potato wedges and roast everything for 25-30 minutes more, turning once, until every wedge squashes easily between two fingers — raw or under-cooked onion is firm and slippery.',
          'Cut the firm root end off each onion wedge, along with any crispy or dark edges; if the layers come apart, keep them as large soft slices.',
          'Cool to just-warm, check the temperature, and hand baby a sweet potato wedge and an onion wedge or slice to hold, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'Soft wedges, or small bite-sized pieces of sweet potato and onion (no bigger than ½ inch) for pincer practice.',
        steps: [
          'Peel the onion and slice off just the dry, hairy tip of the root, then halve the onion through the root end and cut each half into 3 thick wedges, so a little root end holds each wedge together.',
          'Peel the sweet potato and cut it into thick, finger-length wedges.',
          'Toss the onion wedges in a little olive oil and roast them at 400°F (200°C) for 10 minutes, then add the sweet potato wedges and roast for 25-30 minutes more, turning once, until every wedge squashes easily between two fingers.',
          'Cut the firm root end off each onion wedge, along with any crispy edges, then serve the wedges or cut some of the sweet potato and onion into small bite-sized pieces (no bigger than ½ inch) for pincer practice.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of roasted sweet potato and soft onion, family-style.',
        steps: [
          'Peel the onion and slice off just the dry, hairy tip of the root, then halve the onion through the root end and cut each half into 3 wedges, so a little root end holds each wedge together.',
          'Peel the sweet potato and dice it into small bite-sized pieces.',
          'Toss the onion wedges in a little olive oil and roast them at 400°F (200°C) for 10 minutes, then add the diced sweet potato and roast for 20-25 minutes more, until both are fork-tender.',
          'Cut the firm root end off each onion wedge, along with any crispy or burnt edges, then cut the onion into small bite-sized pieces and toss it with the sweet potato.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'beef-bell-pepper-onion-skillet',
    title: 'Beef, Bell Pepper & Onion Skillet',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'beef', quantityNote: '1/2 cup lean ground beef' },
      { foodSlug: 'bell_pepper', quantityNote: '1/2 red bell pepper' },
      { foodSlug: 'onion', quantityNote: '1/4 small yellow or sweet onion' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water' },
    ],
    variants: {
      '6': {
        textureNote: 'Soft, moist ground beef with bell pepper and onion, broken up very fine and mashed so nothing needs chewing.',
        steps: [
          'Peel the onion, cut off the root end, and chop the onion very finely; deseed the bell pepper, peel off its tough skin with a vegetable peeler, and chop it very finely too.',
          'Warm a little olive oil in a pan and cook the onion and bell pepper over medium heat for 8-10 minutes, stirring often, until both are completely soft — onion and bell pepper are always cooked soft, never raw.',
          'Add the ground beef and brown it over medium heat for 5-7 minutes, breaking it up very small, until no pink is left and it reads 160°F (71°C) on a thermometer.',
          'Add a splash of water, then simmer over low heat for 12-15 minutes, until the beef is very tender and the onion squashes easily between two fingers.',
          'Mash it well with a fork, adding a little more water if needed, so it is moist and soft rather than dry or stringy.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'Soft ground beef with small bite-sized pieces of bell pepper and onion (no bigger than ½ inch), to scoop or pick up.',
        steps: [
          'Peel the onion, cut off the root end, and chop the onion finely; deseed the bell pepper, peel off its tough skin with a vegetable peeler, and chop it into small bite-sized pieces (no bigger than ½ inch).',
          'Warm a little olive oil in a pan and cook the onion and bell pepper over medium heat for 8-10 minutes, stirring often, until both are completely soft.',
          'Add the ground beef and brown it over medium heat for 5-7 minutes, breaking it up small, until no pink is left and it reads 160°F (71°C) on a thermometer.',
          'Add a splash of water and simmer over low heat for 12-15 minutes, until the beef is tender and the bell pepper and onion squash easily between two fingers.',
          'Cool to just-warm and serve in a bowl to scoop by hand or with a pre-loaded spoon, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style ground beef, bell pepper, and onion in small, soft bite-sized pieces, with no added salt.',
        steps: [
          'Peel the onion, cut off the root end, and chop the onion finely; deseed the bell pepper, peel off any tough skin, and dice it into small bite-sized pieces.',
          'Warm a little olive oil in a pan and cook the onion and bell pepper over medium heat for 8-10 minutes, until soft.',
          'Add the ground beef and brown it over medium heat for 5-7 minutes, until it reads 160°F (71°C) on a thermometer.',
          'Add a splash of water and simmer over low heat for 12-15 minutes, until the beef is tender and the vegetables are soft.',
          'Cool to just-warm and serve with a spoon or fork to practice with, with no added salt.',
        ],
      },
    },
  },
  // ---- Item 835: Brussels sprouts (iron + vitamin C pairings) ----
  {
    slug: 'lentil-brussels-sprouts-apple-mash',
    title: 'Lentil, Brussels Sprouts & Apple Mash',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/4 cup dried red lentils (about 1/2 cup cooked)' },
      { foodSlug: 'brussels_sprouts', quantityNote: '4-5 Brussels sprouts' },
      { foodSlug: 'apple', quantityNote: '1/2 apple, peeled and cored' },
    ],
    extraIngredients: [{ name: 'water, for cooking and thinning' }],
    variants: {
      '6': {
        textureNote:
          'A soft, scoopable mash of red lentils, Brussels sprouts, and apple, with soft Brussels sprout quarters to hold.',
        steps: [
          'Rinse the lentils, then simmer them in plenty of unsalted water over low heat for 15-20 minutes, until they collapse and mash easily against the side of the pan.',
          'Meanwhile, wash the Brussels sprouts, trim the stem ends, pull off any loose outer leaves, and halve them; peel, core, and dice the apple.',
          'Steam the Brussels sprouts and apple over boiling water for 10-12 minutes, until a knife slides through the sprout cores and the apple mashes easily between two fingers — never serve raw apple under 12 months, or a firm sprout at any age.',
          'Set one Brussels sprout half aside and cut it lengthwise into two quarters for baby to hold.',
          'Drain the lentils and mash them with the rest of the Brussels sprouts and the apple until smooth, thinning with a little of the cooking water until it is scoopable rather than stiff.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon with the quarters alongside, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A rougher lentil and apple mash, with small bite-sized pieces of Brussels sprouts (no bigger than ½ inch) on the tray.',
        steps: [
          'Rinse the lentils and simmer them in unsalted water over low heat for 15-20 minutes, until they squash easily between two fingers, then drain them well.',
          'Wash the Brussels sprouts, trim the stem ends, pull off any loose outer leaves, and halve them; peel, core, and dice the apple.',
          'Steam the Brussels sprouts and apple over boiling water for 10-12 minutes, until a knife slides through the sprout cores and the apple mashes easily between two fingers.',
          'Mash the lentils roughly with the apple and a few of the Brussels sprouts, and cut the rest into small bite-sized pieces (no bigger than ½ inch) for pincer practice.',
          'Cool to just-warm and serve the mash with a spoon for baby to practice with and the soft pieces on the tray, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Soft red lentils with diced cooked apple and small bite-sized pieces of Brussels sprouts, family-style.',
        steps: [
          'Rinse the lentils and simmer them in unsalted water over low heat for 15-20 minutes, until soft, then drain them.',
          'Wash the Brussels sprouts, trim the stem ends, and halve them; peel, core, and dice the apple.',
          'Steam the Brussels sprouts and apple for 8-10 minutes, until the sprouts are tender through the core and the apple is soft.',
          'Cut the Brussels sprouts into small bite-sized pieces and stir them and the apple through the lentils, or pre-load a fork for baby to practice with.',
          'Cool to just-warm and serve in small spoonfuls, with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'chicken-thigh-brussels-sprouts-sweet-potato',
    title: 'Chicken Thigh with Brussels Sprouts & Sweet Potato',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chicken_thigh', quantityNote: '1 boneless, skinless chicken thigh (about 115g/4oz)' },
      { foodSlug: 'brussels_sprouts', quantityNote: '4-5 Brussels sprouts' },
      { foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato, peeled' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote:
          'A finger-length strip or a soft pile of finely shredded chicken thigh, a sweet potato wedge that mashes between two fingers, and very soft Brussels sprout quarters.',
        steps: [
          'Trim any fat or gristle from the chicken thigh, check it for small bones, rub it with a little olive oil, and bake it at 400°F (200°C) for 18-22 minutes, until it is cooked to an internal temperature of 165°F (74°C) in the thickest part.',
          'Meanwhile, peel the sweet potato and cut it into thick, finger-length wedges; wash the Brussels sprouts, trim the stem ends, pull off any loose outer leaves, and halve them.',
          'Steam the sweet potato and Brussels sprouts over boiling water for 12-15 minutes, until a wedge mashes easily between two fingers and a knife slides through the sprout cores with no resistance.',
          'Rest the chicken for 5 minutes, then cut a finger-length strip or shred it finely, moistened with the pan juices, and cut each Brussels sprout half lengthwise into two quarters.',
          'Cool everything to just-warm, check the temperature, and serve with no added salt — never a whole sprout.',
        ],
      },
      '9': {
        textureNote:
          'Finger-length strips, or small bite-sized pieces (no bigger than ½ inch) of chicken thigh, sweet potato, and Brussels sprouts for pincer practice.',
        steps: [
          'Trim the chicken thigh of fat and gristle, check it for small bones, rub it with a little olive oil, and bake it at 400°F (200°C) for 18-22 minutes, until it is cooked to an internal temperature of 165°F (74°C) in the thickest part.',
          'Meanwhile, peel the sweet potato and cut it into finger-length wedges; wash the Brussels sprouts, trim the stem ends, pull off any loose outer leaves, and halve them.',
          'Steam the sweet potato and Brussels sprouts over boiling water for 12-15 minutes, until both mash easily between two fingers.',
          'Rest the chicken for 5 minutes, then cut it into finger-length strips or small bite-sized pieces (no bigger than ½ inch), and cut the Brussels sprouts into quarters or small pieces too.',
          'Cool to just-warm and serve with no added salt, the chicken moistened with a little of the pan juices so it is not dry.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized pieces of roasted chicken thigh, sweet potato, and Brussels sprouts, served family-style.',
        steps: [
          'Peel the sweet potato and dice it into small bite-sized pieces; wash the Brussels sprouts, trim the stem ends, and halve them; toss both with a little olive oil.',
          'Spread them on a lined baking sheet with the trimmed chicken thigh and roast at 400°F (200°C) for 20-25 minutes, until the vegetables are tender all the way through, taking the chicken thigh out after 18-22 minutes, once it is cooked to an internal temperature of 165°F (74°C) in the thickest part.',
          'Rest the chicken for 5 minutes, then dice it into small, soft bite-sized pieces, checking for small bones.',
          'Pull any crispy or charred outer leaves off the Brussels sprouts, cut them into quarters or small bite-sized pieces, and cool everything to just-warm.',
          'Serve together with no added salt, letting baby practice with a fork.',
        ],
      },
    },
  },
  // ---- Item 835: pumpkin (iron + vitamin C pairings) ----
  {
    slug: 'pumpkin-strawberry-oatmeal',
    title: 'Pumpkin, Strawberry & Cinnamon Oatmeal',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: true,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'iron_fortified_oats', quantityNote: '3 tablespoons iron-fortified baby oat cereal' },
      { foodSlug: 'pumpkin', quantityNote: '2 tablespoons canned 100% pure pumpkin (never pie filling), or mashed cooked fresh pumpkin' },
      { foodSlug: 'strawberry', quantityNote: '2 strawberries' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch' },
    ],
    extraIngredients: [{ name: 'breast milk, formula, or water to thin' }],
    variants: {
      '6': {
        textureNote: 'Smooth, thinned pumpkin oatmeal loose enough to drip slowly off a spoon, with the strawberries mashed so no round berry shape is left.',
        steps: [
          'Stir the iron-fortified oat cereal into breast milk, formula, or water in a small pan and cook over low heat for 1-2 minutes, stirring, until warm and smooth.',
          'Stir in the canned pure pumpkin (or mashed cooked fresh pumpkin) and a pinch of cinnamon, and keep stirring over low heat for 1 minute more, until warmed through.',
          'Thin with a little more breast milk, formula, or water until the oatmeal drips slowly off a spoon.',
          'Hull the strawberries and mash them completely flat, so no round or half-berry shape remains, then swirl them through.',
          'Stir well to release hot spots, cool to just-warm, check the temperature, and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Thicker, spoonable pumpkin oatmeal with strawberry finely diced into small bite-sized pieces (no bigger than ½ inch).',
        steps: [
          'Stir the iron-fortified oat cereal into a little less breast milk, formula, or water in a small pan and cook over low heat for 1-2 minutes, stirring, to a thick, spoonable consistency.',
          'Stir in the canned pure pumpkin (or mashed cooked fresh pumpkin) and a pinch of cinnamon, and keep stirring over low heat for 1 minute more, until warmed through.',
          'Thin with a splash more breast milk, formula, or water only if it has turned stiff — it should stay on the spoon rather than run off it.',
          'Hull the strawberries and dice them finely into small bite-sized pieces (no bigger than ½ inch) so no round or half-berry shape remains, then fold them in.',
          'Stir well to release hot spots, cool to just-warm, check the temperature, and serve in a bowl with a spoon for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Thick, family-style pumpkin oatmeal with quartered strawberries.',
        steps: [
          'Stir the iron-fortified oat cereal into breast milk, formula, or water in a small pan and cook over low heat for 1-2 minutes, adding liquid a splash at a time, until thick and family-style.',
          'Stir in the canned pure pumpkin (or mashed cooked fresh pumpkin) and a pinch of cinnamon, and keep stirring over low heat for 1 minute more, until warmed through.',
          'Thin with a little more breast milk, formula, or water if it thickens as it stands.',
          'Hull and quarter the strawberries lengthwise, never leaving a whole round berry, and stir most of them through.',
          'Stir well to release hot spots, cool to just-warm, check the temperature, and serve with the rest of the strawberries on the side, with no added sugar.',
        ],
      },
    },
  },
  {
    slug: 'sheet-pan-chicken-thigh-pumpkin-broccoli',
    title: 'Sheet-Pan Chicken Thigh, Pumpkin & Broccoli',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chicken_thigh', quantityNote: '1 boneless, skinless chicken thigh (about 115g/4oz)' },
      { foodSlug: 'pumpkin', quantityNote: '1 thick slice (about 1 cup cubed) fresh pie pumpkin' },
      { foodSlug: 'broccoli', quantityNote: '1 cup broccoli florets' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote: 'A finger-length strip or fine shreds of moist chicken thigh, with a pumpkin wedge and a broccoli floret that both mash easily between two fingers.',
        steps: [
          'Heat the oven to 400°F (200°C). Peel the pumpkin, scoop out every seed and the stringy middle, and cut the pumpkin into thick, finger-length wedges.',
          'Trim any tough skin, fat, or gristle from the chicken thigh and check it carefully for small bones, then toss the chicken and the pumpkin wedges in a drizzle of olive oil on a lined sheet pan.',
          'Roast at 400°F (200°C) for 25-30 minutes, until a pumpkin wedge mashes easily between two fingers, taking the chicken thigh out after 18-22 minutes, once it is cooked to an internal temperature of 165°F (74°C) in the thickest part.',
          'Steam the broccoli florets for 8-10 minutes, keeping a bit of stem as a handle, until they mash easily between two fingers.',
          'Rest the chicken for 5 minutes, then cut a finger-length strip of the dark meat or shred it finely, moisten it with a little olive oil, and check again for small bones.',
          'Cool everything to just-warm, check the temperature, and serve the chicken, a pumpkin wedge, and a broccoli floret side by side.',
        ],
      },
      '9': {
        textureNote: 'Small bite-sized pieces (no bigger than ½ inch) of chicken thigh, pumpkin, and broccoli for pincer practice, or finger-length pumpkin wedges and strips of chicken.',
        steps: [
          'Heat the oven to 400°F (200°C). Peel the pumpkin, scoop out every seed and the stringy middle, and cut the pumpkin into finger-length wedges.',
          'Trim any tough skin, fat, or gristle from the chicken thigh and check it carefully for small bones, then toss the chicken and the pumpkin wedges in a drizzle of olive oil on a lined sheet pan.',
          'Roast at 400°F (200°C) for 25-30 minutes, until a pumpkin wedge mashes easily between two fingers, taking the chicken thigh out after 18-22 minutes, once it is cooked to an internal temperature of 165°F (74°C) in the thickest part.',
          'Steam the broccoli for 8-10 minutes, until soft, and cut it into small bite-sized florets (no bigger than ½ inch).',
          'Rest the chicken for 5 minutes, then chop or shred it into small bite-sized pieces (no bigger than ½ inch), feeling for small bones, and moisten it with a little olive oil; serve the pumpkin as wedges or cut it into soft cubes the same size.',
          'Cool everything to just-warm, check the temperature, and serve for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of tender chicken thigh, roasted pumpkin, and broccoli.',
        steps: [
          'Heat the oven to 400°F (200°C). Peel and deseed the pumpkin and cut the pumpkin into ¾-inch cubes.',
          'Trim any tough skin, fat, or gristle from the chicken thigh and check it carefully for small bones, then toss the chicken and the pumpkin in a drizzle of olive oil on a lined sheet pan.',
          'Roast at 400°F (200°C) for 20-25 minutes, until the pumpkin is fork-tender, taking the chicken thigh out after 18-22 minutes, once it is cooked to an internal temperature of 165°F (74°C) in the thickest part.',
          'Add the broccoli florets to the pan for the last 15 minutes and roast them at 400°F (200°C) until tender.',
          'Rest the chicken for 5 minutes, then dice it, the pumpkin, and the broccoli into small bite-sized pieces, discarding any gristle and checking for small bones.',
          'Cool to just-warm, check the temperature, and serve with no added salt.',
        ],
      },
    },
  },
  // ---- Item 835: kale (plant iron + vitamin C) ----
  // Plant iron from chickpeas with vitamin C from kale and tomato, in a soft pasta sauce.
  {
    slug: 'chickpea-kale-tomato-pasta',
    title: 'Chickpea, Kale & Tomato Pasta',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'chickpeas', quantityNote: '1/2 cup cooked or no-salt-added canned chickpeas, rinsed' },
      { foodSlug: 'kale', quantityNote: '2 large kale leaves, stems removed' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'wheat_pasta', quantityNote: '60g pasta shapes' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Very soft, large pasta shapes to hold whole, under a smooth tomato sauce with the chickpeas blended in and the kale chopped very finely.',
        steps: [
          'Simmer the skinned, diced tomatoes in a little olive oil over low heat for 12-15 minutes, until they break down into a soft sauce.',
          'Meanwhile, pull the kale leaves off their stems and steam them for 5-7 minutes, until dark and very soft, then squeeze them dry and chop the kale very finely.',
          'Stir the rinsed chickpeas into the sauce for the last 5 minutes, then blend or mash the sauce until completely smooth — whole chickpeas and their loose skins are a choking risk at this age.',
          'Cook the pasta for 10-12 minutes, well past al dente, until it is very soft, and keep larger shapes whole as a finger food.',
          'Stir the chopped kale through the sauce, cool it to just-warm, check the temperature, and spoon it over the pasta, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'Small soft pasta shapes for pincer-grasp self-feeding, in a thick tomato sauce with mashed chickpeas and finely chopped kale.',
        steps: [
          'Simmer the skinned, diced tomatoes in a little olive oil over low heat for 12-15 minutes, until soft.',
          'Pull the kale leaves off their stems and steam them for 5-7 minutes, until very soft, then squeeze them dry and chop the kale finely.',
          'Mash the rinsed chickpeas roughly, or squeeze each one out of its skin and flatten it between your fingers, and stir them into the sauce with the kale for the last 3-5 minutes.',
          'Cook the small pasta shapes for 10-12 minutes, past al dente, until they squash easily, and drain them.',
          'Toss the pasta through the sauce, cool to just-warm, and serve on the tray with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style pasta in a chunky tomato sauce with squashed chickpeas and chopped kale.',
        steps: [
          'Simmer the diced tomatoes in a little olive oil over low heat for 12-15 minutes, until thick.',
          'Pull the kale leaves off their stems, chop them, and stir the kale into the sauce for the last 5-7 minutes, until tender.',
          'Squash each rinsed chickpea flat between finger and thumb and stir the chickpeas into the sauce for the last 2-3 minutes to warm through.',
          'Cook the pasta for 10-12 minutes, until tender, drain it, and toss it through the sauce.',
          'Let it cool to just-warm and serve with a fork alongside, with no added salt.',
        ],
      },
    },
  },

  // Plant iron from tofu with vitamin C from kale; a pinch of turmeric gives the scramble its color.
  {
    slug: 'tofu-kale-scramble',
    title: 'Tofu & Kale Scramble',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 30,
    ingredients: [
      { foodSlug: 'tofu', quantityNote: '200g (7oz) firm tofu, drained and patted dry' },
      { foodSlug: 'kale', quantityNote: '2 large kale leaves, stems removed' },
      { foodSlug: 'turmeric', quantityNote: 'a small pinch of ground turmeric, cooked in' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A soft, moist tofu scramble with very finely chopped kale, served as a soft pile to scoop up or on a pre-loaded spoon.',
        steps: [
          'Pull the kale leaves off their stems, steam them for 5-7 minutes, until dark and very soft, then squeeze them dry and chop the kale very finely.',
          'Crumble the firm tofu into small, soft crumbs with your fingers or a fork.',
          'Warm a little olive oil over medium heat, stir in a small pinch of ground turmeric, then add the tofu and cook it for 4-5 minutes, stirring, until heated through.',
          'Stir in the chopped kale and a splash of water and cook for 1-2 minutes, until it is soft and moist rather than dry.',
          'Mash it lightly with a fork so it holds together, cool to just-warm, check the temperature, and serve as a soft pile or on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'Small, soft crumbs of tofu scramble (no bigger than ½ inch) with finely chopped kale for pincer practice.',
        steps: [
          'Pull the kale leaves off their stems, steam them for 5-7 minutes, until very soft, then squeeze them dry and chop the kale finely.',
          'Crumble the firm tofu into small pieces (no bigger than ½ inch).',
          'Warm a little olive oil over medium heat, stir in a small pinch of ground turmeric, then add the tofu and cook it for 4-5 minutes, stirring, until heated through.',
          'Stir in the chopped kale and a splash of water and cook for 1-2 minutes, until soft and moist rather than dry.',
          'Cool to just-warm and serve on the tray for pincer-grasp self-feeding, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'A family-style tofu scramble with chopped kale, soft and moist, with a spoon or fork to practice with.',
        steps: [
          'Pull the kale leaves off their stems and chop the kale finely.',
          'Crumble the firm tofu into small bite-sized pieces.',
          'Warm a little olive oil over medium heat, stir in a small pinch of ground turmeric, then cook the tofu and kale together with a splash of water for 5-6 minutes, stirring, until the kale is tender and the tofu is heated through.',
          'Cool to just-warm and serve with a spoon or fork to practice with, with no added salt.',
        ],
      },
    },
  },
  // ---- Item 835: beets (iron + vitamin C pairings) ----
  {
    slug: 'beet-hummus',
    title: 'Pink Beet Hummus',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    ingredients: [
      { foodSlug: 'beets', quantityNote: '1 small beet' },
      { foodSlug: 'chickpeas', quantityNote: '1/2 cup cooked chickpeas' },
      { foodSlug: 'tahini', quantityNote: '1 tablespoon tahini' },
      { foodSlug: 'lemon', quantityNote: 'a squeeze of juice' },
    ],
    extraIngredients: [{ name: 'water, to thin' }],
    variants: {
      '6': {
        textureNote: 'A smooth, loose pink hummus on a pre-loaded spoon, with no whole chickpeas or skins.',
        steps: [
          'Peel the beet and cut it into small cubes, then steam or boil them for 12-15 minutes, until a cube mashes easily between two fingers.',
          'Let the beet cool a little, then blend it with the chickpeas, tahini, and a squeeze of lemon juice until completely smooth, with no whole chickpeas or loose skins left.',
          'Blend in water a spoonful at a time, thinning until the hummus is loose and drips slowly off a spoon rather than sitting thick or sticky.',
          'Check the temperature and serve on a pre-loaded spoon for baby to grab.',
        ],
      },
      '9': {
        textureNote: 'A slightly thicker pink hummus, still smooth enough not to stick, with small bite-sized soft beet cubes (no bigger than ½ inch) on the tray.',
        steps: [
          'Peel the beet and cut it into small cubes (no bigger than ½ inch), then steam or boil them for 12-15 minutes, until a cube mashes easily between two fingers.',
          'Set a few soft cubes aside, let the rest cool a little, and blend the beet with the chickpeas, tahini, and a squeeze of lemon juice until smooth, with no whole chickpeas or loose skins left.',
          'Blend in water a spoonful at a time, thinning until the hummus is soft and spreadable rather than thick or sticky.',
          'Cool to just-warm, check the temperature, and serve the hummus on a pre-loaded spoon or as a dip, with the soft beet cubes on the tray for pincer practice.',
        ],
      },
      '12': {
        textureNote: 'Family-style pink hummus as a dip or thin spread, with small bite-sized pieces of soft beet.',
        steps: [
          'Peel and dice the beet, then steam or boil it for 12-15 minutes, until fork-tender.',
          'Blend most of the beet with the chickpeas, tahini, and a squeeze of lemon juice until smooth, with no whole chickpeas left.',
          'Blend in water a spoonful at a time, thinning until the hummus is spreadable rather than thick or sticky.',
          'Cool to just-warm and serve as a dip or spread thinly, with the rest of the beet alongside in small bite-sized pieces.',
        ],
      },
    },
  },
  {
    slug: 'red-lentil-beet-orange-mash',
    title: 'Red Lentil, Beet & Orange Mash',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lentils', quantityNote: '1/4 cup dried red lentils (about 1/2 cup cooked)' },
      { foodSlug: 'beets', quantityNote: '1 small beet, peeled and cut into small cubes' },
      { foodSlug: 'orange', quantityNote: 'the juice of 1/2 orange, stirred in off the heat, plus a few segments from 9 months' },
    ],
    extraIngredients: [{ name: 'water, for cooking and thinning' }],
    variants: {
      '6': {
        textureNote: 'A smooth, thick pink mash of red lentils and beet, loose enough to scoop, brightened with orange juice.',
        steps: [
          'Rinse the lentils and put them in a pan with the peeled, diced beet and plenty of unsalted water.',
          'Simmer covered over low heat for 20-25 minutes, until the lentils collapse and a beet cube mashes easily between two fingers, adding a splash more water if the pan runs dry.',
          'Take the pan off the heat and blend or mash until completely smooth, thinning with a little of the cooking water until it is scoopable rather than stiff.',
          'Stir in the juice of half an orange; its vitamin C helps baby absorb the iron in the lentils.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'A thicker lentil and beet mash with some soft beet pieces left in, plus small membrane-free orange pieces on the tray.',
        steps: [
          'Rinse the lentils and simmer them with the peeled beet, cut into small cubes (no bigger than ½ inch), in plenty of unsalted water over low heat for 20-25 minutes, until a beet cube mashes easily between two fingers.',
          'Drain off most of the water, keeping a little for thinning, and mash roughly so some soft beet pieces stay whole.',
          'Stir in the juice of half an orange off the heat.',
          'Cool to just-warm and serve with a spoon, with a few small membrane-free orange segment pieces alongside for pincer practice and no added salt.',
        ],
      },
      '12': {
        textureNote: 'Soft red lentils with small bite-sized beet pieces, family-style, finished with orange.',
        steps: [
          'Rinse the lentils and simmer them with the peeled, diced beet in unsalted water over low heat for 20-25 minutes, until the beet is fork-tender.',
          'Drain any extra water, stir in the juice of half an orange, and leave the beet in small bite-sized pieces.',
          'Cool to just-warm and serve in small spoonfuls, with membrane-free orange segments cut into small bite-sized pieces on the side and no added salt.',
        ],
      },
    },
  },
  // ---- Item 835: cranberries (iron + vitamin C pairings) ----
  // Iron from turkey with vitamin C from cranberries and apple; grated apple keeps the lean turkey moist.
  {
    slug: 'turkey-patties-cranberry-apple-sauce',
    title: 'Turkey Patties with Cranberry-Apple Sauce',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'turkey', quantityNote: '225g (8oz) ground turkey' },
      { foodSlug: 'apple', quantityNote: '1 apple, peeled and cored' },
      { foodSlug: 'cranberries', quantityNote: '1/2 cup fresh or frozen cranberries' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Finger-length strips of soft, moist turkey patty with a smooth cranberry-apple sauce spooned over or alongside — no whole cranberries.',
        steps: [
          'Finely grate a quarter of the apple and mix it with a little olive oil through the ground turkey, so the patties stay moist rather than dry and crumbly.',
          'Shape the turkey into thin patties and bake them at 375°F (190°C) for 18-20 minutes, until they are cooked to an internal temperature of 165°F (74°C) in the center.',
          'Meanwhile, dice the rest of the apple and simmer it with the cranberries and 3-4 tablespoons of water over medium-low heat for 10-12 minutes, until every cranberry has burst and the apple mashes easily between two fingers.',
          'Blend or mash the sauce until completely smooth, so no whole berry or loose skin is left.',
          'Rest the patties for 3-5 minutes, cut them into finger-length strips, cool everything to just-warm, check the temperature, and serve the strips with the sauce, with no added salt or sugar.',
        ],
      },
      '9': {
        textureNote:
          'Strips or small bite-sized pieces of turkey patty (no bigger than ½ inch) with a thick cranberry-apple mash to dip into or spoon over.',
        steps: [
          'Finely grate a quarter of the apple and mix it with a little olive oil through the ground turkey.',
          'Shape the turkey into thin patties and bake them at 375°F (190°C) for 18-20 minutes, until they are cooked to an internal temperature of 165°F (74°C) in the center.',
          'Dice the rest of the apple and simmer it with the cranberries and 3-4 tablespoons of water over medium-low heat for 10-12 minutes, until every cranberry has burst and the apple is very soft.',
          'Mash the sauce well with a fork, so no whole berry is left.',
          'Rest the patties for 3-5 minutes, cut them into finger-length strips or small bite-sized pieces (no bigger than ½ inch), cool to just-warm, and serve with the sauce, with no added salt or sugar.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized pieces of turkey patty with a chunky cranberry-apple sauce, family style.',
        steps: [
          'Finely grate a quarter of the apple and mix it with a little olive oil through the ground turkey, which keeps lean turkey from turning dry.',
          'Shape the turkey into thin patties and bake them at 375°F (190°C) for 18-20 minutes, until they are cooked to an internal temperature of 165°F (74°C) in the center.',
          'Dice the rest of the apple small and simmer it with the cranberries and 3-4 tablespoons of water over medium-low heat for 10-12 minutes, until every cranberry has burst and the apple is tender.',
          'Mash the sauce roughly so no whole berry is left, keeping it chunky.',
          'Rest the patties for 3-5 minutes, dice them into small bite-sized pieces, cool to just-warm, and serve with the sauce, with no added salt or sugar.',
        ],
      },
    },
  },

  // Iron-fortified oat cereal with vitamin C from cranberries; the pear brings the sweetness instead of sugar.
  {
    slug: 'cranberry-pear-oatmeal',
    title: 'Cranberry & Pear Oatmeal',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: true,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'iron_fortified_oats', quantityNote: '3 tablespoons iron-fortified baby oat cereal' },
      { foodSlug: 'cranberries', quantityNote: '1/4 cup fresh or frozen cranberries' },
      { foodSlug: 'pear', quantityNote: '1 ripe pear' },
    ],
    extraIngredients: [{ name: 'breast milk, formula, or water' }],
    variants: {
      '6': {
        textureNote:
          'A smooth, thinned oatmeal with a swirl of smooth cranberry and pear mash, loose enough to drip slowly off a spoon.',
        steps: [
          'Peel, core, and dice the pear, then simmer it with the cranberries and 3-4 tablespoons of water over medium-low heat for 8-10 minutes, until every cranberry has burst and the pear mashes easily between two fingers.',
          'Blend or mash the fruit until completely smooth, so no whole berry or loose skin is left.',
          'Stir the oat cereal into breast milk, formula, or water in a small pan and cook over low heat for 1-2 minutes, stirring, until warm and smooth, then thin it until it drips slowly off a spoon.',
          'Swirl a spoonful of the cranberry and pear mash through the oatmeal, stir well to release hot spots, cool to just-warm, and check the temperature.',
          'Serve on a pre-loaded spoon, with no added sugar — the pear brings the sweetness.',
        ],
      },
      '9': {
        textureNote: 'A thicker, spoonable oatmeal with a well-mashed cranberry and pear sauce stirred through, for spoon practice.',
        steps: [
          'Peel, core, and dice the pear, then simmer it with the cranberries and 3-4 tablespoons of water over medium-low heat for 8-10 minutes, until every cranberry has burst and the pear is very soft.',
          'Mash the fruit well with a fork, so no whole berry is left.',
          'Stir the oat cereal into a little less breast milk, formula, or water in a small pan and cook over low heat for 1-2 minutes, stirring, to a thick, spoonable consistency.',
          'Fold the cranberry and pear mash through the oatmeal, stir well to release hot spots, cool to just-warm, and check the temperature, then serve in a bowl with a pre-loaded spoon for baby to practice with, with no added sugar.',
        ],
      },
      '12': {
        textureNote: 'A thick, family-style oatmeal topped with a chunky cranberry and pear sauce.',
        steps: [
          'Peel, core, and dice the pear small, then simmer it with the cranberries and 3-4 tablespoons of water over medium-low heat for 8-10 minutes, until every cranberry has burst and the pear is tender.',
          'Mash the fruit roughly, checking that no whole berry is left.',
          'Stir the oat cereal into breast milk, formula, or water in a small pan and cook over low heat for 1-2 minutes, adding liquid a splash at a time, until thick and family-style.',
          'Stir well to release hot spots, spoon the cranberry and pear sauce over the oatmeal, cool to just-warm, check the temperature, and serve with a spoon, with no added sugar.',
        ],
      },
    },
  },
  // ---- Item 841: kidney beans (plant iron + vitamin C) ----
  // Plant iron from kidney beans with vitamin C from tomato, in a mild rajma over soft rice.
  {
    slug: 'kidney-bean-tomato-rajma',
    title: 'Mild Kidney Bean Rajma with Rice',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'kidney_beans', quantityNote: '1/2 cup fully cooked or no-salt-added canned kidney beans, rinsed (dried beans must be boiled first, never just soaked)' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'onion', quantityNote: '1/4 small yellow or sweet onion, peeled, root end cut off, and very finely chopped' },
      { foodSlug: 'cumin', quantityNote: 'a pinch of ground cumin, warmed in the pan' },
      { foodSlug: 'rice', quantityNote: '1/4 cup dry white rice' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A thick, smooth rajma with every kidney bean mashed flat, served on a pre-loaded spoon with a soft, sticky rice ball to hold.',
        steps: [
          'Simmer the rice in plenty of water over low heat for 18-20 minutes, until very soft and sticky, then drain it.',
          'Warm a little olive oil over medium-low heat, stir in a pinch of cumin, then cook the very finely chopped onion in it for 8-10 minutes, until the onion is completely soft and squashes easily between two fingers.',
          'Add the skinned, diced tomatoes and the rinsed kidney beans and simmer over low heat for 12-15 minutes, until the tomato breaks down into a thick sauce.',
          'Mash or blend the sauce until no whole kidney bean is left and every bean is squashed flat.',
          'Press the rice into soft balls, cool everything to just-warm, check the temperature, and serve the rajma on a pre-loaded spoon with a rice ball alongside, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A thick rajma with each kidney bean squashed flat, over soft loose rice grains for pincer-grasp practice.',
        steps: [
          'Simmer the rice in plenty of water over low heat for 15-18 minutes, until soft, then drain it.',
          'Warm a little olive oil over medium-low heat, stir in a pinch of cumin, then cook the finely chopped onion in it for 8-10 minutes, until the onion is completely soft and squashes easily between two fingers.',
          'Add the skinned, diced tomatoes and the rinsed kidney beans and simmer over low heat for 12-15 minutes, until the sauce is thick.',
          'Squash each kidney bean flat with a fork, leaving the sauce thick and a little textured.',
          'Cool to just-warm and serve the rajma over the soft rice in small spoonfuls, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style rajma with soft kidney beans, lightly squashed or halved, over tender rice.',
        steps: [
          'Simmer the rice in plenty of water over low heat for 15-18 minutes, until tender, then drain it.',
          'Warm a little olive oil over medium heat, stir in a pinch of cumin, then cook the finely chopped onion in it for 6-8 minutes, until the onion is soft.',
          'Add the diced tomatoes and the rinsed kidney beans and simmer over low heat for 15-20 minutes, until the sauce is thick and the beans squash easily between two fingers.',
          'Halve or lightly squash the kidney beans, since they are bigger than most beans, then cool to just-warm and serve the rajma over the rice, with no added salt.',
        ],
      },
    },
  },

  // Plant iron from kidney beans and fortified oat cereal with vitamin C from bell pepper, baked soft.
  {
    slug: 'kidney-bean-pepper-patties',
    title: 'Kidney Bean & Red Pepper Patties',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'kidney_beans', quantityNote: '3/4 cup fully cooked or no-salt-added canned kidney beans, rinsed and drained well (dried beans must be boiled first, never just soaked)' },
      { foodSlug: 'bell_pepper', quantityNote: '1/2 red bell pepper, very finely diced' },
      { foodSlug: 'iron_fortified_oats', quantityNote: '3-4 tablespoons iron-fortified baby oat cereal' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a little' }],
    variants: {
      '6': {
        textureNote:
          'Soft, finger-length logs about as thick as an adult finger, set on the outside but soft enough to squash easily between two fingers.',
        steps: [
          'Cook the very finely diced bell pepper in a little olive oil over medium heat for 5-6 minutes, until completely soft with no papery skin left.',
          'Mash the rinsed kidney beans well in a bowl, until no whole bean or large piece of skin is left, then stir in the soft bell pepper and the iron-fortified oat cereal until the mix holds together.',
          'Shape the mix into finger-length logs about as thick as an adult finger and lay them on a baking sheet lined with parchment paper.',
          'Bake at 400°F (200°C) for 15-18 minutes, turning once halfway, until set and lightly golden but still soft inside.',
          'Cool to just-warm, check that a log squashes easily between your fingers, and serve it whole for baby to hold, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'Soft patty strips, or small bite-sized pieces (no bigger than ½ inch) for pincer practice.',
        steps: [
          'Cook the very finely diced bell pepper in a little olive oil over medium heat for 5-6 minutes, until completely soft.',
          'Mash the rinsed kidney beans in a bowl, squashing every bean flat, then stir in the soft bell pepper and the iron-fortified oat cereal until the mix holds together.',
          'Shape the mix into small flat patties and lay them on a baking sheet lined with parchment paper.',
          'Bake at 400°F (200°C) for 15-18 minutes, turning once halfway, until set and lightly golden.',
          'Cool to just-warm, then cut into strips or small bite-sized pieces (no bigger than ½ inch) and serve on the tray, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Mini patties baby can pick up and bite from, with a little soft bean texture left.',
        steps: [
          'Cook the finely diced bell pepper in a little olive oil over medium heat for 4-5 minutes, until soft.',
          'Mash the rinsed kidney beans roughly in a bowl so every bean is at least squashed flat, then stir in the soft bell pepper and the iron-fortified oat cereal.',
          'Shape the mix into mini patties and lay them on a baking sheet lined with parchment paper.',
          'Bake at 400°F (200°C) for 18-20 minutes, turning once halfway, until golden and set.',
          'Cool to just-warm and serve whole or cut in half for baby to bite from, with no added salt.',
        ],
      },
    },
  },
  // ---- Item 841: pinto beans (plant iron + vitamin C) ----
  // Item 841. Refried beans made at home with no salt — most canned refried beans are salty.
  // Plant iron from pinto beans with vitamin C from bell pepper.
  {
    slug: 'homemade-refried-pinto-beans',
    title: 'Homemade Refried Pinto Beans',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'pinto_beans', quantityNote: '1 cup cooked or no-salt-added canned pinto beans, rinsed' },
      { foodSlug: 'onion', quantityNote: '1/4 small yellow or sweet onion, peeled, root end cut off, and very finely chopped' },
      { foodSlug: 'bell_pepper', quantityNote: '1/4 red bell pepper, very finely diced' },
      { foodSlug: 'cumin', quantityNote: 'a small pinch of ground cumin' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water, to loosen', quantityNote: 'a few tablespoons of' },
    ],
    variants: {
      '6': {
        textureNote:
          'A smooth, thick refried-bean spread with the onion and bell pepper cooked soft and blended in, and no whole bean or loose skin left.',
        steps: [
          'Warm a little olive oil in a pan over medium-low heat, add the very finely chopped onion and bell pepper, and cook them for 8-10 minutes, stirring, until completely soft with no papery pepper skin left and the onion squashes easily between two fingers — onion is always cooked soft, never raw.',
          'Stir in a small pinch of ground cumin and cook for 30 seconds, until it smells fragrant.',
          'Add the rinsed pinto beans and a few tablespoons of water and simmer over low heat for 5 minutes, until the pinto beans are hot and very soft.',
          'Mash or blend it all until smooth, with no whole bean left, and loosen it with a little more water so it is soft and spreadable rather than thick and sticky.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt — this is why the beans are made at home, since most canned refried beans are salty.',
        ],
      },
      '9': {
        textureNote:
          'Thick homemade refried pinto beans with a little soft texture, to scoop with a spoon or spread on a soft finger food.',
        steps: [
          'Warm a little olive oil in a pan over medium-low heat, add the very finely chopped onion and bell pepper, and cook them for 8-10 minutes, stirring, until completely soft and the onion squashes easily between two fingers — onion is always cooked soft, never raw.',
          'Stir in a small pinch of ground cumin and cook for 30 seconds, until fragrant.',
          'Add the rinsed pinto beans and a few tablespoons of water and simmer over low heat for 5 minutes, until the pinto beans are very soft.',
          'Mash lightly, leaving some soft texture, squash any whole bean flat, and loosen with a little more water if it is stiff.',
          'Cool to just-warm and serve in a bowl with a spoon, or spread on a soft finger food, with no added salt — canned refried beans are usually salty, so homemade is the one to offer.',
        ],
      },
      '12': {
        textureNote: 'Family-style refried pinto beans, mashed with some texture, as a side with rice or a soft dip.',
        steps: [
          'Warm a little olive oil in a pan over medium-low heat, add the finely chopped onion and bell pepper, and cook them for 6-8 minutes, stirring, until tender.',
          'Stir in a small pinch of ground cumin and cook for 30 seconds, until fragrant.',
          'Add the rinsed pinto beans and a few tablespoons of water and simmer over low heat for 5 minutes, until the pinto beans are hot and soft.',
          'Mash roughly, leaving some texture, and loosen with a little more water if it is too thick to scoop.',
          'Cool to just-warm and serve as a side with rice or as a dip for soft-cooked vegetables, with no added salt — skip canned refried beans, which are usually salty.',
        ],
      },
    },
  },

  // Item 841. Plant iron from pinto beans with vitamin C from tomato and butternut squash.
  {
    slug: 'pinto-bean-squash-tomato-stew',
    title: 'Pinto Bean, Squash & Tomato Stew',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'pinto_beans', quantityNote: '1/2 cup cooked or no-salt-added canned pinto beans, rinsed' },
      { foodSlug: 'butternut_squash', quantityNote: '1 cup peeled butternut squash, cut into small cubes' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'paprika', quantityNote: 'a pinch of sweet (mild) paprika' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water', quantityNote: '1/2 cup' },
    ],
    variants: {
      '6': {
        textureNote:
          'A thick, smooth stew of soft butternut squash, tomato, and pinto beans, blended or mashed so no whole bean is left.',
        steps: [
          'Warm a little olive oil in a pan over medium-low heat, stir in a pinch of sweet (mild) paprika for 30 seconds, then add the skinned, diced tomatoes and the cubes of butternut squash.',
          'Pour in the water, cover, and simmer over low heat for 15-20 minutes, until the squash mashes easily between two fingers.',
          'Stir in the rinsed pinto beans and simmer for 5 more minutes, until the pinto beans are hot and very soft.',
          'Blend or mash the stew until smooth and thick, with no whole bean or loose bean skin left — whole beans can be firm enough to pose a choking risk at this age.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A thick stew with soft, small bite-sized cubes of butternut squash (no bigger than ½ inch) and every pinto bean squashed flat.',
        steps: [
          'Warm a little olive oil in a pan over medium-low heat, stir in a pinch of sweet (mild) paprika for 30 seconds, then add the skinned, diced tomatoes and the small cubes of butternut squash (no bigger than ½ inch).',
          'Pour in the water, cover, and simmer over low heat for 15-20 minutes, until the squash is very soft.',
          'Stir in the rinsed pinto beans and simmer for 5 more minutes, until the pinto beans are hot and very soft.',
          'Squash each bean flat with the back of a fork, leaving the soft cubes of squash for baby to pick up.',
          'Cool to just-warm and serve thick in a bowl with a spoon alongside, or on the tray for pincer-grasp self-feeding, with no added salt.',
        ],
      },
      '12': {
        textureNote:
          'Family-style stew with small bite-sized pieces of butternut squash and soft whole pinto beans that squash easily between two fingers.',
        steps: [
          'Warm a little olive oil in a pan over medium-low heat, stir in a pinch of sweet (mild) paprika for 30 seconds — sweet paprika only, never hot, smoked hot, or chili powder — then add the diced tomatoes and the cubes of butternut squash.',
          'Pour in the water, cover, and simmer over low heat for 15-20 minutes, until the squash is tender.',
          'Stir in the rinsed pinto beans and simmer for 5 more minutes, until they squash easily between two fingers, and squash flat any bean that still feels firm.',
          'Cool to just-warm and serve with rice or a spoon to practice with, with no added salt.',
        ],
      },
    },
  },
  // ---- Item 841: white beans (plant iron + vitamin C) ----
  // Item 841. Plant iron from white beans and spinach with vitamin C from tomato and spinach.
  {
    slug: 'white-bean-spinach-tomato-stew',
    title: 'White Bean, Spinach & Tomato Stew',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'white_beans', quantityNote: '1/2 cup fully cooked or no-salt-added canned white beans, rinsed' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'spinach', quantityNote: '1 large handful of fresh spinach leaves, finely chopped' },
      { foodSlug: 'garlic', quantityNote: '1/2 small clove, finely minced and softened in the pan' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water', quantityNote: '1/4 cup' },
    ],
    variants: {
      '6': {
        textureNote:
          'A thick, smooth stew of white beans, tomato, and spinach, blended so no whole bean, loose skin, or piece of leaf is left.',
        steps: [
          'Soften the finely minced garlic in a little olive oil over medium-low heat for 30-60 seconds, until it smells sweet rather than raw.',
          'Add the skinned, diced tomatoes and the water and simmer over low heat for 8-10 minutes, until the tomatoes break down into a sauce.',
          'Stir in the rinsed white beans and the finely chopped spinach and simmer for 5 more minutes, until the white beans are very soft and the spinach is completely wilted.',
          'Blend the stew until smooth and thick, with no whole bean or piece of spinach leaf left — whole beans can be firm enough to pose a choking risk at this age.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A thick, mashed stew with every white bean squashed flat and the spinach finely chopped through it.',
        steps: [
          'Soften the finely minced garlic in a little olive oil over medium-low heat for 30-60 seconds, until it smells sweet rather than raw.',
          'Add the skinned, diced tomatoes and the water and simmer over low heat for 8-10 minutes, until the tomatoes break down into a sauce.',
          'Stir in the rinsed white beans and the finely chopped spinach and simmer for 5 more minutes, until the white beans are very soft and the spinach is completely wilted.',
          'Mash the stew lightly with a fork, squashing every white bean flat and leaving some soft texture.',
          'Cool to just-warm and serve thick in a bowl with a pre-loaded spoon for baby to practice with, with no added salt.',
        ],
      },
      '12': {
        textureNote:
          'Family-style stew with soft whole white beans that squash easily between two fingers and finely chopped spinach.',
        steps: [
          'Soften the finely minced garlic in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Add the diced tomatoes and the water and simmer over low heat for 8-10 minutes, until the tomatoes break down into a sauce.',
          'Stir in the rinsed white beans and the chopped spinach and simmer for 5 more minutes, until the white beans squash easily between two fingers and the spinach is wilted.',
          'Squash flat any bean that still feels firm, then cool to just-warm and serve in a bowl with a spoon to practice with, with no added salt.',
        ],
      },
    },
  },

  // Item 841. Plant iron from white beans with vitamin C from broccoli; egg-free, so no allergen tag.
  {
    slug: 'baked-white-bean-broccoli-patties',
    title: 'Baked White Bean & Broccoli Patties',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'white_beans', quantityNote: '1 cup fully cooked or no-salt-added canned white beans, rinsed and patted dry' },
      { foodSlug: 'broccoli', quantityNote: '1 cup small broccoli florets' },
      { foodSlug: 'oats', quantityNote: '1/4 cup rolled oats, blended into a fine flour' },
    ],
    extraIngredients: [{ name: 'olive oil for the pan' }],
    variants: {
      '6': {
        textureNote:
          'Soft finger-length bean patties, lightly firm outside and soft enough inside to squash easily between two fingers, with no whole bean left.',
        steps: [
          'Heat the oven to 400°F (200°C) and brush a baking sheet with a little olive oil.',
          'Steam the broccoli florets for 6-8 minutes, until very soft, then chop the broccoli very finely.',
          'Mash the white beans well, with no whole bean left, then mix in the chopped broccoli and the blended oats until the mixture holds together when pressed.',
          'Shape heaped tablespoons into finger-length logs about as thick as two adult fingers and set them on the baking sheet.',
          'Bake the patties at 400°F (200°C) for 18-20 minutes, turning them once halfway, until lightly golden outside and soft inside.',
          'Cool to just-warm, check the temperature, and check a patty squashes easily between two fingers before serving, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'Soft finger-length patties, or small bite-sized pieces (no bigger than ½ inch) for pincer practice.',
        steps: [
          'Heat the oven to 400°F (200°C) and brush a baking sheet with a little olive oil.',
          'Steam the broccoli florets for 6-8 minutes, until very soft, then chop the broccoli finely.',
          'Mash the white beans, squashing every bean flat, then mix in the chopped broccoli and the blended oats until the mixture holds together when pressed.',
          'Shape heaped tablespoons into finger-length logs and set them on the baking sheet.',
          'Bake the patties at 400°F (200°C) for 18-20 minutes, turning them once halfway, until lightly golden outside and soft inside.',
          'Cool to just-warm and serve whole, or break into small bite-sized pieces (no bigger than ½ inch) for pincer practice, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Small round patties, soft inside, cut into bite-sized pieces, family-style.',
        steps: [
          'Heat the oven to 400°F (200°C) and brush a baking sheet with a little olive oil.',
          'Steam the broccoli florets for 5-6 minutes, until tender, then chop the broccoli finely.',
          'Mash the white beans roughly, then mix in the chopped broccoli and the blended oats until the mixture holds together when pressed.',
          'Shape the mixture into small round patties about 2 inches across and set them on the baking sheet.',
          'Bake the patties at 400°F (200°C) for 20-22 minutes, turning them once halfway, until golden outside and set through.',
          'Cool to just-warm, check the temperature, and cut into bite-sized pieces, with no added salt.',
        ],
      },
    },
  },
  // ---- Item 841: butter beans (plant iron + vitamin C) ----
  // Item 841. Plant iron from butter beans with vitamin C from tomato, baked soft, gigantes-style.
  {
    slug: 'baked-butter-beans-tomato-oregano',
    title: 'Baked Butter Beans in Tomato Sauce',
    minAgeMonths: 6,
    prepMinutes: 45,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'butter_beans', quantityNote: '1 cup fully cooked or no-salt-added canned butter beans, rinsed (dried beans must be boiled first, never just soaked)' },
      { foodSlug: 'tomato', quantityNote: '3 tomatoes, skinned and diced' },
      { foodSlug: 'onion', quantityNote: '1/4 small yellow or sweet onion, peeled, root end cut off, and very finely chopped' },
      { foodSlug: 'oregano', quantityNote: 'a pinch of dried oregano, rubbed fine' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'water', quantityNote: '1/4 cup' },
    ],
    variants: {
      '6': {
        textureNote:
          'A thick, smooth tomato and butter bean mash, blended so no whole bean or loose skin is left, to scoop from a pre-loaded spoon.',
        steps: [
          'Warm a little olive oil in an ovenproof pan over medium-low heat, add the very finely chopped onion, and cook it for 8-10 minutes, stirring, until it squashes easily between two fingers — onion is always cooked soft, never raw.',
          'Stir in the skinned, diced tomatoes and a pinch of dried oregano rubbed fine, and simmer over low heat for 10 minutes, until the tomato breaks down.',
          'Stir in the rinsed butter beans and the water, cover, and bake at 375°F (190°C) for 25-30 minutes, until the sauce is thick and the butter beans are very soft.',
          'Blend or mash it all until smooth, picking out any loose bean skins, so no whole bean is left.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'Soft baked butter beans, each one squashed flat, in a thick tomato sauce for scooping and pincer-grasp practice.',
        steps: [
          'Warm a little olive oil in an ovenproof pan over medium-low heat, add the very finely chopped onion, and cook it for 8-10 minutes, stirring, until it squashes easily between two fingers — onion is always cooked soft, never raw.',
          'Stir in the skinned, diced tomatoes and a pinch of dried oregano rubbed fine, and simmer over low heat for 10 minutes, until the tomato breaks down.',
          'Stir in the rinsed butter beans and the water, cover, and bake at 375°F (190°C) for 25-30 minutes, until the sauce is thick and the butter beans are very soft.',
          'Squash each butter bean flat with the back of a fork, leaving the sauce thick and a little textured.',
          'Cool to just-warm and serve in a bowl with a spoon, or on the tray, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style baked butter beans in tomato sauce, lightly squashed, soft enough to give easily between two fingers.',
        steps: [
          'Warm a little olive oil in an ovenproof pan over medium heat, add the finely chopped onion, and cook it for 6-8 minutes, stirring, until the onion is soft.',
          'Stir in the diced tomatoes and a pinch of dried oregano, and simmer over low heat for 10 minutes, until the tomato breaks down.',
          'Stir in the rinsed butter beans and the water, then bake uncovered at 375°F (190°C) for 30-35 minutes, until the sauce is thick and the butter beans squash easily between two fingers.',
          'Squash lightly any butter bean that is still whole, since they are big beans, then cool to just-warm and serve with a spoon, with no added salt.',
        ],
      },
    },
  },

  // Item 841. Plant iron from butter beans with vitamin C from broccoli and lemon.
  {
    slug: 'butter-bean-broccoli-lemon-mash',
    title: 'Butter Bean & Broccoli Mash with Lemon',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'butter_beans', quantityNote: '3/4 cup fully cooked or no-salt-added canned butter beans, rinsed (dried beans must be boiled first, never just soaked)' },
      { foodSlug: 'broccoli', quantityNote: '1 cup small broccoli florets' },
      { foodSlug: 'lemon', quantityNote: 'a squeeze of juice' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A smooth, thick green mash of butter beans and broccoli with no whole bean, loose skin, or floret left, soft enough to scoop.',
        steps: [
          'Steam the broccoli florets for 8-10 minutes, until they mash easily between two fingers.',
          'Warm the rinsed butter beans in a pan over low heat for 2-3 minutes.',
          'Blend or mash the butter beans and broccoli with a squeeze of lemon juice and a drizzle of olive oil until smooth, picking out any loose bean skins.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A thick mash with some soft texture, with small soft broccoli florets (no bigger than ½ inch) alongside for pincer practice.',
        steps: [
          'Steam the broccoli florets for 8-10 minutes, until soft, and set a few small florets (no bigger than ½ inch) aside.',
          'Warm the rinsed butter beans in a pan over low heat for 2-3 minutes.',
          'Mash the butter beans with the rest of the broccoli, a squeeze of lemon juice, and a drizzle of olive oil, leaving some soft texture and squashing any whole bean flat.',
          'Cool to just-warm and serve the mash in a bowl with the soft florets on the tray, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'A rough butter bean and broccoli mash to scoop or dip, with tender florets that squash easily between two fingers.',
        steps: [
          'Steam the broccoli florets for 6-8 minutes, until tender.',
          'Warm the rinsed butter beans in a pan over low heat for 2-3 minutes.',
          'Mash the butter beans roughly with a few of the florets, a squeeze of lemon juice, and a drizzle of olive oil, squashing any whole bean.',
          'Cool to just-warm and serve the mash as a dip with the rest of the broccoli florets, with no added salt.',
        ],
      },
    },
  },
  // ---- Item 841: edamame (plant iron + vitamin C; soy) ----
  // Item 841. Plant iron from edamame with vitamin C from broccoli and lemon.
  {
    slug: 'edamame-broccoli-lemon-mash',
    title: 'Edamame, Broccoli & Lemon Mash',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: true,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 30,
    ingredients: [
      { foodSlug: 'edamame', quantityNote: '1/2 cup frozen shelled edamame, with no added salt' },
      { foodSlug: 'broccoli', quantityNote: '1 cup broccoli florets' },
      { foodSlug: 'lemon', quantityNote: 'a squeeze of juice' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'A smooth, thick green mash of edamame and broccoli with a squeeze of lemon, with no whole bean or loose skin left.',
        steps: [
          'Steam the broccoli florets for 8-10 minutes, until the stems mash easily between two fingers.',
          'Boil the frozen shelled edamame in unsalted water for 6-8 minutes, until one squashes easily between two fingers, then drain.',
          'Blend or mash the edamame and broccoli with a drizzle of olive oil and a squeeze of lemon juice until smooth and thick, with no whole bean or loose skin left — whole edamame is a choking hazard at this age.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon, with no added salt.',
        ],
      },
      '9': {
        textureNote:
          'A thick mash of edamame and broccoli with some soft texture left, with a few soft broccoli florets to hold and dip.',
        steps: [
          'Steam the broccoli florets for 8-10 minutes, until soft, and set two or three florets aside as finger food.',
          'Boil the frozen shelled edamame in unsalted water for 6-8 minutes, until very soft, then drain.',
          'Mash the edamame and the rest of the broccoli with a drizzle of olive oil and a squeeze of lemon juice, leaving some soft texture, and check that every edamame bean is smashed flat.',
          'Cool to just-warm and serve the mash in a bowl with a spoon, with the soft florets alongside for dipping, and no added salt.',
        ],
      },
      '12': {
        textureNote: 'A rough mash with every edamame bean smashed flat, served as a dip or with a spoon.',
        steps: [
          'Steam the broccoli florets for 6-8 minutes, until tender.',
          'Boil the frozen shelled edamame in unsalted water for 5-7 minutes, until tender, then drain.',
          'Roughly mash the edamame and broccoli with a drizzle of olive oil and a squeeze of lemon juice, smashing every bean flat — whole edamame stays a choking hazard.',
          'Cool to just-warm and serve with a spoon to practice with, or as a dip for soft-cooked vegetables, with no added salt.',
        ],
      },
    },
  },

  // Item 841. Plant iron from edamame and egg with vitamin C from bell pepper. No soy sauce (salt).
  {
    slug: 'edamame-egg-veggie-fried-rice',
    title: 'Edamame & Egg Veggie Fried Rice',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 30,
    ingredients: [
      { foodSlug: 'edamame', quantityNote: '1/3 cup frozen shelled edamame, with no added salt' },
      { foodSlug: 'rice', quantityNote: '1 cup cooked rice, very soft' },
      { foodSlug: 'egg', quantityNote: '1 egg, beaten' },
      { foodSlug: 'bell_pepper', quantityNote: '1/4 red bell pepper, very finely diced' },
    ],
    extraIngredients: [{ name: 'olive oil', quantityNote: 'a drizzle of' }],
    variants: {
      '6': {
        textureNote:
          'Soft, sticky rice pressed into small balls, with smashed edamame, soft bell pepper, and well-cooked egg mixed through.',
        steps: [
          'Boil the frozen shelled edamame in unsalted water for 6-8 minutes, until one squashes easily between two fingers, then drain and smash every bean flat — whole edamame is a choking hazard.',
          'Warm a drizzle of olive oil in a nonstick pan over medium-low heat and cook the very finely diced bell pepper for 6-8 minutes, stirring, until completely soft with no papery skin left.',
          'Pour in the beaten egg and scramble it over medium-low heat for 2-3 minutes, until it is fully set with no runny egg left and cooked to an internal temperature of 160°F (71°C).',
          'Add the soft rice and the smashed edamame and stir-fry over low heat for 2-3 minutes, until steaming hot all the way through.',
          'Squeeze the rice mixture into small balls baby can hold, cool to just-warm, check the temperature, and serve with no added salt or soy sauce.',
        ],
      },
      '9': {
        textureNote:
          'Loose soft rice with smashed edamame and small soft pieces of bell pepper and egg (no bigger than ½ inch), for pincer-grasp self-feeding.',
        steps: [
          'Boil the frozen shelled edamame in unsalted water for 6-8 minutes, until very soft, then drain and smash each bean flat or split it in half.',
          'Warm a drizzle of olive oil in a nonstick pan over medium-low heat and cook the very finely diced bell pepper for 6-8 minutes, stirring, until soft.',
          'Pour in the beaten egg and scramble it over medium-low heat for 2-3 minutes, until it is fully set with no runny egg left and cooked to an internal temperature of 160°F (71°C), breaking it into small pieces (no bigger than ½ inch).',
          'Add the rice and the edamame and stir-fry over low heat for 2-3 minutes, until steaming hot all the way through.',
          'Cool to just-warm and serve on the tray for pincer-grasp self-feeding, with no added salt or soy sauce.',
        ],
      },
      '12': {
        textureNote:
          'Family-style fried rice with small bite-sized pieces of egg and bell pepper, and every edamame bean smashed flat or split in half.',
        steps: [
          'Boil the frozen shelled edamame in unsalted water for 5-7 minutes, until tender, then drain and smash each bean flat or split it in half — whole edamame stays a choking hazard.',
          'Warm a drizzle of olive oil in a pan over medium heat and cook the diced bell pepper for 4-5 minutes, until tender.',
          'Push the bell pepper to one side, pour in the beaten egg, and scramble it over medium-low heat for 2-3 minutes, until it is fully set with no runny egg left and cooked to an internal temperature of 160°F (71°C).',
          'Stir in the rice and the edamame and stir-fry over medium heat for 3-4 minutes, until steaming hot all the way through.',
          'Cool to just-warm and serve with a spoon to practice with, with no added salt or soy sauce.',
        ],
      },
    },
  },
]
