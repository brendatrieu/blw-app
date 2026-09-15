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
          'Mashed rather than blended, with pea-sized pieces of soft squash on the tray for pincer-grasp practice.',
        steps: [
          'Toss the squash chunks with a little olive oil and a pinch of ground cumin, and roast them with the garlic clove in its skin at 400°F (200°C) for 25-30 minutes, until the squash is fork-tender and the garlic is soft.',
          'Squeeze the garlic out of its skin, mash the squash rather than blending it so some texture is left, and loosen it with a little water or no-salt-added stock.',
          'Stir the finely ground almond meal through off the heat, until nothing hard is left in the bowl.',
          'Serve thick in a bowl with a spoon, with a few pea-sized pieces of soft squash on the tray.',
        ],
      },
      '12': {
        textureNote: 'A smooth family-style soup thickened with ground almond, and completely salt-free.',
        steps: [
          'Toss the squash chunks with olive oil and a pinch of ground cumin and roast them with the garlic clove at 400°F (200°C) for 25-30 minutes, until tender.',
          'Squeeze the garlic from its skin, then blend everything with water or no-salt-added stock to a smooth soup.',
          'Stir the finely ground almond meal through off the heat — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Serve family-style in a bowl with a spoon, with no added salt in the pan.',
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
    extraIngredients: [{ name: 'water, breast milk, or formula' }],
    variants: {
      '6': {
        textureNote:
          'A loose, creamy pudding that drips slowly off a spoon, with a finger-length strip of ripe banana to hold.',
        steps: [
          'Simmer the rice with plenty of water, breast milk, or formula and a pinch of ground cinnamon over low heat for 20-25 minutes, stirring often, until the grains have collapsed into a thick, creamy pudding.',
          'Take the pan off the heat and let the pudding cool until it is only just warm.',
          'Mash the ripe banana completely smooth and stir it through, leaving no lump that needs chewing.',
          'Stir the finely ground almond meal through off the heat, until the pudding is smooth and nothing hard is left — never a piece, a half, or a whole nut.',
          'Serve on a pre-loaded spoon, loose enough to drip slowly, with a finger-length strip of ripe banana alongside.',
        ],
      },
      '9': {
        textureNote: 'Thick, creamy pudding with pea-sized pieces of soft banana on the tray.',
        steps: [
          'Simmer the rice with water, breast milk, or formula and a pinch of ground cinnamon over low heat for 20-25 minutes, until the grains are soft and creamy.',
          'Cool the pudding to just warm, then mash half the banana through it and dice the rest into pea-sized pieces.',
          'Stir the finely ground almond meal through off the heat, so nothing hard is left.',
          'Serve thick in a bowl with the banana pieces on the tray for pincer-grasp practice.',
        ],
      },
      '12': {
        textureNote: 'A family-style rice pudding, unsweetened apart from the ripe banana.',
        steps: [
          'Simmer the rice with water, breast milk, or formula and a pinch of ground cinnamon over low heat for 20-25 minutes, until thick and creamy.',
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
          'Serve thick in a bowl for spoon practice, with soft bread fingers on the tray to dip.',
        ],
      },
      '12': {
        textureNote: 'Family-style dal, thick and creamy, with no added salt.',
        steps: [
          'Soften the minced garlic with a pinch of ground turmeric in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Simmer the lentils in water or no-salt-added stock over low heat for 20-25 minutes, until thick, stirring the finely chopped spinach in for the last 2-3 minutes, until wilted.',
          'Stir the finely ground cashew meal through off the heat — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Serve family-style with soft rice, with no added salt in the pan.',
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
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'warm water, to soak and blend the ground cashew meal' },
      { name: 'lemon juice', quantityNote: 'a squeeze of' },
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
          'Stir the cream through the warm pasta and mashed broccoli off the heat, and serve with a whole floret alongside.',
        ],
      },
      '9': {
        textureNote:
          'Small soft pasta shapes and pea-sized broccoli pieces in a smooth cream, for pincer-grasp self-feeding.',
        steps: [
          'Grind the cashews to a fine meal, cover it with warm water, and leave it to soak for 10 minutes.',
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Blend the soaked meal with the garlic, a squeeze of lemon juice, and a tiny pinch of finely ground black pepper to a completely smooth, pourable cream.',
          'Steam the broccoli for 8-10 minutes, until soft, and chop it into pea-sized pieces; cook the small pasta shapes for 10-12 minutes, past al dente, until soft.',
          'Toss the pasta and broccoli through the cream off the heat and serve on the tray for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style pasta in a smooth cashew cream, still completely salt-free.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant — garlic is always cooked, never raw.',
          'Grind the cashews to a fine meal, soak it in warm water for 10 minutes, then blend it with the garlic, a squeeze of lemon juice, and a pinch of finely ground black pepper to a smooth, pourable cream — ground meal only, since nut pieces stay off the menu until age 4-5.',
          'Steam the broccoli for 8-10 minutes, until tender, and cook the pasta for 10-12 minutes, until soft.',
          'Toss everything through the cream off the heat and serve family-style, with no added salt in the pan.',
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
      { foodSlug: 'potato', quantityNote: '1 medium potato, green patches and sprouts trimmed away' },
      { foodSlug: 'peas', quantityNote: '1/2 cup frozen or fresh peas' },
      { foodSlug: 'dill', quantityNote: 'a few soft fronds, snipped very finely and stirred in at the end' },
    ],
    extraIngredients: [
      { name: 'olive oil', quantityNote: 'a drizzle of' },
      { name: 'breast milk, formula, or water, to loosen' },
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
          'Stir the finely snipped dill through off the heat, then loosen the mash with a little breast milk, formula, or water until it is soft and spoonable rather than stiff or gluey.',
          'Cool to just-warm and serve on a pre-loaded spoon with the potato wedge alongside, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'A rougher mash, with pea-to-bite-sized soft pieces of potato on the tray for pincer practice.',
        steps: [
          'Scrub and chunk the potato, cutting away any green patches or sprouts — the skin can stay on once baby handles it well.',
          'Steam or boil the chunks for 12-15 minutes, until they mash easily between two fingers, cooking the peas with them for the last 3-4 minutes, until soft.',
          'Mash most of it roughly with a drizzle of olive oil, squashing every pea flat, and cut a little of the potato into pea-to-bite-sized soft pieces for the tray.',
          'Stir the finely snipped dill through off the heat, then serve just warm, with no added salt.',
        ],
      },
      '12': {
        textureNote: 'A family-style loose mash with small bite-sized pieces of potato through it, still completely salt-free.',
        steps: [
          'Scrub and chunk the potato, cutting away any green patches or sprouts, then steam or boil it for 12-15 minutes, until it mashes easily between two fingers.',
          'Cook the peas with it for the last 3-4 minutes, until soft, then drain everything.',
          'Mash it loosely with a drizzle of olive oil — broken up just enough to eat, never beaten until it turns gluey — squashing the peas flat, since a whole pea stays the riskier option.',
          'Stir the finely snipped dill through off the heat and serve family-style in small bite-sized spoonfuls, with no added salt in the pan.',
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
      { foodSlug: 'beef', quantityNote: '1/2 cup lean minced beef' },
      { foodSlug: 'potato', quantityNote: '1 medium potato, peeled, green patches and sprouts trimmed away' },
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
          'A soft, loose mash of potato and carrot with very finely minced beef stirred through, moist enough to need no chewing.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant — garlic is always cooked, never raw.',
          'Brown the minced beef with it over medium heat for 5-7 minutes, breaking it up very small, until no pink is left and it reads 160°F (71°C) on a thermometer.',
          'Add the skinned, deseeded tomato and a splash of water or no-salt-added stock, then simmer over low heat for 12-15 minutes, until the beef is very tender and the sauce has thickened.',
          'Steam or boil the potato and carrot for 12-15 minutes, until both mash easily between two fingers — carrot is never served raw or firm.',
          'Mash the potato and carrot together with a drizzle of olive oil, loose rather than stiff, and stir the beef sauce through it.',
          'Cool to just-warm and serve on a pre-loaded spoon, moist enough that nothing needs chewing, with no added salt.',
        ],
      },
      '9': {
        textureNote: 'A rougher mash with soft, pea-sized pieces of beef and pea-to-bite-sized potato on the tray.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Brown the minced beef with it over medium heat for 5-7 minutes, until no pink is left and it reads 160°F (71°C) on a thermometer.',
          'Add the skinned, deseeded tomato and a little water or no-salt-added stock, then simmer over low heat for 12-15 minutes, until the beef is soft and shreds easily into pea-sized pieces.',
          'Steam or boil the potato and carrot for 12-15 minutes, until they mash easily between two fingers, then mash most of it roughly and keep a few pea-to-bite-sized soft pieces for the tray.',
          'Spoon the beef over the mash, cool to just-warm, and serve with no added salt.',
        ],
      },
      '12': {
        textureNote: 'Family-style cottage mash, in small bite-sized pieces of soft beef, potato and carrot.',
        steps: [
          'Soften the minced garlic in a little olive oil over medium-low heat for 2-3 minutes, until fragrant.',
          'Brown the minced beef over medium heat for 5-7 minutes, until it reads 160°F (71°C) on a thermometer, then add the skinned, deseeded tomato and a little no-salt-added stock.',
          'Simmer over low heat for 15-20 minutes, until thick and tender, while you steam or boil the potato and carrot for 12-15 minutes, until fork-tender.',
          'Mash the potato and carrot loosely with a drizzle of olive oil — never beaten until it turns gluey — spoon the beef over the top, and serve family-style in small bite-sized pieces, with no added salt in the pan.',
        ],
      },
    },
  },
]
