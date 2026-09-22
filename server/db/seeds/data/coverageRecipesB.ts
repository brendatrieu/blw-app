import type { RecipeSeed } from './types'

// Recipe-coverage batch B (ledger item 339). Nineteen of the thirty-nine curated recipes that
// bring every catalog food up to the owner's minimum — three recipes per food, two per spice,
// counted over recipe_ingredients links. Design and coverage proof:
// .workflow/scratch/recipe-coverage/design.md
//
// Every foodSlug here is load-bearing: the proof in design.md §6 leaves most foods sitting
// exactly ON their minimum, so dropping or swapping an ingredient puts a food back below it.
// Re-run coverage-proof.mts before changing any ingredient list.
//
// The same safety rules the rest of the catalog follows apply throughout: no honey at any age,
// no added salt or sugar, every cooking step carries a method, a temperature (ovens in °F with
// °C alongside; stovetop as "over medium heat"), a time range, and the doneness cue that settles
// it — beef/pork/lamb 160°F (71°C), poultry 165°F (74°C), fish and shrimp 145°F (63°C). Nuts and
// seeds are ground to a fine meal or bought hulled, butters are thinned runny, and every one of
// them goes in cold or off the heat — nothing here toasts a seed or bakes a nut into a batter.
export const coverageRecipesB: RecipeSeed[] = [
  {
    slug: 'mango-cashew-breakfast-bowl',
    title: 'Mango & Cashew Butter Breakfast Bowl',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'yogurt', quantityNote: '1/2 cup plain whole-milk yogurt' },
      { foodSlug: 'mango', quantityNote: '1/2 ripe mango, peeled and mashed or finely diced' },
      { foodSlug: 'cashew_butter', quantityNote: '1 tablespoon smooth unsalted cashew butter, whisked runny with warm water' },
      { foodSlug: 'hemp_seeds', quantityNote: '1 teaspoon hulled hemp hearts' },
    ],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin the cashew butter', quantityNote: 'a splash of' }],
    variants: {
      '6': {
        textureNote:
          'A loose, spoonable bowl with the mango mashed smooth through the yogurt, plus one finger-length strip of ripe mango to hold.',
        steps: [
          'Whisk the cashew butter with a splash of warm water, breast milk, or formula until it is completely runny and pours off the spoon — thick nut butter straight from the jar is a serious choking hazard.',
          'Peel the mango, mash half of it smooth, and cut the rest into a finger-length strip baby can hold and gnaw.',
          'Stir the yogurt, mashed mango, and runny cashew butter together until no thick pocket of nut butter is left anywhere in the bowl.',
          'Sprinkle the hemp hearts over the wet bowl so they cling rather than scatter, and serve on a pre-loaded spoon with the mango strip alongside.',
        ],
      },
      '9': {
        textureNote: 'Thick yogurt with pea-to-bite-sized soft mango pieces baby can pick up with a pincer grasp.',
        steps: [
          'Whisk the cashew butter with a splash of warm water until it is runny enough to drip off the spoon.',
          'Peel the mango and dice it into pea-to-bite-sized soft pieces, choosing fruit that is fully ripe rather than firm and slippery.',
          'Stir the runny cashew butter right through the yogurt, then fold the mango pieces in.',
          'Stir the hemp hearts through so they soften, and serve with a spoon for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'A family-style yogurt bowl with small bite-sized mango pieces.',
        steps: [
          'Whisk the cashew butter with a splash of warm water until runny — thin it even now, and never offer a thick spoonful.',
          'Peel the mango and dice it into small bite-sized pieces.',
          'Stir the cashew butter evenly through the yogurt so no glob remains, then fold the mango in.',
          'Sprinkle the hemp hearts over the top and let baby manage the bowl with a spoon.',
        ],
      },
    },
  },
  {
    slug: 'orange-pistachio-yogurt-bowl',
    title: 'Orange & Pistachio Yogurt Bowl',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'yogurt', quantityNote: '1/2 cup plain whole-milk yogurt' },
      { foodSlug: 'orange', quantityNote: '2 orange segments, membrane and pith removed, finely chopped' },
      { foodSlug: 'pistachios', quantityNote: '1 teaspoon shelled unsalted pistachios, ground to a fine meal' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch, stirred right through the yogurt' },
    ],
    variants: {
      '6': {
        textureNote:
          'Smooth yogurt with finely chopped orange stirred through, plus one membrane-free segment split in half lengthwise to hold.',
        steps: [
          'Peel the orange segments right down to the juicy flesh, taking off every scrap of peel, pith, membrane, and seed — the membrane is the part that is tough to manage.',
          'Chop one segment very finely and stir it through the yogurt, and split the second segment in half lengthwise to hand over as a piece to suck on.',
          'Grind the pistachios to a fine, flour-like meal and stir the meal through the bowl until nothing gritty is left; whole and chopped nuts stay off the menu until age 4-5.',
          'Stir a pinch of cinnamon right into the yogurt rather than dusting it over the top, where loose powder is easy to inhale, and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Thick yogurt with small, membrane-free orange pieces for pincer-grasp self-feeding.',
        steps: [
          'Remove all membrane and seeds from the orange and cut the flesh into small pieces baby can pick up between finger and thumb.',
          'Stir the finely ground pistachio meal and a pinch of cinnamon through the yogurt until both are evenly mixed in.',
          'Fold half the orange through and leave the rest loose on the tray for pincer practice.',
          'Serve with a spoon alongside, sitting with baby through the meal.',
        ],
      },
      '12': {
        textureNote: 'A family-style yogurt bowl with small bite-sized orange pieces.',
        steps: [
          'Remove the membrane and seeds and cut the orange segments into smaller bite-sized pieces.',
          'Stir the finely ground pistachio meal and a pinch of cinnamon through the yogurt, keeping to the meal rather than any chopped nut.',
          'Fold the orange through and serve with a spoon.',
        ],
      },
    },
  },
  {
    slug: 'watermelon-strawberry-basil-cups',
    title: 'Watermelon, Strawberry & Basil Cups',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'watermelon', quantityNote: '1 cup seedless watermelon' },
      { foodSlug: 'strawberry', quantityNote: '3 strawberries, hulled' },
      { foodSlug: 'basil', quantityNote: '2 leaves, chopped very finely' },
    ],
    variants: {
      '6': {
        textureNote:
          'Finger-length watermelon sticks thick enough to grip, with the strawberries quartered lengthwise so no round berry shape is left.',
        steps: [
          'Cut the rind off the watermelon, check it over carefully for seeds, and cut it into finger-length sticks that are not too thin to grip.',
          'Hull the strawberries and quarter them lengthwise, so no whole or halved round berry shape remains, or mash them if baby prefers a spoon.',
          'Chop the basil as finely as you can and scatter it over the wet fruit — a whole leaf is slippery enough to fold over the airway, so never serve one.',
          'Pile the fruit into a small cup and sit with baby throughout: melon is slippery, so keep every piece a size that can be gummed.',
        ],
      },
      '9': {
        textureNote: 'Pea-to-bite-sized watermelon pieces with finely diced strawberry, loose in a cup for pincer-grasp practice.',
        steps: [
          'Remove all rind and seeds from the watermelon and dice it into pea-to-bite-sized pieces.',
          'Hull the strawberries and quarter or finely dice them so no round or half-berry shape is left.',
          'Toss the fruit with the very finely chopped basil, never a whole leaf.',
          'Serve in a shallow cup for pincer-grasp self-feeding, sitting with baby throughout.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized fruit pieces, family-style, with finely chopped basil through them.',
        steps: [
          'Remove the rind and seeds and dice the watermelon into small bite-sized pieces.',
          'Hull the strawberries and quarter or thinly slice them, still avoiding a whole round berry.',
          'Toss everything with the finely chopped basil and serve with a fork or fingers, sitting with baby throughout — melon stays slippery at this age too.',
        ],
      },
    },
  },
  {
    slug: 'pear-hazelnut-compote',
    title: 'Warm Pear & Hazelnut Compote',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    fridgeHoursOverride: 48,
    ingredients: [
      { foodSlug: 'pear', quantityNote: '1 ripe pear, peeled, cored, and diced' },
      { foodSlug: 'hazelnuts', quantityNote: '1 teaspoon skinned hazelnuts, ground to a fine meal' },
      { foodSlug: 'yogurt', quantityNote: '1/4 cup plain whole-milk yogurt' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch, cooked in with the pear' },
    ],
    variants: {
      '6': {
        textureNote: 'A smooth, thick fruit mash swirled through yogurt, loose enough to scoop from a pre-loaded spoon.',
        steps: [
          'Peel, core, and dice the pear, then simmer it with a splash of water and a pinch of cinnamon over low heat for 6-8 minutes, until it collapses and mashes easily between two fingers.',
          'Mash the compote smooth and leave it to cool to just-warm — stewed fruit holds heat far longer than it looks.',
          'Grind the hazelnuts to a fine, flour-like meal and stir a teaspoon of it through the cooled compote until nothing gritty is left; whole and chopped nuts stay off the menu until age 4-5.',
          'Spoon the yogurt into a bowl, swirl the pear compote through it, and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Yogurt with soft, pea-to-bite-sized pear pieces that squash easily between two fingers.',
        steps: [
          'Peel, core, and dice the pear into pea-to-bite-sized pieces, then simmer them with a splash of water and a pinch of cinnamon over low heat for 5-6 minutes, until they squash easily between two fingers but still hold their shape.',
          'Cool to just-warm, then stir in a teaspoon of hazelnuts ground to a fine meal.',
          'Spoon the yogurt into a bowl and fold the pear through it.',
          'Serve with a spoon, leaving a few pear pieces loose on the tray for pincer-grasp practice.',
        ],
      },
      '12': {
        textureNote: 'Family-style yogurt with small bite-sized pieces of soft stewed pear.',
        steps: [
          'Peel, core, and dice the pear into small bite-sized pieces, then simmer them with a splash of water and a pinch of cinnamon over low heat for 4-5 minutes, until tender.',
          'Cool to just-warm and stir the finely ground hazelnut meal through, keeping to the meal — whole and chopped nuts stay off the menu.',
          'Spoon the compote over the yogurt and serve, with a spoon and fingers both welcome.',
        ],
      },
    },
  },
  {
    slug: 'no-bake-sunflower-oat-fingers',
    title: 'No-Bake Sunflower Oat Fingers',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    fridgeHoursOverride: 72,
    freezerDaysOverride: 90,
    ingredients: [
      { foodSlug: 'oats', quantityNote: '3/4 cup rolled oats, half of them blitzed to a flour' },
      { foodSlug: 'sunflower_seed_butter', quantityNote: '3 tablespoons smooth unsalted sunflower seed butter, thinned until runny' },
      { foodSlug: 'banana', quantityNote: '1 very ripe banana, mashed' },
      { foodSlug: 'pecans', quantityNote: '1 tablespoon pecans, ground to a fine meal' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch, mixed through' },
    ],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin the seed butter', quantityNote: 'a splash of' }],
    variants: {
      '6': {
        textureNote: 'Soft chilled fingers, about the length and thickness of an adult finger, that squish easily between two fingers.',
        steps: [
          'Blitz half the rolled oats to a flour and keep the rest whole — use rolled or quick oats, never steel-cut or jumbo, which stay firm and chewy however long they sit.',
          'Whisk the sunflower seed butter with a splash of warm water until it is completely runny, then mash the very ripe banana into it with a pinch of cinnamon.',
          'Grind the pecans to a fine, flour-like meal, stir them in with both lots of oats, and leave the mixture to stand for 15 minutes so the oats swell and go soft rather than staying dry.',
          'Press the mixture firmly into a small lined tin and chill it for 1-2 hours, until it is firm enough to cut cleanly.',
          'Cut into finger-length fingers, check one squishes easily between two fingers, and serve with baby sitting upright and supervised throughout.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces broken from a chilled finger, easy to pick up with a pincer grasp.',
        steps: [
          'Blitz half the rolled oats to a flour and leave the rest whole, using rolled or quick oats only.',
          'Whisk the sunflower seed butter runny with warm water, mash in the very ripe banana and a pinch of cinnamon, and stir through the oats and the finely ground pecan meal.',
          'Let the mixture stand for 15 minutes so the oats soften, then press it into a lined tin and chill for 1-2 hours until firm.',
          'Break a finger into soft, pea-sized pieces and serve them loose on the tray for self-feeding, sitting with baby throughout.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of a soft chilled finger, or a whole finger to bite from.',
        steps: [
          'Blitz half the rolled oats to a flour and leave the rest whole, whisk the sunflower seed butter runny with a splash of warm water, mash in the very ripe banana and a pinch of cinnamon, and stir in the pecans ground to a fine meal.',
          'Stand it for 15 minutes so the oats soften, press it into a lined tin, and chill for 1-2 hours until firm enough to cut.',
          'Cut into small bite-sized pieces, or hand over a whole finger to bite from with supervision.',
          'Pair with a vitamin-C side such as orange segments with the membrane removed.',
        ],
      },
    },
  },
  {
    slug: 'tuna-avocado-hemp-toast',
    title: 'Tuna & Avocado Toast with Hemp',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'tuna', quantityNote: '2 tablespoons skipjack ("light") tuna canned in water, drained' },
      { foodSlug: 'avocado', quantityNote: '1/4 ripe avocado' },
      { foodSlug: 'hemp_seeds', quantityNote: '1 teaspoon hulled hemp hearts' },
      { foodSlug: 'wheat_toast', quantityNote: '1 slice bread' },
    ],
    variants: {
      '6': {
        textureNote: 'Finger-length strips of soft, moistened bread under a thin layer of smooth tuna-and-avocado mash.',
        steps: [
          'Choose skipjack ("light") tuna canned in water with no salt added — never albacore, white, or bigeye, which carry far more mercury — and drain it well.',
          'Mash the tuna thoroughly with the ripe avocado until it is smooth and wet, with no dry, crumbly lumps left to pack into a dense ball in the mouth.',
          'Toast the bread for 1-2 minutes, until lightly golden, then brush it with a little water so it bends without snapping and cut it into finger-length strips.',
          'Spread a thin layer of the mash over each strip and sprinkle the hemp hearts onto the wet mash so they cling rather than scatter.',
          'Keep tuna to about one small serving a week while baby is under two.',
        ],
      },
      '9': {
        textureNote: 'Small moistened bread squares topped with a thin layer of mash, sized for a pincer grasp.',
        steps: [
          'Drain skipjack ("light") tuna canned in water — never albacore, white, or bigeye — and mash it smooth with the ripe avocado.',
          'Toast the bread for 1-2 minutes, until lightly golden, then moisten it and cut it into small squares.',
          'Spread a thin layer of the mash over each square and stir or sprinkle the hemp hearts through it.',
          'Serve for pincer-grasp self-feeding, keeping tuna to about one small serving a week while baby is under two.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized squares or triangles with a thin layer of tuna-and-avocado mash.',
        steps: [
          'Drain skipjack ("light") tuna canned in water, sticking to a no-salt-added can, and mash it smooth with the ripe avocado.',
          'Toast the bread for 1-2 minutes, until golden, and cut it into small bite-sized squares or triangles.',
          'Spread the mash thinly over each piece, sprinkle the hemp hearts over, and serve.',
          'Keep tuna to about one small serving a week while baby is under two.',
        ],
      },
    },
  },
  {
    slug: 'turkey-sweet-potato-pepper-hash',
    title: 'Turkey, Sweet Potato & Pepper Hash',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'turkey', quantityNote: '225g (8oz) ground turkey' },
      { foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato, peeled and finely diced' },
      { foodSlug: 'bell_pepper', quantityNote: '1/2 bell pepper, finely diced' },
      { foodSlug: 'paprika', quantityNote: 'a pinch of sweet (mild) paprika, stirred in as it cooks' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'A moist hash pressed into a thin patty and cut into finger-length strips that squish easily between two fingers.',
        steps: [
          'Peel the tough outer skin from the bell pepper with a vegetable peeler, then dice it and the peeled sweet potato as finely as you can.',
          'Warm a little olive oil in a pan and cook the sweet potato and pepper over medium heat for 8-10 minutes, stirring in a pinch of sweet (mild) paprika as they soften, until the pepper is completely tender.',
          'Add the ground turkey, break it up well, and cook over medium heat for 7-8 minutes more, until the sweet potato is fork-tender and the turkey reads 165°F (74°C) with no pink left.',
          'Mash the pan well with a fork so the soft sweet potato binds the mince, and stir through a little more olive oil — lean ground turkey turns dry and crumbly on its own.',
          'Cool to just-warm, press the hash into a thin patty, and cut it into finger-length strips, checking one squishes easily between two fingers.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces of vegetable and mince, loose on the tray for a pincer grasp.',
        steps: [
          'Peel the tough skin from the bell pepper and dice it and the peeled sweet potato into pea-sized pieces.',
          'Cook them in a little olive oil over medium heat for 8-10 minutes with a pinch of sweet (mild) paprika, until the pepper is completely tender.',
          'Add the ground turkey and cook over medium heat for 7-8 minutes more, until the sweet potato squashes easily between two fingers and the turkey reads 165°F (74°C) with no pink left.',
          'Stir in a little olive oil to keep the mince moist, cool to just-warm, and serve loose on the tray for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized pieces, served family-style straight from the pan.',
        steps: [
          'Peel the tough skin from the bell pepper and dice it with the peeled sweet potato into small bite-sized pieces.',
          'Cook them in a little olive oil over medium heat for 8-10 minutes with a pinch of sweet (mild) paprika, until tender.',
          'Add the ground turkey and cook over medium heat for 7-8 minutes more, until it reads 165°F (74°C) with no pink left.',
          'Stir in a little olive oil so the mince stays moist, cool to just-warm, and serve with no added salt, letting baby practice with a fork.',
        ],
      },
    },
  },
  {
    slug: 'pork-apple-squash-tray-bake',
    title: 'Pork with Apple & Butternut Squash',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'pork', quantityNote: '225g (8oz) pork loin or shoulder' },
      { foodSlug: 'apple', quantityNote: '1 apple, peeled, cored, and diced' },
      { foodSlug: 'butternut_squash', quantityNote: '1 cup butternut squash, peeled' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch, tossed through the squash before it goes in the oven' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'A finger-length wedge of soft squash beside a pile of finely shredded pork, moistened with the pan juices.',
        steps: [
          'Peel the butternut squash and cut it into finger-length wedges, peel, core, and dice the apple, and toss both with a little olive oil and a pinch of cinnamon.',
          'Trim every scrap of fat and gristle from the pork, sit it on the tray with the squash and apple, and roast at 400°F (200°C) for 25-30 minutes, until the squash mashes easily between two fingers, the apple has collapsed, and the pork reads 160°F (71°C) with no pink left.',
          'Shred the pork very finely against the grain and moisten it well with the pan juices — pork turns chewy the moment it dries out.',
          'Mash the apple into some of the squash, keeping one soft wedge whole for baby to hold.',
          'Cool to just-warm and serve the shredded pork in a soft pile beside the wedge.',
        ],
      },
      '9': {
        textureNote: 'Pea-to-bite-sized cubes of soft squash and apple with pea-sized pieces of shredded pork.',
        steps: [
          'Peel and cube the butternut squash, peel, core, and dice the apple, and toss both with a little olive oil and a pinch of cinnamon.',
          'Trim the pork of all fat and gristle and roast everything together at 400°F (200°C) for 25-30 minutes, until the squash is fork-tender and the pork reads 160°F (71°C) with no pink left.',
          'Finely chop or shred the pork into soft, pea-sized pieces and moisten it with the pan juices.',
          'Cut the squash and apple into pea-to-bite-sized soft cubes, cool to just-warm, and serve everything loose for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized pieces of pork, squash, and apple, served family-style.',
        steps: [
          'Peel and cube the squash, dice the peeled apple, and toss both with a little olive oil and a pinch of cinnamon.',
          'Roast them with the trimmed pork at 400°F (200°C) for 25-30 minutes, until the squash is tender and the pork reads 160°F (71°C) with no pink left.',
          'Dice or shred the pork into small, soft bite-sized pieces and moisten it with the pan juices.',
          'Cool to just-warm and serve everything together with no added salt, letting baby practice with a fork.',
        ],
      },
    },
  },
  {
    slug: 'pork-carrot-ragu',
    title: 'Mild Pork & Carrot Ragu',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'pork', quantityNote: '225g (8oz) ground pork' },
      { foodSlug: 'carrot', quantityNote: '1 carrot, peeled and finely grated' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced, or 200g passata with no added salt' },
      { foodSlug: 'oregano', quantityNote: 'a pinch of dried oregano, rubbed fine between your fingers' },
      { foodSlug: 'wheat_pasta', quantityNote: '60g pasta shapes' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'Large pasta shapes served whole as finger food, thickly coated in a smooth ragu that mashes easily.',
        steps: [
          'Warm a little olive oil in a pan and brown the ground pork over medium heat for 5-6 minutes, breaking it up as it goes, until no pink is left on the outside.',
          'Stir in the finely grated carrot, the skinned and diced tomato, and a pinch of dried oregano rubbed fine between your fingers, then simmer covered over low heat for 25-30 minutes, until the carrot has melted into the sauce and the pork is well past 160°F (71°C) and falls apart under a fork.',
          'Boil the pasta over medium heat for 12-14 minutes, well past al dente, until a shape squashes easily between two fingers.',
          'Mash the ragu smooth enough to gum, then turn the large shapes through it so each one is thickly coated.',
          'Cool to just-warm and serve the coated shapes whole as finger food, with a little sauce on a pre-loaded spoon alongside.',
        ],
      },
      '9': {
        textureNote: 'Small soft pasta shapes in a ragu with pea-sized pieces of mince, sized for a pincer grasp.',
        steps: [
          'Brown the ground pork in a little olive oil over medium heat for 5-6 minutes, breaking it up finely.',
          'Add the grated carrot, the skinned and diced tomato, and a pinch of finely rubbed dried oregano, then simmer covered over low heat for 25-30 minutes, until the carrot has melted in and the pork is well past 160°F (71°C) and soft enough to squash.',
          'Boil small pasta shapes over medium heat for 12-14 minutes, past al dente, until they squash easily between two fingers.',
          'Stir the pasta through the ragu, cool to just-warm, and serve loose on the tray for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style soft pasta in a tender ragu, small bite-sized pieces throughout.',
        steps: [
          'Brown the ground pork in a little olive oil over medium heat for 5-6 minutes.',
          'Add the grated carrot, tomato, and a pinch of finely rubbed oregano, then simmer covered over low heat for 25-30 minutes, until the sauce is thick and the pork is well past 160°F (71°C) and tender.',
          'Boil the pasta over medium heat for 10-12 minutes, until tender, and stir it through the sauce.',
          'Cool to just-warm and serve family-style with no added salt, with a fork for baby to practice with.',
        ],
      },
    },
  },
  {
    slug: 'lamb-squash-chickpea-tagine',
    title: 'Mild Lamb & Butternut Squash Tagine',
    minAgeMonths: 6,
    prepMinutes: 130,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lamb', quantityNote: '225g (8oz) lamb shoulder, diced' },
      { foodSlug: 'butternut_squash', quantityNote: '1 cup butternut squash, peeled and cubed' },
      { foodSlug: 'chickpeas', quantityNote: '1/2 cup cooked no-salt-added chickpeas, rinsed' },
      { foodSlug: 'cumin', quantityNote: 'a pinch, warmed in the pan first' },
      { foodSlug: 'cinnamon', quantityNote: 'a pinch, warmed in the pan first' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'A thick, scoopable mash of slow-cooked lamb and squash, with every chickpea crushed flat.',
        steps: [
          'Warm a pinch each of ground cumin and cinnamon in a little olive oil over medium heat for 30-60 seconds, until they smell fragrant rather than raw.',
          'Add the diced lamb shoulder and enough water to cover, then simmer covered over low heat for 1½-2 hours, until the lamb pulls apart under a fork and is well past 160°F (71°C).',
          'Stir in the cubed butternut squash and the rinsed chickpeas for the last 20-25 minutes, simmering over low heat until the squash falls apart under a fork.',
          'Crush every chickpea flat so none keeps its round shape, shred the lamb finely, and feel through it for bone fragments before any of it goes near baby.',
          'Mash everything into a thick, scoopable mash, cool to just-warm, and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces of shredded lamb and squash with the chickpeas squashed flat.',
        steps: [
          'Warm a pinch each of cumin and cinnamon in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Add the lamb and water to cover and simmer covered over low heat for 1½-2 hours, until the lamb shreds under a fork and is well past 160°F (71°C), adding the squash and chickpeas for the last 20-25 minutes, until the squash is soft enough to squash between two fingers.',
          'Squash each chickpea flat between your fingers, shred the lamb into soft, pea-sized pieces, and check by feel for bone fragments.',
          'Mash lightly so some soft texture is left, cool to just-warm, and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style tagine with small, soft bite-sized pieces of lamb and squash.',
        steps: [
          'Warm a pinch each of cumin and cinnamon in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Add the lamb and water to cover and simmer covered over low heat for 1½-2 hours, until it is tender and well past 160°F (71°C), adding the squash and chickpeas for the last 20-25 minutes.',
          'Squash the chickpeas flat between finger and thumb, dice or shred the lamb into small, soft bite-sized pieces, and feel through it for bone fragments.',
          'Cool to just-warm and serve family-style with no added salt, with soft rice alongside if you like.',
        ],
      },
    },
  },
  {
    slug: 'lamb-keema-peas-rice',
    title: 'Mild Lamb Keema with Peas',
    minAgeMonths: 6,
    prepMinutes: 35,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'lamb', quantityNote: '225g (8oz) ground lamb' },
      { foodSlug: 'peas', quantityNote: '1/2 cup peas' },
      { foodSlug: 'tomato', quantityNote: '2 tomatoes, skinned and diced' },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice, to serve' },
      { foodSlug: 'turmeric', quantityNote: 'a small pinch, cooked in with the lamb' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'A soft, well-mashed keema beside a sticky rice patty, with every pea squashed flat.',
        steps: [
          'Warm a small pinch of ground turmeric in a little olive oil over medium heat for 30-60 seconds, then add the ground lamb and brown it over medium heat for 5-6 minutes, breaking it up as it goes.',
          'Stir in the skinned, diced tomato and simmer over low heat for 20-25 minutes, until the tomato has broken down and the lamb is well past 160°F (71°C) and soft enough to mash.',
          'Add the peas for the last 5 minutes, then squash each one flat between your fingers so no whole round pea is left.',
          'Cook the rice over low heat for 15-18 minutes, until it is very soft and sticky, then press it into a soft patty rather than serving loose grains.',
          'Mash the keema well, cool to just-warm, and serve it spooned beside the rice patty, feeling through the lamb for bone fragments first.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces of mince with squashed peas and loose rice grains for pincer practice.',
        steps: [
          'Warm a small pinch of turmeric in a little olive oil over medium heat for 30-60 seconds, then brown the ground lamb over medium heat for 5-6 minutes.',
          'Stir in the skinned, diced tomato and simmer over low heat for 20-25 minutes, until the lamb is well past 160°F (71°C) and the sauce is thick, adding the peas for the last 5 minutes.',
          'Squash each pea flat between finger and thumb and check the mince by feel for bone fragments.',
          'Cook the rice over low heat for 15-18 minutes, until soft, then cool everything to just-warm before serving the rice as loose grains beside the keema for pincer-grasp practice.',
        ],
      },
      '12': {
        textureNote: 'Family-style keema with small bite-sized pieces, served over soft rice.',
        steps: [
          'Warm a small pinch of turmeric in a little olive oil over medium heat for 30-60 seconds, then brown the ground lamb over medium heat for 5-6 minutes.',
          'Add the skinned, diced tomato and simmer over low heat for 20-25 minutes, until thick and well past 160°F (71°C), adding the peas for the last 5 minutes.',
          'Squash the peas flat before serving — whole soft peas are fine in small amounts now, but squashing stays the safer default.',
          'Cook the rice over low heat for 15-18 minutes, until soft, cool everything to just-warm, spoon the keema over it, and reheat any leftovers only once.',
        ],
      },
    },
  },
  {
    slug: 'trout-dill-yogurt-toast',
    title: 'Trout & Dill Yogurt Smash on Toast',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'trout', quantityNote: '115g (4oz) trout fillet' },
      { foodSlug: 'yogurt', quantityNote: '2 tablespoons plain whole-milk yogurt' },
      { foodSlug: 'dill', quantityNote: 'a little, fronds snipped finely' },
      { foodSlug: 'wheat_toast', quantityNote: '1 slice bread' },
    ],
    variants: {
      '6': {
        textureNote: 'Finger-length strips of soft, moistened bread under a thin layer of smooth trout-and-yogurt smash.',
        steps: [
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until it is opaque and flakes easily at 145°F (63°C).',
          'Flake it into a bowl and run your fingers through every flake twice — trout carries a row of fine pin bones that survive cooking, even in a fillet sold as deboned.',
          'Let the fish cool, then mash it smooth with the yogurt and a little finely snipped dill, using the soft fronds only and none of the stringy stalks.',
          'Toast the bread for 1-2 minutes, until lightly golden, then moisten it with a little water so it bends without snapping and cut it into finger-length strips.',
          'Spread a thin layer of the smash over each strip and serve, sitting with baby throughout.',
        ],
      },
      '9': {
        textureNote: 'Small moistened bread squares under a thin layer of smash, sized for a pincer grasp.',
        steps: [
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then flake it and check every flake by feel for pin bones, twice.',
          'Cool the fish and mash it with the yogurt and finely snipped dill fronds into a soft, spreadable smash.',
          'Toast the bread for 1-2 minutes, until lightly golden, moisten it, and cut it into small squares.',
          'Spread the smash thinly over each square and serve for pincer-grasp self-feeding, sitting with baby throughout.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized squares or triangles with a thin layer of trout-and-yogurt smash.',
        steps: [
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then flake it and feel through it twice for pin bones.',
          'Cool the fish and mash it with the yogurt and finely snipped dill fronds, keeping the tough stalks out.',
          'Toast the bread for 1-2 minutes, until golden, cut it into small bite-sized squares, and spread the smash thinly over each one.',
          'Pair with a vitamin-C side such as tomato quartered lengthwise, or orange segments with the membrane removed, and sit with baby throughout.',
        ],
      },
    },
  },
  {
    slug: 'trout-carrot-ginger-rice-bowl',
    title: 'Trout, Carrot & Ginger Rice Bowl',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: true,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'trout', quantityNote: '115g (4oz) trout fillet' },
      { foodSlug: 'carrot', quantityNote: '1 carrot, peeled and finely grated' },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice' },
      { foodSlug: 'ginger', quantityNote: 'a small pinch, peeled and finely grated, cooked in' },
      { foodSlug: 'cilantro', quantityNote: 'a small amount, chopped very finely and stirred in at the end' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'A soft, sticky rice patty with sweet grated carrot through it and flakes of trout folded in.',
        steps: [
          'Peel and finely grate the carrot, and grate a small pinch of fresh ginger on the fine side of a grater — never a slice, a coin, or a chunk, which stay stringy.',
          'Soften the carrot and ginger in a little olive oil over medium heat for 5-6 minutes, until the carrot is completely tender and mashes easily between two fingers.',
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then flake it and feel through it twice for fine pin bones.',
          'Cook the rice over low heat for 15-18 minutes, until it is very soft and sticky, then stir the carrot through it and press it into a soft patty.',
          'Fold the flaked trout in, stir a little very finely chopped cilantro through off the heat, and serve cooled to just-warm.',
        ],
      },
      '9': {
        textureNote: 'Loose, soft rice grains with pea-sized flakes of trout and tender grated carrot.',
        steps: [
          'Finely grate the peeled carrot and a small pinch of fresh ginger, and soften them in a little olive oil over medium heat for 5-6 minutes, until the carrot is completely tender.',
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then flake it into soft, pea-sized pieces, checking for pin bones twice.',
          'Cook the rice over low heat for 15-18 minutes, until soft, and stir the carrot through it.',
          'Fold the trout in, stir very finely chopped cilantro through off the heat, cool to just-warm, and serve as loose grains for pincer-grasp practice.',
        ],
      },
      '12': {
        textureNote: 'Family-style soft rice with small bite-sized flakes of trout and tender carrot.',
        steps: [
          'Finely grate the peeled carrot and a small pinch of ginger and soften them in a little olive oil over medium heat for 5-6 minutes, until tender.',
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then flake it into small bite-sized pieces and check for pin bones twice.',
          'Cook the rice over low heat for 15-18 minutes, until soft, stir the carrot through, and fold in the trout with very finely chopped cilantro off the heat.',
          'Cool to just-warm and pair with a vitamin-C side such as orange segments with the membrane removed, reheating any leftover rice only once.',
        ],
      },
    },
  },
  {
    slug: 'garlic-shrimp-peas-rice',
    title: 'Garlicky Shrimp with Peas & Rice',
    minAgeMonths: 9,
    prepMinutes: 25,
    ironFocus: false,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'shrimp', quantityNote: '115g (4oz) raw peeled shrimp, deveined' },
      { foodSlug: 'peas', quantityNote: '1/2 cup peas' },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice' },
      { foodSlug: 'garlic', quantityNote: '1/2 small clove, finely minced and softened in the pan' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      // Shellfish is held to 9 months and introduced last on the allergen
      // ladder, so this recipe carries no 6-month variant.
      '9': {
        textureNote: 'Soft rice with squashed peas and small, pea-sized pieces of thoroughly cooked shrimp.',
        steps: [
          'Soften half a small clove of finely minced garlic in a little olive oil over medium heat for 30-60 seconds, until it smells sweet rather than raw — garlic is never served raw.',
          'Peel, devein, and rinse the shrimp, then cook them in the garlicky oil over medium heat for 3-4 minutes, turning once, until they are pink, opaque, and curled right through at 145°F (63°C).',
          'Chop the shrimp finely into small, pea-sized pieces — a whole shrimp is rubbery and hard to bite through.',
          'Steam the peas for 4-5 minutes, until soft, then squash each one flat between finger and thumb so no whole round pea is left.',
          'Cook the rice over low heat for 15-18 minutes, until soft, fold the peas and shrimp through, and serve cooled to just-warm.',
        ],
      },
      '12': {
        textureNote: 'Family-style soft rice with small bite-sized pieces of shrimp and tender peas.',
        steps: [
          'Soften the finely minced garlic in a little olive oil over medium heat for 30-60 seconds, until fragrant.',
          'Cook the peeled, deveined shrimp in the garlicky oil over medium heat for 3-4 minutes, until pink, opaque, and curled at 145°F (63°C), then chop them into small bite-sized pieces.',
          'Steam the peas for 4-5 minutes, until tender, squashing them flat as the safer default.',
          'Cook the rice over low heat for 15-18 minutes, until soft, fold everything through, and serve fresh with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'shrimp-zucchini-soft-pasta',
    title: 'Shrimp & Zucchini Soft Pasta',
    minAgeMonths: 9,
    prepMinutes: 25,
    ironFocus: false,
    fridgeHoursOverride: 24,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'shrimp', quantityNote: '115g (4oz) raw peeled shrimp, deveined' },
      { foodSlug: 'wheat_pasta', quantityNote: '60g small pasta shapes' },
      { foodSlug: 'zucchini', quantityNote: '1 small zucchini, grated' },
      { foodSlug: 'black_pepper', quantityNote: 'a small pinch, finely ground, cooked in' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      // Shellfish is held to 9 months and introduced last on the allergen
      // ladder, so this recipe carries no 6-month variant.
      '9': {
        textureNote: 'Small soft pasta shapes in melted zucchini, with pea-sized pieces of shrimp through them.',
        steps: [
          'Boil small pasta shapes over medium heat for 12-14 minutes, well past al dente, until a shape squashes easily between two fingers.',
          'Grate the zucchini and soften it in a little olive oil over medium heat for 4-5 minutes with a small pinch of finely ground black pepper, until it has collapsed and turned completely tender.',
          'Peel, devein, and rinse the shrimp, then cook them over medium heat for 3-4 minutes, until pink, opaque, and curled at 145°F (63°C).',
          'Chop the shrimp finely into small, pea-sized pieces rather than serving a whole one, which is rubbery and hard to bite through.',
          'Turn the pasta through the zucchini with the shrimp, cool to just-warm, and serve loose on the tray for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style soft pasta with small bite-sized pieces of shrimp and tender zucchini.',
        steps: [
          'Boil the pasta over medium heat for 10-12 minutes, until tender and soft right through.',
          'Soften the grated zucchini in a little olive oil over medium heat for 4-5 minutes with a small pinch of finely ground black pepper, until completely tender.',
          'Cook the peeled, deveined shrimp over medium heat for 3-4 minutes, until pink, opaque, and curled at 145°F (63°C), then chop them into small bite-sized pieces.',
          'Turn everything together and serve fresh with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'tuna-pea-tomato-pasta-salad',
    title: 'Tuna, Pea & Tomato Pasta Salad',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'tuna', quantityNote: '2 tablespoons skipjack ("light") tuna canned in water, drained' },
      { foodSlug: 'wheat_pasta', quantityNote: '60g pasta shapes' },
      { foodSlug: 'peas', quantityNote: '1/2 cup peas' },
      { foodSlug: 'tomato', quantityNote: '1 tomato, skinned and diced, or quartered lengthwise if served as pieces' },
      { foodSlug: 'basil', quantityNote: '2 leaves, chopped very finely' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'Cool, very soft large pasta shapes served whole as finger food, coated in a smooth tuna mash with squashed peas.',
        steps: [
          'Boil the pasta over medium heat for 12-14 minutes, well past al dente, until a large shape squashes easily between two fingers, then drain it and let it cool.',
          'Steam the peas for 4-5 minutes, until soft, then squash each one flat so no whole round pea is left.',
          'Skin the tomato, take out the seeds if they are large, and chop the soft flesh small; chop the basil as finely as you can, never a whole leaf.',
          'Drain skipjack ("light") tuna canned in water — never albacore, white, or bigeye, which carry far more mercury — and mash it smooth with a little olive oil so it is not dry and crumbly.',
          'Stir the tuna, peas, tomato, and basil through the cooled pasta, serve the large shapes whole as finger food, and keep tuna to about one small serving a week while baby is under two.',
        ],
      },
      '9': {
        textureNote: 'Cool small pasta shapes with squashed peas and pea-sized dollops of mashed tuna, sized for a pincer grasp.',
        steps: [
          'Boil small pasta shapes over medium heat for 12-14 minutes, past al dente, until they squash easily between two fingers, then drain and cool them.',
          'Steam the peas for 4-5 minutes, until soft, and squash each one flat between finger and thumb.',
          'Quarter the tomato lengthwise and pull off any tough skin, or dice the soft flesh small, and chop the basil very finely.',
          'Mash drained skipjack ("light") tuna smooth with a little olive oil, stir everything through the cooled pasta, and keep tuna to about one small serving a week while baby is under two.',
        ],
      },
      '12': {
        textureNote: 'A cool family-style pasta salad in small bite-sized pieces.',
        steps: [
          'Boil the pasta over medium heat for 10-12 minutes, until tender, then drain and cool it.',
          'Steam the peas for 4-5 minutes, until tender, squashing them flat as the safer default.',
          'Quarter the tomato lengthwise or dice it into small bite-sized pieces, skin removed if tough, and chop the basil finely.',
          'Mash drained skipjack ("light") tuna with a little olive oil, stir it all through the pasta, and keep tuna to about one small serving a week while baby is under two.',
        ],
      },
    },
  },
  {
    slug: 'pistachio-basil-pesto-pasta',
    title: 'Pistachio & Basil Pesto Pasta',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'wheat_pasta', quantityNote: '60g pasta shapes' },
      { foodSlug: 'pistachios', quantityNote: '2 tablespoons shelled unsalted pistachios, ground to a fine meal' },
      { foodSlug: 'basil', quantityNote: 'a small handful, chopped very finely' },
      { foodSlug: 'peas', quantityNote: '1/2 cup peas' },
      { foodSlug: 'cheese', quantityNote: '2 tablespoons mild pasteurized cheese, finely grated' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'Large pasta shapes served whole as finger food, coated in a smooth green pesto with squashed peas over the top.',
        steps: [
          'Grind the shelled, unsalted pistachios to a fine, flour-like meal — whole and chopped nuts stay off the menu until age 4-5.',
          'Steam the peas for 4-5 minutes, until soft, then squash each one flat and set half of them aside for the pesto.',
          'Blend the pistachio meal, the very finely chopped basil, the finely grated mild cheese, half the squashed peas, and a drizzle of olive oil into a smooth, loose pesto with nothing gritty left and no salt at all.',
          'Boil the pasta over medium heat for 12-14 minutes, well past al dente, until a shape squashes easily between two fingers, then drain it and let it cool for a minute.',
          'Stir the pesto through the drained pasta off the heat, so the cheese and pistachio meal never meet the pan, top with the remaining squashed peas, and serve the large shapes whole as finger food.',
        ],
      },
      '9': {
        textureNote: 'Small soft pasta shapes in a smooth green pesto with squashed peas, sized for a pincer grasp.',
        steps: [
          'Grind the pistachios to a fine, flour-like meal and blend it with the very finely chopped basil, the grated mild cheese, and a drizzle of olive oil into a loose pesto.',
          'Steam the peas for 4-5 minutes, until soft, and squash each one flat between finger and thumb.',
          'Boil small pasta shapes over medium heat for 12-14 minutes, past al dente, until they squash easily between two fingers, then drain them and let them cool.',
          'Stir the pesto and peas through the pasta off the heat, cool to just-warm, and serve loose on the tray for self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Family-style soft pasta in a green pesto, small bite-sized pieces throughout.',
        steps: [
          'Grind the pistachios to a fine meal and blend it with the finely chopped basil, the grated mild cheese, and a drizzle of olive oil into a loose pesto — still the meal, never a chopped nut.',
          'Steam the peas for 4-5 minutes, until tender, squashing them flat as the safer default.',
          'Boil the pasta over medium heat for 10-12 minutes, until tender, then drain it and let it cool.',
          'Stir the pesto and peas through off the heat, cool to just-warm, and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'dukkah-roasted-squash',
    title: 'Roasted Squash with Hazelnut Dukkah',
    minAgeMonths: 6,
    prepMinutes: 40,
    ironFocus: false,
    fridgeHoursOverride: 48,
    freezerDaysOverride: 60,
    ingredients: [
      { foodSlug: 'butternut_squash', quantityNote: '1 small butternut squash, peeled' },
      { foodSlug: 'hazelnuts', quantityNote: '1 tablespoon skinned hazelnuts, ground to a fine meal' },
      { foodSlug: 'sesame_seeds', quantityNote: '1 teaspoon sesame seeds' },
      { foodSlug: 'pumpkin_seeds', quantityNote: '1 tablespoon hulled pumpkin seeds, ground to a fine meal' },
      { foodSlug: 'cumin', quantityNote: 'a pinch, tossed through the squash before it goes in the oven' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'Finger-length wedges of soft squash that mash easily between two fingers, dusted with a fine, untoasted dukkah.',
        steps: [
          'Peel the butternut squash, cut it into finger-length wedges, and toss them with a little olive oil and a pinch of ground cumin.',
          'Roast at 400°F (200°C) for 25-30 minutes, until a wedge is fork-tender and mashes easily between two fingers.',
          'Grind the skinned hazelnuts and the hulled pumpkin seeds to a fine, flour-like meal, then stir the sesame seeds through them — the dukkah stays raw and never goes near the oven or the pan.',
          'While the squash is still out and wet with its oil, sprinkle a little dukkah over it so it clings rather than scattering, and never hand over a spoonful of the dry mix.',
          'Cool to just-warm and serve the wedges for baby to hold.',
        ],
      },
      '9': {
        textureNote: 'Pea-to-bite-sized soft squash cubes with a fine dukkah clinging to them.',
        steps: [
          'Peel and cube the butternut squash and toss it with a little olive oil and a pinch of ground cumin.',
          'Roast at 400°F (200°C) for 20-25 minutes, until the cubes are fork-tender and squash easily between two fingers.',
          'Grind the hazelnuts and hulled pumpkin seeds to a fine meal and stir the sesame seeds through, leaving the mix raw.',
          'Cut the squash into pea-to-bite-sized soft cubes, sprinkle the dukkah over while they are still oily so it clings, cool to just-warm, and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized squash pieces, family-style, under a fine dukkah.',
        steps: [
          'Peel and cube the butternut squash and toss it with a little olive oil and a pinch of ground cumin.',
          'Roast at 400°F (200°C) for 20-25 minutes, until tender.',
          'Grind the hazelnuts and hulled pumpkin seeds to a fine meal, stir the sesame seeds in, and keep the mix raw — ground meal only, never a whole or chopped nut or seed.',
          'Dice the squash into small bite-sized pieces, cool to just-warm, sprinkle the dukkah over the oily pieces, and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'mango-black-bean-rice-bowl',
    title: 'Mango & Black Bean Rice Bowl',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: true,
    fridgeHoursOverride: 24,
    ingredients: [
      { foodSlug: 'black_beans', quantityNote: '1/2 cup cooked no-salt-added black beans, rinsed' },
      { foodSlug: 'mango', quantityNote: '1/2 ripe mango, peeled and finely diced' },
      { foodSlug: 'rice', quantityNote: '1/3 cup rice' },
      { foodSlug: 'cilantro', quantityNote: 'a small amount, chopped very finely and stirred in at the end' },
    ],
    extraIngredients: [{ name: 'olive oil' }],
    variants: {
      '6': {
        textureNote: 'A soft, sticky rice ball with mashed beans and mango through it, plus a finger-length strip of ripe mango to hold.',
        steps: [
          'Cook the rice over low heat for 15-18 minutes, until it is very soft and sticky, then press it into a soft ball rather than serving loose grains.',
          'Rinse the black beans well and warm them through in a little olive oil over medium heat for 4-5 minutes, until they are soft enough to squash, then mash every one flat so none keeps its round shape.',
          'Peel the mango, mash half of it smooth, and cut the rest into a finger-length strip baby can hold and gnaw.',
          'Stir the mashed beans, the mashed mango, and a little very finely chopped cilantro through the rice off the heat, so the mango stays fresh and cool.',
          'Cool to just-warm and serve the rice ball with the mango strip alongside.',
        ],
      },
      '9': {
        textureNote: 'Loose, soft rice grains with squashed beans and pea-to-bite-sized mango pieces for a pincer grasp.',
        steps: [
          'Cook the rice over low heat for 15-18 minutes, until soft, and serve it as loose grains for pincer-grasp practice.',
          'Rinse the beans and warm them through in a little olive oil over medium heat for 4-5 minutes, until soft, then squash each one flat between your fingers.',
          'Peel the mango and dice it into pea-to-bite-sized soft pieces, choosing fruit that is fully ripe rather than firm and slippery.',
          'Fold the beans and mango through the rice off the heat with a little very finely chopped cilantro, and serve cooled to just-warm.',
        ],
      },
      '12': {
        textureNote: 'Family-style soft rice with whole soft beans and small bite-sized mango pieces.',
        steps: [
          'Cook the rice over low heat for 15-18 minutes, until soft.',
          'Rinse the beans and warm them through in a little olive oil over medium heat for 4-5 minutes, until they squash easily between two fingers.',
          'Peel the mango and dice it into small bite-sized pieces, then fold it through the rice and beans off the heat with finely chopped cilantro.',
          'Cool to just-warm and serve with no added salt, reheating any leftover rice only once.',
        ],
      },
    },
  },
]
