import type { RecipeSeed } from './types'

// One single-ingredient "Simple <food>" recipe per catalog food (ledger item 253),
// with one exception: `category: 'spice'` foods have NO basic (item 331). A spice
// is a seasoning, not a serving — "Simple cinnamon" would be a recipe for a pinch.
//
// These exist so every food in the catalog has an obvious "just serve the food"
// entry point: the steps EXPAND that food's own prep text for the stage
// (wash / cook / cut / serve / check the temperature) and repeat its
// chokingNotes caution wherever it applies. They never introduce guidance the
// food row does not already carry, and they never contradict it.
//
// Conventions:
//  - slug   `simple-<food slug with dashes>`; title `Simple <lowercase name>`
//  - minAgeMonths mirrors the food's own (only shrimp is 9)
//  - ironFocus is false everywhere — the read path derives it from the
//    ingredient's ironLevel, so a curated claim would only duplicate that
//  - variants cover every stage the food allows: a 6-month food gets 6/9/12,
//    shrimp gets 9/12
//  - extraIngredients appear only where the food's prep text calls for one
//    (thinning liquid, a little oil, something to moisten toast)
//
// Cook detail (ledger item 265). Every step that cooks states the method, a
// temperature, a time RANGE, and the doneness cue that actually settles it:
//  - ovens in °F with °C in parentheses; stovetop as "over medium heat" style
//    with a pan cue where it helps
//  - meat/poultry/fish/egg cite the USDA/FDA safe minimum internal temperature
//    (ground/well-done beef 160°F/71°C, poultry 165°F/74°C, fish and shrimp
//    145°F/63°C or opaque and flaking, eggs until yolk and white are firm,
//    egg-set dishes 160°F/71°C, reheated leftovers 165°F/74°C)
//  - produce uses "fork-tender" / "mashes easily between two fingers", matching
//    the food's own prep wording; pasta at 6 months is al dente then a few
//    minutes more, per the wheat-pasta prep text
//  - foods served raw (banana, avocado, yogurt, cheese, nut butters, tahini,
//    soft fruit, canned tuna, every seed and every ground nut) get NO cook
//    step — not even the word "toast", which the guard reads as a cook verb
// Sources: .workflow/scratch/recipe-detail/sources.md
export const basicRecipes: RecipeSeed[] = [
  {
    slug: 'simple-beef',
    title: 'Simple beef',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    ingredients: [{ foodSlug: 'beef', quantityNote: '55g (2oz) lean beef — a thin-cut steak or lean ground beef' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A finger-length strip of well-done beef cut along the grain, or a moist pile of very finely minced beef.',
        steps: [
          'Cook the beef well-done with no added salt — pan-fry a thin steak over medium heat for 4-5 minutes a side, or shape ground beef into a thin patty and bake it at 350°F (180°C) for 20-25 minutes — until a thermometer in the thickest part reads 160°F (71°C) and no pink remains.',
          'Rest it for 3-5 minutes, then cut a finger-length strip along the grain so it holds together, or mince it very finely.',
          'Moisten the strip or the mince with a little olive oil or cooking liquid so it is never dry or stringy.',
          'Dense or dry meat is hard to gum into a swallowable piece, so keep it moist and tender and shred it finely against the grain if it feels tough.',
          'Cool to just-warm, check the temperature, and serve with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces of finely chopped or shredded well-done beef.',
        steps: [
          'Cook the beef well-done over medium heat, about 4-5 minutes a side, until it reads 160°F (71°C) with no pink left, then rest it for 3-5 minutes until it is cool enough to handle.',
          'Finely chop or shred it into soft, pea-sized pieces baby can pick up with a pincer grasp.',
          'Stir through a little olive oil or cooking liquid so the pieces stay moist rather than dry and stringy.',
          'Serve just-warm on a plate and stay with baby through the meal.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized pieces of tender, slow-cooked beef.',
        steps: [
          'Choose a cut that goes tender when slow-cooked and simmer it covered over low heat for 2-3 hours, or bake it at 325°F (160°C) for the same, until it is well past 160°F (71°C) and pulls apart easily with a fork.',
          'Dice it into small, soft bite-sized pieces baby can chew with emerging molars.',
          'Spoon over a little cooking liquid so nothing is dry, and discard any tough or gristly bits.',
          'Serve just-warm and let baby practice with fingers or a fork.',
        ],
      },
    },
  },
  {
    slug: 'simple-chicken-thigh',
    title: 'Simple chicken thigh',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: false,
    ingredients: [{ foodSlug: 'chicken_thigh', quantityNote: '1 small boneless, skinless chicken thigh (about 55g)' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A finger-length strip of thoroughly cooked dark meat, or finely shredded thigh moistened so it is not dry.',
        steps: [
          'Trim away any tough skin, fat, or gristle, and check the thigh carefully for small bones.',
          'Cook it thoroughly with no added salt — bake at 400°F (200°C) for 18-22 minutes, or poach at a bare simmer for 12-15 minutes — until a thermometer in the thickest part reads 165°F (74°C) and the juices run clear.',
          'Rest it for 5 minutes, then cut a finger-length strip of the dark meat, or shred it finely, and moisten with a little olive oil or cooking liquid.',
          'Check once more for small bones as you plate it.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized shredded or chopped pieces for pincer-grasp practice.',
        steps: [
          'Bake the trimmed thigh at 400°F (200°C) for 18-22 minutes, until it reads 165°F (74°C) all the way through, then rest it for 5 minutes until it is cool enough to handle.',
          'Shred or chop it into soft, pea-sized pieces, feeling for any small bones as you go.',
          'Moisten with a little olive oil or cooking liquid so the pieces are not dry.',
          'Serve just-warm for baby to self-feed.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized dice of thoroughly cooked thigh.',
        steps: [
          'Bake the trimmed thigh at 400°F (200°C) for 18-22 minutes, until it reads 165°F (74°C) with clear juices, and rest it for 5 minutes.',
          'Dice it into small, soft bite-sized pieces, discarding any tough skin, fat, or gristle.',
          'Check the pieces for small bones one last time before they reach the plate.',
          'Serve just-warm with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-salmon',
    title: 'Simple salmon',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'salmon', quantityNote: '55g (2oz) skinless salmon fillet' }],
    variants: {
      '6': {
        textureNote: 'A soft, finger-length piece of just-cooked salmon, flaked and checked bone by bone.',
        steps: [
          'Bake the salmon at 375°F (190°C) for 10-12 minutes, or poach it at a bare simmer for 8-10 minutes, until it is opaque right through and flakes under gentle pressure — 145°F (63°C) on a thermometer.',
          'Run your fingers through every flake to feel for pin bones and remove them all — a missed bone is a real hazard, even in a pre-deboned fillet.',
          'Press the checked flakes gently back together into a soft, finger-length piece baby can hold.',
          'Cool to just-warm, check the temperature, and serve with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized flakes of cooked salmon.',
        steps: [
          'Bake the salmon at 375°F (190°C) for 10-12 minutes, until it is opaque and separates easily with a fork at 145°F (63°C), then flake it into soft, pea-sized pieces.',
          'Re-check every flake by feel for stray pin bones before it reaches the plate.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized flakes, or a small piece of fillet for baby to pick apart.',
        steps: [
          'Bake the salmon at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then let it cool to just-warm.',
          'Flake it into small bite-sized pieces, or leave a small piece of fillet for baby to pick apart.',
          'Feel through the fish for pin bones one last time — always check, even from a deboned fillet.',
          'Serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-sardines',
    title: 'Simple sardines',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'sardines', quantityNote: '1-2 boneless sardines canned in water' }],
    variants: {
      '6': {
        textureNote: 'A soft mashed pile of boneless sardines, smooth enough to scoop from a pre-loaded spoon.',
        steps: [
          'Choose boneless sardines canned in water — already cooked in the can, so nothing here needs heat — and drain them well.',
          'Check by feel for any remaining small, soft bones — boneless varieties can still hide one.',
          'Mash thoroughly with a fork until no lumps or firm pieces remain.',
          'Serve as a soft mashed pile for dipping, or pre-load a spoon and hand it to baby, sitting with them throughout.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized mashed or flaked pieces.',
        steps: [
          'Drain boneless sardines and double-check them by feel for any small bones.',
          'Mash or flake them into soft, pea-sized pieces.',
          'Serve on a plate for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized flakes, family-style.',
        steps: [
          'Drain boneless sardines, checking once more for any small bones.',
          'Flake them into small bite-sized pieces.',
          'Serve with no added salt alongside whatever else is on the plate.',
        ],
      },
    },
  },
  {
    slug: 'simple-egg',
    title: 'Simple egg',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'egg', quantityNote: '1 whole egg' }],
    extraIngredients: [{ name: 'breast milk, formula, or water, to loosen', quantityNote: 'a splash of' }],
    variants: {
      '6': {
        textureNote: 'Well-cooked whole egg mashed and loosened, or a soft scrambled pile.',
        steps: [
          'Cook the whole egg fully — hard-boil it for 10-12 minutes from the boil, or scramble it over low heat for 3-4 minutes, stirring — until both the yolk and the white are firm with no runny egg left.',
          'Mash the cooked egg and loosen it with a little breast milk, formula, or water, or leave it as a soft scrambled pile.',
          'Cool to just-warm and check the temperature before it reaches baby.',
          'Serve on a pre-loaded spoon or as a small pile baby can scoop at.',
        ],
      },
      '9': {
        textureNote: 'Soft scrambled pieces, or firm omelet cut into pea-sized pieces.',
        steps: [
          'Cook the egg fully: scramble it over low heat for 3-4 minutes, or set a thin omelet in a lightly oiled pan over medium-low heat for 2-3 minutes a side, until the yolk and white are firm and the centre reads 160°F (71°C).',
          'Cut or break it into pea-sized pieces for pincer-grasp self-feeding.',
          'Cool to just-warm and serve on a plate.',
        ],
      },
      '12': {
        textureNote: 'Bite-sized omelet pieces, a halved hard-boiled egg, or scrambled egg.',
        steps: [
          'Cook the egg fully — an omelet over medium-low heat for 2-3 minutes a side, a hard-boiled egg for 10-12 minutes, or scrambled over low heat for 3-4 minutes — until the yolk and white are firm with no runny egg left.',
          'Cut an omelet into bite-sized pieces, or halve a hard-boiled egg.',
          'Serve just-warm with no added salt, letting baby use fingers or a fork.',
        ],
      },
    },
  },
  {
    slug: 'simple-lentils',
    title: 'Simple lentils',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: false,
    ingredients: [{ foodSlug: 'lentils', quantityNote: '1/4 cup dried red lentils (about 1/2 cup cooked)' }],
    extraIngredients: [{ name: 'water, for cooking and thinning' }],
    variants: {
      '6': {
        textureNote: 'A smooth, thinned lentil puree loose enough to scoop.',
        steps: [
          'Rinse the lentils, then simmer them in plenty of unsalted water over low heat for 15-20 minutes, until they collapse and mash easily against the side of the pan.',
          'Drain off the excess water and mash or blend until smooth.',
          'Thin with a little of the cooking water until the puree is scoopable rather than stiff.',
          'Cool to just-warm, check the temperature, and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'A soft lentil mash with some texture left in it.',
        steps: [
          'Simmer the rinsed lentils over low heat for 15-20 minutes, until they squash easily between two fingers, then drain them well.',
          'Mash lightly, leaving some texture rather than a smooth puree.',
          'Cool to just-warm and serve in a bowl with a spoon for baby to practice with.',
        ],
      },
      '12': {
        textureNote: 'Soft cooked lentils served in small spoonfuls.',
        steps: [
          'Simmer the rinsed lentils over low heat for 15-20 minutes, until soft, and drain them.',
          'Serve as-is in small spoonfuls, or stir them through whatever soup, stew, or grain bowl is on the table.',
          'Serve just-warm with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-chickpeas',
    title: 'Simple chickpeas',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'chickpeas', quantityNote: '1/3 cup cooked or no-salt-added canned chickpeas' }],
    extraIngredients: [{ name: 'water or olive oil, to loosen', quantityNote: 'a little' }],
    variants: {
      '6': {
        textureNote: 'A smooth, mashed hummus-style chickpea spread — no whole chickpeas and no loose skins.',
        steps: [
          'Simmer soaked dried chickpeas over low heat for 45-60 minutes, until one squashes easily between two fingers, or rinse no-salt-added canned chickpeas and warm them through for 2-3 minutes.',
          'Blend or mash them completely smooth, loosening with a little water or olive oil.',
          'Whole chickpeas and their loose skins are a choking risk at this age, so check the spread for any unblended piece or skin and remove it.',
          'Serve as a soft spread on a pre-loaded spoon, at room temperature or just-warm.',
        ],
      },
      '9': {
        textureNote: 'Lightly mashed chickpeas, or each one squeezed out of its skin and flattened between your fingers.',
        steps: [
          'Simmer soaked dried chickpeas over low heat for 45-60 minutes, or rinse canned ones and warm them for 2-3 minutes, until each squashes easily between two fingers.',
          'Mash lightly for some texture, or squeeze each chickpea out of its skin and flatten it between your fingers.',
          'Never leave a whole, round chickpea on the plate — always mash, squash flat, or blend.',
          'Serve just-warm for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Chickpeas squashed flat between finger and thumb one by one, or fully blended into hummus.',
        steps: [
          'Simmer soaked dried chickpeas over low heat for 45-60 minutes, or rinse canned ones and warm them for 2-3 minutes, until soft.',
          'Squash each one flat between finger and thumb before it goes on the plate, or blend them fully into hummus or a mild curry.',
          'Round, firm whole chickpeas stay a choking hazard, so squash or blend rather than serving them whole.',
          'Serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-black-beans',
    title: 'Simple black beans',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'black_beans', quantityNote: '1/3 cup cooked or no-salt-added canned black beans' }],
    extraIngredients: [{ name: 'water, to loosen the mash', quantityNote: 'a little' }],
    variants: {
      '6': {
        textureNote: 'Well-mashed black beans with no whole, round bean left.',
        steps: [
          'Simmer soaked dried black beans over low heat for 60-90 minutes, until one squashes easily between two fingers, or rinse no-salt-added canned beans and warm them through for 2-3 minutes.',
          'Mash them well, squashing every bean flat so no whole, round bean remains — whole beans can be firm enough to pose a choking risk.',
          'Loosen with a little water if the mash is stiff.',
          'Cool to just-warm and serve on a pre-loaded spoon.',
        ],
      },
      '9': {
        textureNote: 'Lightly mashed or individually squashed beans with some soft texture left.',
        steps: [
          'Simmer soaked dried beans over low heat for 60-90 minutes, or rinse canned beans and warm them for 2-3 minutes, until they are very soft.',
          'Mash lightly, or squash each bean flat between your fingers, leaving some soft texture.',
          'Squash or mash rather than serving beans fully whole and round.',
          'Serve just-warm for baby to pick up.',
        ],
      },
      '12': {
        textureNote: 'Whole cooked beans soft enough to squash easily between two fingers.',
        steps: [
          'Cook the beans until one squashes easily between two fingers — 60-90 minutes at a low simmer for dried, or 2-3 minutes to warm rinsed canned beans through — and test one before serving.',
          'Serve them soft and whole in a bowl, or mixed through rice or another soft food.',
          'If any bean still feels firm, squash it flat before it goes on the plate.',
          'Serve just-warm with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-tofu',
    title: 'Simple tofu',
    minAgeMonths: 6,
    prepMinutes: 12,
    ironFocus: false,
    ingredients: [{ foodSlug: 'tofu', quantityNote: '1/4 block (about 60g) firm tofu' }],
    extraIngredients: [{ name: 'oil for the pan', quantityNote: 'a little' }],
    variants: {
      '6': {
        textureNote: 'Finger-length strips of firm tofu, lightly pan-fried so they are easy to grip.',
        steps: [
          'Drain the firm tofu and pat it dry with a clean towel.',
          'Cut it into finger-length strips baby can hold with some poking out of the fist.',
          'Pan-fry the strips in a little oil over medium heat — wait until the oil shimmers before they go in — for 3-4 minutes a side, until the outside is firm and pale gold and the inside stays soft.',
          'Unfried tofu can be slippery, and that light crust is what helps little hands grip it.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized cubes, pan-fried or baked for grip.',
        steps: [
          'Drain and pat the tofu dry, then cut it into pea-to-bite-sized cubes.',
          'Pan-fry them over medium heat for 2-3 minutes a side, or bake at 400°F (200°C) for 15-18 minutes, until the outside is dry and firm rather than slippery to hold.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized cubes, soft inside with a lightly crisp outside.',
        steps: [
          'Cut the drained, patted-dry tofu into small bite-sized cubes.',
          'Pan-fry over medium heat for 2-3 minutes a side, or coat lightly in crumbs and bake at 400°F (200°C) for 15-18 minutes, until the outside is lightly crisp and the inside stays soft.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-iron-fortified-oats',
    title: 'Simple iron-fortified oats',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: false,
    ingredients: [{ foodSlug: 'iron_fortified_oats', quantityNote: '3 tablespoons iron-fortified rolled or baby oats' }],
    extraIngredients: [{ name: 'breast milk, formula, or water' }],
    variants: {
      '6': {
        textureNote: 'A smooth, thinned porridge loose enough to drip slowly off a spoon.',
        steps: [
          'Cook the oats with breast milk, formula, or water over medium-low heat for 4-5 minutes, stirring, until the grains are soft and the porridge is smooth.',
          'Thin the porridge until it drips slowly off a spoon rather than sitting in a stiff lump.',
          'Stir well to release hot spots, cool to just-warm, and check the temperature.',
          'Serve on a pre-loaded spoon and let baby bring it to their mouth.',
        ],
      },
      '9': {
        textureNote: 'A thicker, spoonable porridge with some texture, or stirred into oat-based bites.',
        steps: [
          'Cook the oats with breast milk, formula, or water over medium-low heat for 4-5 minutes, to a thicker, spoonable consistency.',
          'Leave a little texture rather than cooking it completely smooth.',
          'Cool to just-warm and serve in a bowl with a spoon for baby to practice self-feeding.',
        ],
      },
      '12': {
        textureNote: 'A thick, family-style porridge.',
        steps: [
          'Cook the oats over medium-low heat for 5-6 minutes, adding liquid a splash at a time, until thick and family-style.',
          'Stir to release hot spots, cool to just-warm, and check the temperature.',
          'Serve unsweetened with a spoon — no added sugar, and no honey before 12 months.',
        ],
      },
    },
  },
  {
    slug: 'simple-spinach',
    title: 'Simple spinach',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'spinach', quantityNote: '1 large handful of fresh spinach leaves' }],
    variants: {
      '6': {
        textureNote: 'Cooked spinach chopped very finely and stirred through a mash or another soft food — never a whole leaf.',
        steps: [
          'Wash the spinach well, then steam it for 2-3 minutes, or wilt it in a covered pan over medium heat for 1-2 minutes, until the leaves are dark and completely limp.',
          'Squeeze out the excess water and chop it very finely.',
          'Whole cooked leaves are slippery and hard to chew, so always chop finely rather than serving leaves whole.',
          'Stir the chopped spinach through a soft food baby is already eating — a mash, a soft grain, or egg — and serve just-warm.',
        ],
      },
      '9': {
        textureNote: 'Finely chopped cooked spinach folded through a mash, a fritter, or another soft food.',
        steps: [
          'Steam the washed spinach for 2-3 minutes, or wilt it over medium heat for 1-2 minutes, until completely limp, then squeeze it dry.',
          'Chop it finely — still no whole leaves.',
          'Mix it into a mash, an egg dish, or a fritter so baby can pick the pieces up.',
          'Cool to just-warm and serve.',
        ],
      },
      '12': {
        textureNote: 'Chopped wilted spinach as a small side, or mixed through the dish.',
        steps: [
          'Wash the spinach and wilt it over medium heat for 1-2 minutes, until limp, then squeeze out the water.',
          'Chop it and serve as a small side, or stir it through the rest of the meal.',
          'Keep it cut rather than serving whole leaves, and serve just-warm.',
        ],
      },
    },
  },
  {
    slug: 'simple-quinoa',
    title: 'Simple quinoa',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    ingredients: [{ foodSlug: 'quinoa', quantityNote: '1/4 cup dry quinoa (about 3/4 cup cooked)' }],
    extraIngredients: [{ name: 'water, for cooking' }],
    variants: {
      '6': {
        textureNote: 'Soft, sticky quinoa mashed lightly and pressed into a patty rather than served as loose grains.',
        steps: [
          'Rinse the quinoa, then simmer it in water, covered, over low heat for 15-18 minutes — a few minutes past the usual time — until the grains burst and are very soft.',
          'Let it cool slightly, then mash it lightly and press it firmly into a soft patty shape.',
          'Loose cooked grains are small, scatter easily, and are hard for little hands, so serve the patty rather than a pile of grains.',
          'Check it is only just-warm and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft loose grains for pincer-grasp practice, or small pressed bites.',
        steps: [
          'Simmer the rinsed quinoa, covered, over low heat for 15 minutes, then rest it off the heat for 5 minutes and fluff it with a fork — every grain should be soft and translucent.',
          'Serve a small pile of loose grains for pincer-grasp practice, or press some into small bites.',
          'Cool to just-warm before serving.',
        ],
      },
      '12': {
        textureNote: 'Soft cooked grains, or small pressed bites, served alongside the rest of the meal.',
        steps: [
          'Simmer the rinsed quinoa, covered, over low heat for 15 minutes, then rest it off the heat for 5 minutes until the grains are soft and the water is absorbed.',
          'Cool it to just-warm.',
          'Serve as soft cooked grains alongside the other foods on the plate, with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-broccoli',
    title: 'Simple broccoli',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'broccoli', quantityNote: '2-3 broccoli florets' }],
    variants: {
      '6': {
        textureNote: 'Whole steamed florets soft enough to mash between two fingers, with a bit of stem as a handle.',
        steps: [
          'Wash the broccoli and trim it into florets, keeping a bit of stem on each as a handle.',
          'Steam over boiling water for 8-10 minutes, until a floret mashes easily between two fingers — raw or under-cooked broccoli is fibrous and hard to chew.',
          'Test one floret between your fingers before serving; if it resists, steam it for 2-3 minutes more.',
          'Cool to just-warm and hand baby a whole floret to hold by the stem.',
        ],
      },
      '9': {
        textureNote: 'Small pea-to-bite-sized florets, steamed until soft.',
        steps: [
          'Steam the washed florets for 8-10 minutes, until they mash easily between two fingers.',
          'Cut them into smaller, pea-to-bite-sized pieces for pincer-grasp self-feeding.',
          'Cool to just-warm and serve.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized florets, steamed or roasted tender.',
        steps: [
          'Steam the washed florets for 8-10 minutes, or roast them at 400°F (200°C) for 18-20 minutes, until fork-tender.',
          'Cut them into small bite-sized florets.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-bell-pepper',
    title: 'Simple bell pepper',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'bell_pepper', quantityNote: '1/2 bell pepper' }],
    variants: {
      '6': {
        textureNote: 'Soft roasted or steamed strips with any tough skin removed.',
        steps: [
          'Wash the pepper, remove the stem, seeds, and white pith, and cut it into finger-length strips.',
          'Roast the strips at 425°F (220°C) for 15-20 minutes, or steam them for 8-10 minutes, until they are soft and the skin wrinkles and blisters.',
          'Peel away any tough or papery skin before serving — raw pepper skin is tough and hard to bite through.',
          'Cool to just-warm and serve as a finger-length strip.',
        ],
      },
      '9': {
        textureNote: 'Small, soft pea-to-bite-sized pieces of cooked pepper.',
        steps: [
          'Roast deseeded pepper strips at 425°F (220°C) for 15-20 minutes, or steam them for 8-10 minutes, until soft, then peel off any tough skin.',
          'Cut them into small, pea-to-bite-sized pieces.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Softened cooked pieces, or thin raw strips cut small once chewing is confident.',
        steps: [
          'Roast the deseeded pepper at 425°F (220°C) for 15-20 minutes, or steam it for 8-10 minutes, until softened, and remove any tough skin.',
          'Cut it into small pieces; once baby is chewing confidently, thin raw strips cut small can be offered too.',
          'Serve just-warm or at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-strawberry',
    title: 'Simple strawberry',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'strawberry', quantityNote: '2-3 ripe strawberries' }],
    variants: {
      '6': {
        textureNote: 'Lengthwise quarters or a smooth mash — never a whole or halved berry.',
        steps: [
          'Wash the strawberries and pull off the green hull — ripe strawberries are served raw, with no cooking at all.',
          'Quarter each berry lengthwise, or mash it well — a whole or halved strawberry can be round enough to block an airway.',
          'Check that no round or half-berry shape is left on the plate.',
          'Serve at room temperature with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Lengthwise quarters or a fine dice, with no round shape left.',
        steps: [
          'Wash and hull the strawberries.',
          'Quarter them lengthwise or dice them finely so no round or half-berry shape remains.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Quartered lengthwise or thinly sliced, still never whole.',
        steps: [
          'Wash and hull the strawberries.',
          'Quarter them lengthwise or slice them thinly, always avoiding a whole round berry shape.',
          'Serve at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-orange',
    title: 'Simple orange',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'orange', quantityNote: '1 small orange (1-2 segments per serving)' }],
    variants: {
      '6': {
        textureNote: 'A single membrane-free segment split lengthwise, with all peel, pith, and seeds gone.',
        steps: [
          'Peel the orange and pull the segments apart — orange is served raw, so no cooking is needed.',
          'Strip every bit of peel, white pith, and membrane off one segment and pick out any seeds — tough membrane and seeds are the main hazard.',
          'Split the bare segment in half lengthwise so baby can hold it.',
          'Serve at room temperature with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Small, membrane-free segment pieces.',
        steps: [
          'Peel the orange and strip the membrane off each segment down to the juicy flesh.',
          'Pick out any seeds and cut the flesh into small pieces.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Membrane-free segments cut into smaller bite-sized pieces.',
        steps: [
          'Peel each segment down to the flesh and remove all seeds.',
          'Cut the flesh into smaller bite-sized pieces.',
          'Serve at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-kiwi',
    title: 'Simple kiwi',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'kiwi', quantityNote: '1 ripe kiwi' }],
    variants: {
      '6': {
        textureNote: 'Finger-length wedges of soft ripe kiwi, or a half for baby to scoop from.',
        steps: [
          'Choose a ripe kiwi that yields to gentle pressure, and wash the skin before cutting it.',
          'Peel it and cut it into finger-length wedges baby can hold, or halve it and let baby scoop with a spoon.',
          'Ripe kiwi needs no cooking — just check the flesh mashes easily between two fingers before serving.',
          'Serve at room temperature with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized dice of ripe kiwi.',
        steps: [
          'Wash and peel the ripe kiwi.',
          'Dice it into pea-to-bite-sized soft pieces.',
          'Serve for pincer-grasp self-feeding, with water in an open cup alongside.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of ripe kiwi.',
        steps: [
          'Wash and peel the ripe kiwi.',
          'Dice it into small bite-sized pieces.',
          'Serve at room temperature and let baby practice with a fork.',
        ],
      },
    },
  },
  {
    slug: 'simple-mango',
    title: 'Simple mango',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'mango', quantityNote: '1/2 ripe mango' }],
    variants: {
      '6': {
        textureNote: 'Finger-length strips of fully ripe mango.',
        steps: [
          'Choose a fully ripe mango — firm, underripe pieces can be slippery and harder to gum.',
          'Wash and peel it, then cut the flesh away from the stone; ripe mango is served raw.',
          'Cut the flesh into finger-length strips baby can hold and gnaw on.',
          'Serve at room temperature with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized dice of fully ripe mango.',
        steps: [
          'Peel a fully ripe mango and cut the flesh off the stone.',
          'Dice it into pea-to-bite-sized soft pieces.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of ripe mango.',
        steps: [
          'Peel a fully ripe mango and cut it off the stone.',
          'Dice it into small bite-sized pieces.',
          'Serve at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-tomato',
    title: 'Simple tomato',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: false,
    ingredients: [{ foodSlug: 'tomato', quantityNote: '1 small tomato' }],
    variants: {
      '6': {
        textureNote: 'Soft cooked tomato mashed, or a small raw tomato quartered lengthwise.',
        steps: [
          'Wash the tomato, then either simmer it over medium-low heat for 8-10 minutes, until it collapses and mashes easily between two fingers, or keep it raw.',
          'Slip off the skin — a 30-second dip in just-boiled water loosens it — and scoop out the seeds if they are large.',
          'Mash the cooked flesh, or if you are serving it raw, quarter the tomato lengthwise — a whole or halved tomato is a classic choking hazard because of its round, slippery shape and skin.',
          'Serve just-warm or at room temperature, never whole or halved.',
        ],
      },
      '9': {
        textureNote: 'Lengthwise quarters with tough skin removed, or soft cooked dice.',
        steps: [
          'Wash the tomato and remove any tough skin.',
          'Quarter it lengthwise — never whole or halved — or simmer it over medium-low heat for 8-10 minutes, until soft, and dice it.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Lengthwise quarters or a small dice.',
        steps: [
          'Wash the tomato and peel it if the skin is tough.',
          'Quarter it lengthwise, or dice it into small bite-sized pieces; to serve it soft instead, simmer the dice over medium-low heat for 8-10 minutes, until it collapses.',
          'Serve at room temperature with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-sweet-potato',
    title: 'Simple sweet potato',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    ingredients: [{ foodSlug: 'sweet_potato', quantityNote: '1 small sweet potato' }],
    variants: {
      '6': {
        textureNote: 'A finger-length wedge cooked until it mashes easily between two fingers.',
        steps: [
          'Wash and peel the sweet potato and cut it into thick, finger-length wedges.',
          'Steam or boil for 12-15 minutes, or roast at 400°F (200°C) for 25-30 minutes, until a wedge mashes easily between two fingers.',
          'Test one wedge between your fingers before serving; if it resists, cook it for 5 minutes more.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized cubes of cooked sweet potato.',
        steps: [
          'Peel and cube the sweet potato, then steam or boil it for 10-12 minutes, until a cube mashes easily between two fingers.',
          'Cut it into pea-to-bite-sized soft cubes for pincer-grasp self-feeding.',
          'Cool to just-warm and serve.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces, roasted or mashed.',
        steps: [
          'Peel and dice the sweet potato, then roast it at 400°F (200°C) for 20-25 minutes, or steam it for 10-12 minutes, until fork-tender.',
          'Serve it as small bite-sized pieces, or mash it if baby prefers a spoon.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-butternut-squash',
    title: 'Simple butternut squash',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: false,
    ingredients: [{ foodSlug: 'butternut_squash', quantityNote: '1 thick slice (about 1 cup cubed) butternut squash' }],
    variants: {
      '6': {
        textureNote: 'A finger-length wedge cooked until it mashes easily between two fingers.',
        steps: [
          'Peel and deseed the squash and cut it into thick, finger-length wedges.',
          'Steam for 12-15 minutes, or roast at 400°F (200°C) for 25-30 minutes, until a wedge mashes easily between two fingers.',
          'Test one wedge between your fingers before serving; if it resists, cook it for 5 minutes more.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized cubes of cooked squash.',
        steps: [
          'Peel, deseed, and cube the squash, then steam it for 10-12 minutes, until a cube mashes easily between two fingers.',
          'Cut it into pea-to-bite-sized soft cubes for pincer-grasp self-feeding.',
          'Cool to just-warm and serve.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of tender squash.',
        steps: [
          'Peel, deseed, and dice the squash, then roast it at 400°F (200°C) for 20-25 minutes, or steam it for 10-12 minutes, until fork-tender.',
          'Cut it into small bite-sized pieces.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-peanut-butter',
    title: 'Simple peanut butter',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'peanut_butter', quantityNote: '1-2 teaspoons smooth peanut butter' }],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin' }],
    variants: {
      '6': {
        textureNote: 'Smooth peanut butter thinned until runny, on a spoon or in a very thin layer on a soft toast finger — never a thick spoonful.',
        steps: [
          'Measure 1-2 teaspoons of smooth peanut butter into a small bowl.',
          'Thin it with warm water, breast milk, or formula, stirring until it is runny rather than thick or sticky.',
          'Thick or sticky peanut butter is a serious choking hazard, so never serve a spoonful straight, and never whole or chopped peanuts.',
          'Offer the thinned mixture on a pre-loaded spoon, in a small amount, at home when you can watch baby for the next couple of hours.',
        ],
      },
      '9': {
        textureNote: 'Runny thinned peanut butter stirred through food, or spread very thinly.',
        steps: [
          'Thin smooth peanut butter with warm water, breast milk, or formula until it is runny.',
          'Stir it into oatmeal or yogurt, or spread a very thin layer on banana or on a toast finger — toast the bread lightly, 1-2 minutes, and moisten it so it bends without snapping.',
          'Keep the layer thin — never a thick glob, and never a spoonful straight.',
          'Serve and stay with baby through the meal.',
        ],
      },
      '12': {
        textureNote: 'Thinned peanut butter used as a spread or dip, still never a thick layer.',
        steps: [
          'Thin smooth peanut butter until runny before using it as a spread or a dip base.',
          'Keep any spread layer thin; thick spoonfuls and globs remain a choking hazard.',
          'Never offer whole or chopped nuts, at any age.',
        ],
      },
    },
  },
  {
    slug: 'simple-almond-butter',
    title: 'Simple almond butter',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'almond_butter', quantityNote: '1-2 teaspoons smooth almond butter' }],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin' }],
    variants: {
      '6': {
        textureNote: 'Smooth almond butter thinned until runny, on a spoon or in a very thin layer on a soft toast finger — never a thick spoonful.',
        steps: [
          'Measure 1-2 teaspoons of smooth almond butter into a small bowl.',
          'Thin it with warm water, breast milk, or formula, stirring until it is runny rather than thick or sticky.',
          'Thick or sticky nut butter is a serious choking hazard, so never serve a spoonful straight, and never whole or chopped nuts.',
          'Offer the thinned mixture on a pre-loaded spoon, in a small amount, at home when you can watch baby for the next couple of hours.',
        ],
      },
      '9': {
        textureNote: 'Runny thinned almond butter stirred through food, or spread very thinly.',
        steps: [
          'Thin smooth almond butter with warm water, breast milk, or formula until it is runny.',
          'Stir it into oatmeal or yogurt, or spread a very thin layer on soft fruit or on a toast finger — toast the bread lightly, 1-2 minutes, and moisten it so it bends without snapping.',
          'Keep the layer thin — never a thick glob, and never a spoonful straight.',
          'Serve and stay with baby through the meal.',
        ],
      },
      '12': {
        textureNote: 'Thinned almond butter used as a spread or dip, still never a thick layer.',
        steps: [
          'Thin smooth almond butter until runny before using it as a spread or a dip base.',
          'Keep any spread layer thin; thick spoonfuls and globs remain a choking hazard.',
          'Never offer whole or chopped nuts, at any age.',
        ],
      },
    },
  },
  {
    slug: 'simple-tahini',
    title: 'Simple tahini',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'tahini', quantityNote: '1 teaspoon tahini' }],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin' }],
    variants: {
      '6': {
        textureNote: 'A teaspoon of tahini thinned until runny and drizzled in a light layer.',
        steps: [
          'Stir 1 teaspoon of tahini with warm water, breast milk, or formula until it is runny.',
          'A thick layer of tahini can stick in the mouth, so thin it well and keep the layer light.',
          'Drizzle it thinly over a soft food baby is already eating, or spread it very thin on a toast finger — toast the bread lightly, 1-2 minutes, and moisten it until it bends.',
          'Offer it in a small amount, at home, when you can watch baby afterwards.',
        ],
      },
      '9': {
        textureNote: 'Thinned tahini stirred through food, or spread in a thin layer.',
        steps: [
          'Thin the tahini with warm water, breast milk, or formula until it is runny.',
          'Stir it through porridge, yogurt, or vegetables, or spread it thinly on a toast finger toasted for 1-2 minutes and softened.',
          'Keep the layer thin rather than a thick paste.',
          'Serve and stay with baby through the meal.',
        ],
      },
      '12': {
        textureNote: 'Thinned tahini used as a dressing or dip base, kept thin rather than a paste.',
        steps: [
          'Thin the tahini until it pours, then use it as a dressing or a dip base.',
          'Keep the layer thin rather than a thick paste, which can stick in the mouth.',
          'Serve alongside soft vegetables or grains.',
        ],
      },
    },
  },
  {
    slug: 'simple-yogurt',
    title: 'Simple whole-milk yogurt',
    minAgeMonths: 6,
    prepMinutes: 3,
    ironFocus: false,
    ingredients: [{ foodSlug: 'yogurt', quantityNote: '2-3 tablespoons plain, unsweetened whole-milk yogurt' }],
    variants: {
      '6': {
        textureNote: 'Plain whole-milk yogurt on a pre-loaded spoon, thick enough for baby to dip fingers into.',
        steps: [
          'Spoon plain, unsweetened, pasteurized whole-milk yogurt into a small bowl — no added sugar, and no honey before 12 months.',
          'Serve it cold, or let it sit until it comes to room temperature, whichever baby prefers; yogurt needs no cooking.',
          'Pre-load a spoon and hand it over, or let baby dip fingers straight into the bowl.',
          'Sit with baby through the meal.',
        ],
      },
      '9': {
        textureNote: 'Plain whole-milk yogurt eaten with a spoon, with mashed fruit stirred through if you like.',
        steps: [
          'Spoon plain, unsweetened whole-milk yogurt into a bowl.',
          'Stir through a little mashed fruit for flavor if you like.',
          'Give baby the spoon and let them practice scooping.',
        ],
      },
      '12': {
        textureNote: 'Plain whole-milk yogurt with soft diced fruit, if you like.',
        steps: [
          'Spoon plain whole-milk yogurt into a bowl.',
          'Stir through soft diced fruit if you like, keeping any round fruit quartered lengthwise.',
          'Serve with a spoon, unsweetened.',
        ],
      },
    },
  },
  {
    slug: 'simple-cheese',
    title: 'Simple cheese',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'cheese', quantityNote: '1 tablespoon of a mild, pasteurized cheese' }],
    variants: {
      '6': {
        textureNote: 'Finely grated cheese, or a very thin soft strip — never a firm cube.',
        steps: [
          'Choose a mild, pasteurized cheese such as mild cheddar or mozzarella — avoid unpasteurized and soft-ripened cheeses.',
          'Grate it finely, or cut a very thin, soft strip; firm cheese cubes are a choking hazard.',
          'Sprinkle the grated cheese over a food baby is already eating, or hand over the thin strip.',
          'Keep the portion small — cheese is salty — and sit with baby through the meal.',
        ],
      },
      '9': {
        textureNote: 'Grated cheese, or small soft pea-sized pieces.',
        steps: [
          'Grate a mild pasteurized cheese, or cut it into small, soft pea-sized pieces.',
          'Never serve firm cubes — grate, shred, or cut thin strips instead.',
          'Serve a small amount for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized soft pieces or thin slices.',
        steps: [
          'Cut a mild pasteurized cheese into small bite-sized soft pieces or thin slices.',
          'Stay away from firm cubes, which remain a choking hazard.',
          'Serve a small portion alongside the rest of the meal.',
        ],
      },
    },
  },
  {
    slug: 'simple-wheat-toast',
    title: 'Simple wheat toast',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'wheat_toast', quantityNote: '1 slice of soft wheat bread' }],
    extraIngredients: [{ name: 'water, whole milk, or a thin smooth spread, to moisten', quantityNote: 'a little' }],
    variants: {
      '6': {
        textureNote: 'Soft, moistened toast fingers that bend without snapping.',
        steps: [
          'Toast a slice of wheat bread lightly, 1-2 minutes, until it is dry to the touch but still pale and flexible — not browned and brittle.',
          'Moisten it with a little water, milk, or a thin smooth spread so it softens and bends without snapping.',
          'Dry, hard toast can crumble into shards or feel scratchy going down, so keep moistening it until it bends without snapping.',
          'Cut it into finger-length strips and serve just-warm.',
        ],
      },
      '9': {
        textureNote: 'Small softened toast squares for pincer-grasp practice.',
        steps: [
          'Toast the bread lightly, 1-2 minutes, then moisten it so it is soft rather than dry and hard.',
          'Cut it into small squares.',
          'Serve just-warm for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized toast squares or triangles.',
        steps: [
          'Toast the bread for 1-2 minutes, until just golden, and cut it into small bite-sized squares or triangles.',
          'Soften it with a thin topping if it is hard or crumbly.',
          'Serve just-warm, plain or lightly topped, with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-wheat-pasta',
    title: 'Simple wheat pasta',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'wheat_pasta', quantityNote: '1/3 cup dry pasta in a large shape (penne or fusilli)' }],
    variants: {
      '6': {
        textureNote: 'Large pasta shapes cooked well past al dente, soft enough to squash between two fingers.',
        steps: [
          'Boil a large shape such as penne or fusilli in plenty of unsalted water, brought to a rolling boil over high heat.',
          'Cook it to al dente — usually 9-11 minutes — then give it 3-4 minutes more, well past al dente, until a piece squashes easily between two fingers.',
          'Drain it, rinse briefly under cool water, and check the temperature.',
          'Serve the shapes whole as a finger food, just-warm.',
        ],
      },
      '9': {
        textureNote: 'Smaller soft shapes for pincer-grasp practice.',
        steps: [
          'Boil the pasta in unsalted water for 10-12 minutes, past al dente, until a piece squashes easily between two fingers.',
          'Use smaller shapes, or cut the cooked shapes down, so baby can pick them up between finger and thumb.',
          'Cool to just-warm and serve.',
        ],
      },
      '12': {
        textureNote: 'Soft cooked pasta, family-style.',
        steps: [
          'Boil the pasta in unsalted water for 9-11 minutes, until tender all the way through.',
          'Serve it as-is, or mixed with a soft sauce or vegetables, with no added salt.',
          'Cool to just-warm before serving.',
        ],
      },
    },
  },
  {
    slug: 'simple-shrimp',
    title: 'Simple shrimp',
    minAgeMonths: 9,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'shrimp', quantityNote: '3-4 raw peeled shrimp' }],
    variants: {
      // Shellfish is held to 9 months and introduced last on the allergen
      // ladder, so this recipe has no 6-month variant at all.
      '9': {
        textureNote: 'Small, pea-sized pieces of thoroughly cooked shrimp — never a whole shrimp.',
        steps: [
          'Peel and devein the shrimp and rinse them well.',
          'Cook them thoroughly — simmer or pan-fry over medium heat for 3-4 minutes, turning once — until they are pearly and opaque right through, 145°F (63°C).',
          'Chop them finely into small, pea-sized pieces — a whole or large shrimp piece is rubbery and hard to bite through.',
          'Cool to just-warm and serve fresh, in a small amount at home when you can watch baby afterwards.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of thoroughly cooked shrimp.',
        steps: [
          'Peel, devein, and rinse the shrimp, then cook them over medium heat for 3-4 minutes, until opaque and pearly at 145°F (63°C).',
          'Chop them into small bite-sized pieces rather than serving a whole shrimp, which can be rubbery and hard to bite through.',
          'Cool to just-warm and serve fresh, with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-avocado',
    title: 'Simple avocado',
    minAgeMonths: 6,
    prepMinutes: 3,
    ironFocus: false,
    ingredients: [{ foodSlug: 'avocado', quantityNote: '1/2 ripe avocado' }],
    extraIngredients: [{ name: 'oat flour for grip (optional)', quantityNote: 'a little' }],
    variants: {
      '6': {
        textureNote: 'A finger-length wedge of ripe avocado, with a little skin left on one side as a grip.',
        steps: [
          'Halve a ripe avocado, remove the stone, and cut a finger-length wedge — ripe avocado is served raw, with no cooking.',
          'Leave a little skin on one side of the wedge as a grip, or serve the flesh mashed on a spoon.',
          'A very ripe avocado can be slippery, so if the wedge keeps sliding out of baby\'s hand, roll it in a thin coating of oat flour for grip.',
          'Serve at room temperature with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized dice of ripe avocado.',
        steps: [
          'Halve a ripe avocado and scoop the flesh out of the skin.',
          'Dice it into pea-to-bite-sized soft pieces.',
          'If the pieces are slippery, dust them lightly with oat flour so little fingers can hold them.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces or slices of ripe avocado.',
        steps: [
          'Halve a ripe avocado, remove the stone, and scoop out the flesh.',
          'Dice or slice it into small bite-sized pieces.',
          'Serve at room temperature and let baby practice with a fork.',
        ],
      },
    },
  },
  {
    slug: 'simple-banana',
    title: 'Simple banana',
    minAgeMonths: 6,
    prepMinutes: 3,
    ironFocus: false,
    ingredients: [{ foodSlug: 'banana', quantityNote: '1 small ripe banana' }],
    variants: {
      '6': {
        textureNote: 'Finger-length spears, never round coin slices.',
        steps: [
          'Peel back one side of the banana and cut the flesh into finger-length spears — ripe banana is served raw, with no cooking.',
          'Leave a strip of peel at one end as a grip if that helps baby hold it.',
          'Do not serve whole round coin-shaped slices — they are a choking hazard; cut spears instead.',
          'Serve at room temperature with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Half-moons or small pea-to-bite-sized pieces.',
        steps: [
          'Peel the banana and cut it into half-moons, or into small pea-to-bite-sized pieces.',
          'Keep away from whole round coin slices, which are a choking hazard.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized rounds or pieces.',
        steps: [
          'Peel the banana and slice it into small bite-sized rounds or pieces.',
          'Keep every piece small — a large round coin slice remains a choking hazard.',
          'Serve at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-apple',
    title: 'Simple apple',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'apple', quantityNote: '1 apple' }],
    variants: {
      '6': {
        textureNote: 'Cooked apple wedges soft enough to mash between two fingers — never raw.',
        steps: [
          'Wash, peel, and core the apple, then cut it into thick, finger-length wedges.',
          'Steam or simmer the wedges for 8-12 minutes, or bake them at 375°F (190°C) for 20-25 minutes, until they mash easily between two fingers — never serve raw apple under 12 months.',
          'Raw apple is firm and can shear off into a hard, airway-blocking chunk, so test a wedge between your fingers before it reaches baby.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft cooked apple in pea-to-bite-sized dice; still no raw apple.',
        steps: [
          'Wash, peel, and core the apple, then steam or simmer it for 8-12 minutes, until it mashes easily between two fingers.',
          'Dice it into pea-to-bite-sized soft pieces.',
          'Still avoid raw apple at this age — it can shear off into a hard, airway-blocking chunk.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Cooked apple in small pieces, or finely grated raw apple introduced with caution.',
        steps: [
          'Wash, peel, and core the apple.',
          'Steam or simmer it for 8-12 minutes, until softened enough to mash between two fingers, and dice it small — the safest option for a first try.',
          'Once chewing is confident, thin raw slices or finely grated raw apple can be offered alongside; introduce raw apple with caution.',
          'Serve just-warm or at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-pear',
    title: 'Simple pear',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: false,
    ingredients: [{ foodSlug: 'pear', quantityNote: '1 very ripe pear' }],
    variants: {
      '6': {
        textureNote: 'A finger-length wedge of very ripe pear, poached first if it is firm.',
        steps: [
          'Choose a very ripe pear that yields to gentle pressure, then wash and peel it.',
          'Cut a finger-length wedge; if the pear is still firm, steam or poach it at a bare simmer for 5-8 minutes first, until it mashes easily between two fingers.',
          'A firm, underripe pear behaves like raw apple, so poach it for 5-8 minutes whenever it does not yield to gentle pressure.',
          'Check the texture between two fingers and serve at room temperature or just-warm.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized dice of ripe or lightly cooked pear.',
        steps: [
          'Wash and peel a ripe pear, poaching it at a bare simmer for 5-8 minutes first if it is still firm.',
          'Dice it into pea-to-bite-sized soft pieces.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of ripe pear, cooked first if firm.',
        steps: [
          'Wash and peel a ripe pear, poaching it for 5-8 minutes first if it is still firm.',
          'Dice it into small bite-sized pieces.',
          'Serve at room temperature or just-warm.',
        ],
      },
    },
  },
  {
    slug: 'simple-blueberry',
    title: 'Simple blueberry',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'blueberry', quantityNote: '2 tablespoons blueberries' }],
    variants: {
      '6': {
        textureNote: 'Every berry smashed flat — no whole, round berries at all.',
        steps: [
          'Wash the blueberries well; they are served raw, so nothing here needs heat.',
          'Smash each one flat with a fork so no whole, round berry shape remains — whole blueberries are round, firm, and exactly airway-sized.',
          'Stir the smashed berries through a soft food such as yogurt or oats, or serve them on a pre-loaded spoon.',
          'Check the bowl for any berry that escaped the fork before serving.',
        ],
      },
      '9': {
        textureNote: 'Berries smashed flat or quartered lengthwise.',
        steps: [
          'Wash the blueberries.',
          'Smash each one flat, or quarter it lengthwise, so no round or half-berry shape remains.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Berries quartered lengthwise, never whole.',
        steps: [
          'Wash the blueberries.',
          'Quarter each one lengthwise rather than serving it whole, even as chewing improves.',
          'Serve at room temperature.',
        ],
      },
    },
  },
  {
    slug: 'simple-carrot',
    title: 'Simple carrot',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    ingredients: [{ foodSlug: 'carrot', quantityNote: '1 medium carrot' }],
    variants: {
      '6': {
        textureNote: 'Finger-length spears cooked until they mash easily between two fingers.',
        steps: [
          'Wash and peel the carrot and cut it into finger-length spears.',
          'Steam or boil for 12-15 minutes, until a spear mashes easily between two fingers — never serve raw carrot under 12 months.',
          'Raw carrot is hard and can shear into a firm, airway-blocking chunk, so test a spear between your fingers first and cook it 3-5 minutes more if it resists.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft cooked carrot in pea-to-bite-sized cubes; still no raw carrot.',
        steps: [
          'Wash, peel, and cut the carrot, then steam or boil it for 12-15 minutes, until it mashes easily between two fingers.',
          'Cut it into pea-to-bite-sized soft cubes.',
          'Keep avoiding raw carrot, which can shear into a firm, airway-blocking chunk.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Tender-soft carrot in small bite-sized pieces; raw carrot sticks wait until well beyond 12 months.',
        steps: [
          'Wash, peel, and steam or boil the carrot for 12-15 minutes, until tender-soft and fork-tender right through.',
          'Dice it into small bite-sized pieces.',
          'Hold off on raw carrot sticks until chewing is confident, well beyond 12 months.',
          'Cool to just-warm and serve.',
        ],
      },
    },
  },
  {
    slug: 'simple-zucchini',
    title: 'Simple zucchini',
    minAgeMonths: 6,
    prepMinutes: 12,
    ironFocus: false,
    ingredients: [{ foodSlug: 'zucchini', quantityNote: '1/2 small zucchini' }],
    variants: {
      '6': {
        textureNote: 'Finger-length spears steamed or roasted until soft.',
        steps: [
          'Wash the zucchini and cut it into finger-length spears, skin on or off.',
          'Steam the spears for 6-8 minutes, or roast them at 400°F (200°C) for 15-18 minutes, until they are soft right through.',
          'Check a spear mashes easily between two fingers before serving.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized pieces of cooked zucchini.',
        steps: [
          'Wash and cut the zucchini, then steam it for 6-8 minutes, until it mashes easily between two fingers.',
          'Dice it into pea-to-bite-sized soft pieces.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of tender zucchini.',
        steps: [
          'Wash and cut the zucchini, then steam it for 6-8 minutes, or roast it at 400°F (200°C) for 15-18 minutes, until fork-tender.',
          'Dice it into small bite-sized pieces.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-green-beans',
    title: 'Simple green beans',
    minAgeMonths: 6,
    prepMinutes: 10,
    ironFocus: false,
    ingredients: [{ foodSlug: 'green_beans', quantityNote: 'a small handful of green beans (about 6 pods)' }],
    variants: {
      '6': {
        textureNote: 'Whole trimmed pods steamed until they mash easily between two fingers.',
        steps: [
          'Wash the green beans and trim the ends.',
          'Steam them for 8-10 minutes, until they mash easily between two fingers — under-cooked green beans are stringy and fibrous.',
          'Test one pod between your fingers before serving; if it still snaps, steam it for 2-3 minutes more.',
          'Cool to just-warm and hand baby a whole pod as a finger food.',
        ],
      },
      '9': {
        textureNote: 'Soft pea-to-bite-sized pieces of steamed green bean.',
        steps: [
          'Wash and trim the beans, then steam them for 8-10 minutes, until they mash easily between two fingers.',
          'Cut them into pea-to-bite-sized pieces.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Tender green beans in small bite-sized pieces.',
        steps: [
          'Wash and trim the beans, then steam them for 8-10 minutes, until fork-tender.',
          'Cut them into small bite-sized pieces.',
          'Cool to just-warm and serve with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-peas',
    title: 'Simple peas',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: false,
    ingredients: [{ foodSlug: 'peas', quantityNote: '1/4 cup fresh or frozen peas' }],
    variants: {
      '6': {
        textureNote: 'Peas cooked soft and mashed or squashed flat — never whole and round.',
        steps: [
          'Simmer or steam the peas for 4-6 minutes, until one squashes easily between finger and thumb.',
          'Mash them, or squash each pea flat between finger and thumb — whole round peas are small and firm enough to be a choking hazard.',
          'Check that no whole, round pea is left on the plate.',
          'Cool to just-warm, check the temperature, and serve.',
        ],
      },
      '9': {
        textureNote: 'Peas squashed flat between finger and thumb, or lightly mashed.',
        steps: [
          'Simmer or steam the peas for 4-6 minutes, until soft.',
          'Squash each one flat between finger and thumb, or serve them lightly mashed.',
          'Do not serve peas straight from the pod, whole and round.',
          'Cool to just-warm and serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Tender peas, still squashed flat as the safer default.',
        steps: [
          'Simmer or steam the peas for 4-6 minutes, until tender and easily squashed.',
          'Squash them flat before serving — squashing stays the safer default even as chewing improves.',
          'Once chewing is confident, a small amount of whole soft peas can be offered.',
          'Cool to just-warm and serve.',
        ],
      },
    },
  },
  {
    slug: 'simple-rice',
    title: 'Simple rice',
    minAgeMonths: 6,
    prepMinutes: 20,
    ironFocus: false,
    ingredients: [{ foodSlug: 'rice', quantityNote: '1/4 cup short-grain white rice' }],
    extraIngredients: [{ name: 'water, for cooking' }],
    variants: {
      '6': {
        textureNote: 'Soft, sticky rice pressed into a ball or patty rather than served as loose grains.',
        steps: [
          'Rinse the rice, then simmer it covered over low heat with plenty of water for 15-18 minutes, until every grain is very soft and sticky.',
          'Let it cool slightly, then press it into a soft ball or patty baby can pick up.',
          'Loose grains are hard for little hands, so serve the pressed shape rather than a scattered pile.',
          'Cool leftovers quickly, reheat them only once until steaming hot right through — 165°F (74°C) — and discard anything left after that single reheat.',
        ],
      },
      '9': {
        textureNote: 'Soft loose grains for pincer-grasp practice, or small pressed bites.',
        steps: [
          'Simmer the rinsed rice covered over low heat for 15-18 minutes, until soft, then rest it off the heat for 5 minutes.',
          'Serve a small pile of loose grains for pincer-grasp practice, or press some into small bites.',
          'Cool to just-warm before serving, and reheat any leftovers only once, to 165°F (74°C), before discarding them.',
        ],
      },
      '12': {
        textureNote: 'Soft cooked grains served alongside the rest of the meal.',
        steps: [
          'Simmer the rinsed rice covered over low heat for 15-18 minutes, until soft and the water is absorbed.',
          'Serve it as soft cooked grains alongside the other foods on the plate, with no added salt.',
          'Cool and store leftovers promptly, reheating only once to 165°F (74°C) before discarding them.',
        ],
      },
    },
  },
  {
    slug: 'simple-watermelon',
    title: 'Simple watermelon',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'watermelon', quantityNote: '1 thick wedge of seedless watermelon' }],
    variants: {
      '6': {
        textureNote: 'Finger-length sticks with all seeds and rind removed, thick enough to grip.',
        steps: [
          'Cut the rind away completely and pick out every seed; watermelon is served raw, with no cooking.',
          'Cut the flesh into finger-length wedges or sticks that are not too thin to grip.',
          'Watermelon is slippery and can slide toward the throat in large pieces, so keep every piece a manageable, gummable size.',
          'Serve chilled or at room temperature with baby sitting upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Seed-free, rind-free pea-to-bite-sized pieces.',
        steps: [
          'Remove all rind and check the flesh thoroughly for seeds.',
          'Dice it into pea-to-bite-sized pieces, keeping them a size baby can gum.',
          'Serve for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Seed-free, rind-free small bite-sized pieces.',
        steps: [
          'Remove all rind and check for seeds once more.',
          'Dice the flesh into small bite-sized pieces rather than large slippery chunks.',
          'Serve chilled or at room temperature.',
        ],
      },
    },
  },

  // ---- Plain meats (item 331) ----
  {
    slug: 'simple-chicken',
    title: 'Simple chicken',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: false,
    ingredients: [{ foodSlug: 'chicken', quantityNote: '1 small skinless chicken breast (about 55g)' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A finger-length strip of thoroughly cooked breast cut along the grain, or finely shredded chicken moistened so it is never dry.',
        steps: [
          'Trim any gristle from the breast and check it carefully for small bones.',
          'Cook it thoroughly with no added salt — bake at 400°F (200°C) for 18-20 minutes, or poach at a bare simmer for 10-12 minutes — until a thermometer in the thickest part reads 165°F (74°C) and the juices run clear.',
          'Rest it for 5 minutes, then cut a finger-length strip along the grain, or shred it finely.',
          'Moisten the strip or the shreds with a little olive oil or cooking liquid — breast meat dries out fast and turns stringy when it does.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized shredded or chopped pieces for pincer-grasp practice.',
        steps: [
          'Bake the trimmed breast at 400°F (200°C) for 18-20 minutes, until it reads 165°F (74°C) all the way through, then rest it for 5 minutes.',
          'Shred or chop it into soft, pea-sized pieces, feeling for any small bones as you go.',
          'Stir through a little olive oil or cooking liquid so the pieces stay moist rather than crumbly.',
          'Serve just-warm for baby to self-feed.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized dice of thoroughly cooked breast.',
        steps: [
          'Bake the trimmed breast at 400°F (200°C) for 18-20 minutes, until it reads 165°F (74°C) with clear juices, and rest it for 5 minutes.',
          'Dice it into small, soft bite-sized pieces.',
          'Moisten the dice with a little cooking liquid or olive oil, and check once more for small bones.',
          'Serve just-warm with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-turkey',
    title: 'Simple turkey',
    minAgeMonths: 6,
    prepMinutes: 25,
    ironFocus: false,
    ingredients: [{ foodSlug: 'turkey', quantityNote: '55g (2oz) ground turkey, or a small boneless turkey thigh' }],
    extraIngredients: [
      { name: 'grated vegetable, to bind the mince' },
      { name: 'olive oil or a spoonful of the cooking liquid, to moisten' },
    ],
    variants: {
      '6': {
        textureNote: 'A finger-length strip of thin turkey patty, or finely shredded thigh moistened so it is not dry.',
        steps: [
          'Shape the ground turkey into a thin patty, binding it with a little grated vegetable so it does not come out crumbly.',
          'Cook it through with no added salt — pan-fry over medium heat for 4-5 minutes a side, or bake at 375°F (190°C) for 18-20 minutes — until a thermometer in the centre reads 165°F (74°C) and no pink remains.',
          'Rest it for 3-5 minutes, then cut the patty into finger-length strips, or shred slow-cooked thigh meat finely instead.',
          'Moisten with a little olive oil or cooking liquid so nothing is dry or crumbly.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces of mince or shredded thigh, or a small meatball squashed completely flat.',
        steps: [
          'Cook the turkey through — pan-fry over medium heat for 4-5 minutes a side, or bake at 375°F (190°C) for 18-20 minutes — until it reads 165°F (74°C) with no pink left.',
          'Rest it for 3-5 minutes, then break or shred it into soft, pea-sized pieces, or squash a small meatball completely flat.',
          'Stir through a little olive oil or cooking liquid so the pieces are not dry.',
          'Serve just-warm for pincer-grasp practice, never as a firm round meatball.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized dice or shreds of thoroughly cooked turkey.',
        steps: [
          'Bake the turkey at 375°F (190°C) for 18-20 minutes, until it reads 165°F (74°C), then rest it for 3-5 minutes.',
          'Dice or shred it into small, soft bite-sized pieces.',
          'Moisten with a little cooking liquid or olive oil.',
          'Serve just-warm with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-pork',
    title: 'Simple pork',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: false,
    ingredients: [{ foodSlug: 'pork', quantityNote: '55g (2oz) pork tenderloin or loin, trimmed of all fat' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A finger-length strip of well-done tenderloin cut along the grain, moistened so it is not dry.',
        steps: [
          'Trim every piece of fat, rind, and gristle from the pork — cured pork such as bacon or ham is far too salty and is never a substitute here.',
          'Cook it well-done with no added salt — roast at 400°F (200°C) for 20-25 minutes, or pan-fry over medium heat for 5-6 minutes a side — until a thermometer in the thickest part reads 160°F (71°C).',
          'Rest it for 5 minutes, then cut a finger-length strip along the grain.',
          'Moisten the strip with a little olive oil or cooking liquid so it is not dry or chewy.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized shredded or finely chopped pieces of well-done pork.',
        steps: [
          'Roast the trimmed pork at 400°F (200°C) for 20-25 minutes, until it reads 160°F (71°C), then rest it for 5 minutes.',
          'Shred it finely against the grain, or chop it into soft, pea-sized pieces.',
          'Stir through a little olive oil or cooking liquid so the pieces stay moist.',
          'Serve just-warm for baby to self-feed.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized dice, or shredded slow-cooked pork.',
        steps: [
          'Roast the trimmed pork at 400°F (200°C) for 20-25 minutes, until it reads 160°F (71°C), and rest it for 5 minutes — or slow-cook it for 2-3 hours until it falls apart.',
          'Dice it into small, soft bite-sized pieces, or shred it.',
          'Moisten with a little cooking liquid so nothing is dry or chewy.',
          'Serve just-warm with no added salt.',
        ],
      },
    },
  },
  {
    slug: 'simple-lamb',
    title: 'Simple lamb',
    minAgeMonths: 6,
    prepMinutes: 30,
    ironFocus: false,
    ingredients: [{ foodSlug: 'lamb', quantityNote: '55g (2oz) lamb mince, or a piece of boneless lamb shoulder' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A soft, moist pile of well-done lamb mince, or a finger-length shred of slow-cooked shoulder.',
        steps: [
          'Use mince or boneless shoulder only — chops and anything on the bone are not a baby food — and check by feel for bone fragments.',
          'Cook it well-done with no added salt: brown the mince over medium heat for 6-8 minutes, or slow-cook the shoulder for 2-3 hours until it falls apart, in either case until a thermometer reads 160°F (71°C).',
          'Drain off the fat, rest it for 3-5 minutes, and moisten with a little olive oil or cooking liquid.',
          'Serve as a soft pile of fine mince, or pull a finger-length shred from the shoulder.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized pieces of well-done mince or shredded slow-cooked shoulder.',
        steps: [
          'Brown lamb mince over medium heat for 6-8 minutes, or slow-cook boneless shoulder until it falls apart, until it reads 160°F (71°C) with no pink left.',
          'Drain the fat, then break the meat into soft, pea-sized pieces, or shred the shoulder finely.',
          'Stir through a little olive oil or cooking liquid so the pieces are not dry.',
          'Serve just-warm for pincer-grasp practice.',
        ],
      },
      '12': {
        textureNote: 'Small, soft bite-sized dice or shreds of tender slow-cooked lamb.',
        steps: [
          'Slow-cook boneless lamb shoulder for 2-3 hours until it is falling apart, or brown the mince over medium heat for 6-8 minutes, until it reads 160°F (71°C).',
          'Drain the fat, then dice or shred the meat into small, soft bite-sized pieces.',
          'Moisten with a little cooking liquid.',
          'Serve just-warm with no added salt, checking once more for bone fragments.',
        ],
      },
    },
  },

  // ---- More fish ----
  {
    slug: 'simple-cod',
    title: 'Simple cod',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'cod', quantityNote: '55g (2oz) skinless cod fillet' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A soft finger-length piece of flaked cod, checked through with your fingers for bones.',
        steps: [
          'Run your fingers over the fillet and pull out every bone you can feel.',
          'Bake it at 400°F (200°C) for 10-12 minutes, or poach it at a bare simmer for 6-8 minutes, until it is opaque right through and flakes under gentle pressure — 145°F (63°C) on a thermometer.',
          'Flake a soft finger-length piece, running your fingers through the flakes for bones once more.',
          'Moisten it with a little cooking liquid or olive oil — cod flakes dry quickly.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized flakes, re-checked for stray bones.',
        steps: [
          'Bake the cod at 400°F (200°C) for 10-12 minutes, until it is opaque and separates easily with a fork at 145°F (63°C).',
          'Flake it into soft, pea-sized pieces, feeling through every flake for bones.',
          'Moisten the flakes with a little cooking liquid or olive oil.',
          'Serve just-warm for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized flakes, or a small piece of fillet to pick apart.',
        steps: [
          'Bake the cod at 400°F (200°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then let it cool to just-warm.',
          'Flake it into small bite-sized pieces, or leave a small piece of fillet for baby to pick apart.',
          'Check by feel for bones one last time before it reaches the plate.',
          'Serve with no added salt alongside whatever else is on the tray.',
        ],
      },
    },
  },
  {
    slug: 'simple-trout',
    title: 'Simple trout',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'trout', quantityNote: '55g (2oz) trout fillet, skin removed' }],
    extraIngredients: [{ name: 'olive oil or a spoonful of the cooking liquid, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A soft finger-length piece of flaked trout, checked twice for pin bones.',
        steps: [
          'Run your fingers along the fillet and pull out the row of fine pin bones — they survive cooking, and a fillet sold as deboned often still has some.',
          'Bake it at 375°F (190°C) for 10-12 minutes, or poach it at a bare simmer for 6-8 minutes, until it is opaque right through and flakes under gentle pressure — 145°F (63°C) on a thermometer.',
          'Flake a soft finger-length piece, then check the flakes by feel for pin bones a second time.',
          'Moisten with a little cooking liquid or olive oil.',
          'Cool to just-warm, check the temperature, and serve with baby upright and supervised.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized flakes, checked twice for pin bones.',
        steps: [
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until it is opaque and separates easily with a fork at 145°F (63°C).',
          'Flake it into soft, pea-sized pieces, checking by feel for pin bones twice as you go.',
          'Moisten the flakes with a little cooking liquid or olive oil.',
          'Serve just-warm for pincer-grasp self-feeding.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized flakes of cooked trout.',
        steps: [
          'Bake the trout at 375°F (190°C) for 10-12 minutes, until opaque and flaking at 145°F (63°C), then let it cool to just-warm.',
          'Flake it into small bite-sized pieces, checking twice for pin bones.',
          'Serve with no added salt alongside whatever else is on the tray.',
        ],
      },
    },
  },
  {
    slug: 'simple-tuna',
    title: 'Simple canned light tuna',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'tuna', quantityNote: '2 tablespoons skipjack ("light") tuna, canned in water and drained' }],
    extraIngredients: [{ name: 'plain whole-milk yogurt, mashed avocado, or olive oil, to moisten' }],
    variants: {
      '6': {
        textureNote: 'A soft mashed pile of tuna, smooth and wet enough to scoop from a pre-loaded spoon.',
        steps: [
          'Choose skipjack ("light") tuna canned in water, ideally with no salt added — never albacore, white, or bigeye tuna, which carry far more mercury.',
          'Drain it well and mash it thoroughly with plain yogurt, mashed avocado, or a little olive oil until no dry, crumbly lumps remain.',
          'Serve as a soft mashed pile, or pre-load a spoon and hand it over, sitting with baby throughout.',
          'Keep tuna to about one small serving a week while baby is under two.',
        ],
      },
      '9': {
        textureNote: 'Soft, pea-sized dollops of mashed tuna, or tuna stirred through a mash.',
        steps: [
          'Drain skipjack ("light") tuna canned in water and mash it smooth with yogurt or a little olive oil.',
          'Serve it as soft, pea-sized dollops, or stir it through soft pasta or a vegetable mash.',
          'Never offer it dry and crumbly — on its own it packs into a dense ball in the mouth.',
          'Keep tuna to about one small serving a week while baby is under two.',
        ],
      },
      '12': {
        textureNote: 'Small bite-sized pieces of mashed or flaked tuna, moistened.',
        steps: [
          'Drain skipjack ("light") tuna canned in water, keeping to a no-salt-added can.',
          'Mash or flake it into small bite-sized pieces, moistened with yogurt or olive oil.',
          'Stir it through pasta or spread it thinly, still never in a dry pile.',
          'Keep tuna to about one small serving a week while baby is under two.',
        ],
      },
    },
  },

  // ---- Plain oats ----
  {
    slug: 'simple-oats',
    title: 'Simple oats',
    minAgeMonths: 6,
    prepMinutes: 8,
    ironFocus: false,
    ingredients: [{ foodSlug: 'oats', quantityNote: '3 tablespoons rolled or quick oats' }],
    extraIngredients: [{ name: 'breast milk, formula, or water' }],
    variants: {
      '6': {
        textureNote: 'A smooth, thinned porridge loose enough to drip slowly off a spoon.',
        steps: [
          'Simmer the oats with plenty of breast milk, formula, or water over medium-low heat for 4-5 minutes, stirring, until the flakes are completely soft.',
          'Thin the porridge until it drips slowly off a spoon rather than sitting in a stiff lump.',
          'Stir well to release hot spots, cool to just-warm, and check the temperature.',
          'Serve on a pre-loaded spoon — plain oats carry far less iron than the fortified kind, so pair the meal with an iron-rich food.',
        ],
      },
      '9': {
        textureNote: 'A thicker, spoonable porridge with a little texture left.',
        steps: [
          'Simmer the oats with breast milk, formula, or water over medium-low heat for 4-5 minutes, to a thicker, spoonable consistency.',
          'Leave a little texture rather than cooking it completely smooth.',
          'Cool to just-warm and serve in a bowl with a spoon for self-feeding practice.',
        ],
      },
      '12': {
        textureNote: 'A thick, family-style porridge.',
        steps: [
          'Simmer the oats over medium-low heat for 5-6 minutes, adding liquid a splash at a time, until thick and family-style.',
          'Stir to release hot spots, cool to just-warm, and check the temperature.',
          'Serve unsweetened, with no added sugar — and use rolled or quick oats rather than steel-cut, which stay chewy.',
        ],
      },
    },
  },

  // ---- Seeds (served raw: ground, soaked, or sprinkled — never cooked) ----
  {
    slug: 'simple-sesame-seeds',
    title: 'Simple sesame seeds',
    minAgeMonths: 6,
    prepMinutes: 2,
    ironFocus: false,
    ingredients: [{ foodSlug: 'sesame_seeds', quantityNote: 'a pinch of sesame seeds, whole or ground to a fine meal' }],
    variants: {
      '6': {
        textureNote: 'A pinch of ground or whole sesame seeds stirred through a wet food so nothing is dry or loose.',
        steps: [
          'Grind the seeds to a fine meal if you want them to disappear completely, or leave them whole.',
          'Sprinkle a pinch over a wet food — porridge, yogurt, or a soft vegetable mash — so the seeds cling rather than scatter.',
          'Stir them through, and never hand over a spoonful or a pile of dry seeds: any dry seed is easy to inhale.',
          'Sesame is a top-9 allergen, so offer it on its own at home, in the morning, and watch baby for the rest of the day.',
        ],
      },
      '9': {
        textureNote: 'A pinch of whole or ground seeds stirred through yogurt, porridge, or a mash.',
        steps: [
          'Sprinkle a pinch of whole or ground sesame seeds over yogurt, porridge, hummus, or soft vegetables.',
          'Stir them through a mash so they cling rather than scatter across the tray.',
          'Keep it to a pinch, never a spoonful of dry seeds.',
        ],
      },
      '12': {
        textureNote: 'A pinch sprinkled over family food or stirred into a dip or a mash.',
        steps: [
          'Sprinkle a pinch of sesame seeds over family food, or stir them into a dip or a mash.',
          'Ground seeds disappear into the food; whole seeds cling to anything wet.',
          'It stays a pinch — a spoonful of dry seeds is still a hazard at this age.',
        ],
      },
    },
  },
  {
    slug: 'simple-chia-seeds',
    title: 'Simple chia seeds',
    minAgeMonths: 6,
    prepMinutes: 15,
    ironFocus: false,
    ingredients: [{ foodSlug: 'chia_seeds', quantityNote: '1 teaspoon chia seeds' }],
    extraIngredients: [{ name: 'milk, water, or mashed fruit, to soak', quantityNote: '4-5 tablespoons' }],
    variants: {
      '6': {
        textureNote: 'A soft chia gel thinned to a smooth, spoonable porridge, stirred through milk or mashed fruit.',
        steps: [
          'Stir 1 teaspoon of chia seeds into 4-5 tablespoons of milk, water, or mashed fruit.',
          'Leave it at least 10 minutes, until every seed has swelled into a soft gel with no dry grit left.',
          'Thin it until it is smooth and spoonable rather than stiff.',
          'Never offer chia dry: it absorbs many times its weight in liquid and can swell and clump after it is swallowed.',
        ],
      },
      '9': {
        textureNote: 'Soaked, gelled chia stirred through yogurt, porridge, or a fruit mash.',
        steps: [
          'Soak 1 teaspoon of chia in 4-5 tablespoons of liquid for at least 10 minutes, until it is a soft gel.',
          'Stir the gel through yogurt, porridge, or a fruit mash.',
          'Keep it spoonable rather than stiff, and never serve the seeds dry.',
        ],
      },
      '12': {
        textureNote: 'Soaked chia in a pudding, porridge, or smoothie — never dry.',
        steps: [
          'Soak the chia first, every time: at least 10 minutes in milk, water, or fruit.',
          'Stir the gel into a pudding, porridge, or smoothie.',
          'Chia is very high in fiber, so a teaspoon at a time is plenty, with extra fluid alongside.',
        ],
      },
    },
  },
  {
    slug: 'simple-flax-seeds',
    title: 'Simple flax seeds',
    minAgeMonths: 6,
    prepMinutes: 2,
    ironFocus: false,
    ingredients: [{ foodSlug: 'flax_seeds', quantityNote: '1 teaspoon flaxseed, ground to a meal' }],
    variants: {
      '6': {
        textureNote: 'A teaspoon of ground flaxseed stirred through porridge, yogurt, or a vegetable mash until it disappears.',
        steps: [
          'Grind the flaxseed to a meal — whole seeds are hard and slippery and pass straight through undigested.',
          'Stir 1 teaspoon of the meal through porridge, yogurt, or a soft vegetable mash until it disappears.',
          'Serve it wet, never as a dry powder on a spoon.',
          'Keep the rest of the meal in the fridge: ground flax turns rancid quickly.',
        ],
      },
      '9': {
        textureNote: 'Ground flaxseed stirred through porridge, yogurt, or a fruit mash.',
        steps: [
          'Grind the seeds fresh, or use meal you ground earlier and kept in the fridge.',
          'Stir a teaspoon through porridge, yogurt, a fruit mash, or a fritter mix.',
          'Whole seeds stay off the menu — it is the grinding that makes flax useful and safe.',
        ],
      },
      '12': {
        textureNote: 'Ground flaxseed stirred into porridge or into whatever you are baking.',
        steps: [
          'Use ground flaxseed only, stirred into porridge or into whatever you are baking.',
          'Whole seeds still pass through undigested, so it is the meal that goes in.',
          'Grind small batches and keep them in the fridge.',
        ],
      },
    },
  },
  {
    slug: 'simple-hemp-seeds',
    title: 'Simple hemp seeds',
    minAgeMonths: 6,
    prepMinutes: 2,
    ironFocus: false,
    ingredients: [{ foodSlug: 'hemp_seeds', quantityNote: '1 teaspoon hulled hemp hearts' }],
    variants: {
      '6': {
        textureNote: 'A pinch of hulled hemp hearts stirred through a wet porridge, yogurt, or vegetable mash.',
        steps: [
          'Use hulled hemp hearts, not whole hemp seed with the shell on — the shell is hard and fibrous, the hearts are soft.',
          'Sprinkle a pinch over porridge, yogurt, or a soft vegetable mash.',
          'Stir them through so they soften and cling rather than scatter across the tray.',
        ],
      },
      '9': {
        textureNote: 'Hulled hemp hearts sprinkled or stirred through soft food.',
        steps: [
          'Sprinkle or stir a teaspoon of hulled hemp hearts through porridge, yogurt, soft fruit, or vegetables.',
          'They need no grinding — the hearts crumble easily on their own.',
          'Keep the bag sealed in the fridge; hemp hearts are oily and turn rancid in a warm cupboard.',
        ],
      },
      '12': {
        textureNote: 'Hulled hemp hearts sprinkled over family food or stirred into porridge and dips.',
        steps: [
          'Sprinkle hulled hemp hearts over family food, or stir them into porridge, dips, and baking.',
          'Whole shelled hemp seed stays off the menu; the hulled hearts are the soft part.',
          'Store them sealed in the fridge to keep them from turning rancid.',
        ],
      },
    },
  },
  {
    slug: 'simple-pumpkin-seeds',
    title: 'Simple pumpkin seeds',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'pumpkin_seeds', quantityNote: '1 teaspoon hulled pumpkin seeds, ground to a fine meal' }],
    variants: {
      '6': {
        textureNote: 'A teaspoon of fine pumpkin seed meal stirred through porridge, yogurt, or a vegetable mash.',
        steps: [
          'Whole pumpkin seeds are a listed choking hazard and stay off the menu until age 4-5 — grind hulled seeds to a fine, flour-like meal first.',
          'Stir 1 teaspoon of the meal through porridge, yogurt, or a soft vegetable mash.',
          'A smooth pumpkin seed butter thinned with warm water until runny works the same way — never thick, never a spoonful straight.',
          'Check that nothing crunchy is left before it reaches the tray.',
        ],
      },
      '9': {
        textureNote: 'Fine pumpkin seed meal stirred through porridge, yogurt, or a mash, or thinned smooth butter spread very thinly.',
        steps: [
          'Grind hulled pumpkin seeds to a fine meal, or use a smooth pumpkin seed butter.',
          'Stir the meal through porridge, yogurt, or a mash, or thin the butter until it is runny and spread it very thinly.',
          'Whole and chopped seeds are still a hazard at this age, and remain one for years yet.',
        ],
      },
      '12': {
        textureNote: 'Ground meal or thinned smooth butter — never whole or chopped seeds.',
        steps: [
          'Keep to finely ground pumpkin seed meal, or a smooth butter thinned until runny.',
          'Stir the meal into food, or spread the thinned butter in a thin layer.',
          'Whole seeds stay off the menu until age 4-5, however confident the chewing looks.',
        ],
      },
    },
  },
  {
    slug: 'simple-sunflower-seed-butter',
    title: 'Simple sunflower seed butter',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [
      { foodSlug: 'sunflower_seed_butter', quantityNote: '1-2 teaspoons smooth, unsalted sunflower seed butter' },
    ],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin' }],
    variants: {
      '6': {
        textureNote: 'Smooth sunflower seed butter thinned until runny, on a spoon or in a very thin layer on a soft toast finger — never a thick spoonful.',
        steps: [
          'Measure 1-2 teaspoons of smooth, unsalted, unsweetened sunflower seed butter into a small bowl.',
          'Thin it with warm water, breast milk, or formula, stirring until it is runny rather than thick or sticky.',
          'Thick or sticky seed butter is a serious choking hazard, so never serve a spoonful straight, and never whole sunflower seeds.',
          'Offer the thinned mixture on a pre-loaded spoon, in a small amount, and stay with baby through the meal.',
        ],
      },
      '9': {
        textureNote: 'Runny thinned sunflower seed butter stirred through food, or spread very thinly.',
        steps: [
          'Thin smooth sunflower seed butter with warm water, breast milk, or formula until it is runny.',
          'Stir it into porridge or yogurt, or spread a very thin layer on soft fruit.',
          'Keep the layer thin — never a thick glob, and never a spoonful straight.',
        ],
      },
      '12': {
        textureNote: 'Thinned sunflower seed butter used as a spread or a dip, still never a thick layer.',
        steps: [
          'Thin smooth sunflower seed butter until runny before using it as a spread or a dip base.',
          'Keep any spread layer thin; thick spoonfuls and globs remain a choking hazard.',
          'Check the label for added salt and sugar — sunflower seed butter is not a nut butter, but it is often sweetened.',
        ],
      },
    },
  },

  // ---- Tree nuts (ground or thinned only — never whole, never in pieces) ----
  {
    slug: 'simple-cashew-butter',
    title: 'Simple cashew butter',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'cashew_butter', quantityNote: '1-2 teaspoons smooth, unsalted cashew butter' }],
    extraIngredients: [{ name: 'warm water, breast milk, or formula, to thin' }],
    variants: {
      '6': {
        textureNote: 'Smooth cashew butter thinned until runny, on a spoon or in a very thin layer on a soft toast finger — never a thick spoonful.',
        steps: [
          'Measure 1-2 teaspoons of smooth, unsalted cashew butter into a small bowl.',
          'Thin it with warm water, breast milk, or formula, stirring until it is runny rather than thick or sticky.',
          'Thick or sticky nut butter is a serious choking hazard, so never serve a spoonful straight, and never whole or chopped cashews.',
          'Tree nut is a top-9 allergen, so offer it on its own at home, in the morning, and watch baby for the rest of the day.',
        ],
      },
      '9': {
        textureNote: 'Runny thinned cashew butter stirred through food, or spread very thinly.',
        steps: [
          'Thin smooth cashew butter with warm water, breast milk, or formula until it is runny.',
          'Stir it into porridge or yogurt, or spread a very thin layer on soft fruit.',
          'Keep the layer thin — never a thick glob, and never a spoonful straight.',
        ],
      },
      '12': {
        textureNote: 'Thinned cashew butter used as a spread or a dip, still never a thick layer.',
        steps: [
          'Thin smooth cashew butter until runny before using it as a spread or a dip base.',
          'Keep any spread layer thin; thick spoonfuls and globs remain a choking hazard.',
          'Whole and chopped nuts stay off the menu until age 4-5, at every stage.',
        ],
      },
    },
  },
  {
    slug: 'simple-walnuts',
    title: 'Simple walnuts',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'walnuts', quantityNote: '1 teaspoon shelled walnuts, ground to a fine meal' }],
    variants: {
      '6': {
        textureNote: 'A teaspoon of fine walnut meal stirred through porridge, yogurt, or a fruit mash.',
        steps: [
          'Grind shelled walnuts to a fine, flour-like meal — whole nuts and nut pieces are a serious choking hazard and stay off the menu until age 4-5.',
          'Stir 1 teaspoon of the meal through porridge, yogurt, or a fruit mash until nothing crunchy is left.',
          'Tree nut is a top-9 allergen, so offer it on its own at home, in the morning, and watch baby for the rest of the day.',
          'Keep the rest of the meal in the fridge — walnut meal turns rancid quickly.',
        ],
      },
      '9': {
        textureNote: 'Fine walnut meal stirred through porridge, yogurt, soft fruit, or a fritter mix.',
        steps: [
          'Grind shelled walnuts to a fine meal, in a small batch.',
          'Stir it through porridge, yogurt, soft fruit, or a fritter mix.',
          'Pieces and halves stay off the menu — it is the grinding that makes this safe.',
        ],
      },
      '12': {
        textureNote: 'Fine walnut meal stirred into food, or a smooth walnut butter thinned runny.',
        steps: [
          'Keep to finely ground walnut meal stirred into food, or a smooth walnut butter thinned until runny.',
          'Pieces, halves, and whole nuts stay off the menu until age 4-5.',
          'Grind small batches and keep the meal in the fridge.',
        ],
      },
    },
  },
  {
    slug: 'simple-pistachios',
    title: 'Simple pistachios',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [
      { foodSlug: 'pistachios', quantityNote: '1 teaspoon shelled, unsalted pistachios, ground to a fine meal' },
    ],
    variants: {
      '6': {
        textureNote: 'A teaspoon of fine pistachio meal stirred through porridge, yogurt, or a fruit mash.',
        steps: [
          'Use shelled, unsalted pistachios — salted ones carry far too much sodium for a baby — and grind them to a fine, flour-like meal.',
          'Stir 1 teaspoon of the meal through porridge, yogurt, or a fruit mash.',
          'Whole and chopped pistachios are a serious choking hazard and stay off the menu until age 4-5.',
          'Tree nut is a top-9 allergen, so offer it on its own at home, in the morning, and watch baby for the rest of the day.',
        ],
      },
      '9': {
        textureNote: 'Fine pistachio meal stirred through porridge, yogurt, soft fruit, or a mash.',
        steps: [
          'Grind shelled, unsalted pistachios to a fine meal, in a small batch.',
          'Stir it through porridge, yogurt, soft fruit, or a mash.',
          'Never serve them in the shell, and never in pieces.',
        ],
      },
      '12': {
        textureNote: 'Fine pistachio meal stirred into food; whole and chopped nuts stay off the menu.',
        steps: [
          'Keep to finely ground pistachio meal stirred into food.',
          'Whole and chopped nuts stay off the menu until age 4-5.',
          'Cashew and pistachio are closely related, so a reaction to one means taking care with the other.',
        ],
      },
    },
  },
  {
    slug: 'simple-hazelnuts',
    title: 'Simple hazelnuts',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [
      { foodSlug: 'hazelnuts', quantityNote: '1 teaspoon skinned, shelled hazelnuts, ground to a fine meal' },
    ],
    variants: {
      '6': {
        textureNote: 'A teaspoon of fine hazelnut meal stirred through porridge, yogurt, or a fruit mash, or plain hazelnut butter thinned runny.',
        steps: [
          'Grind skinned, shelled hazelnuts to a fine, flour-like meal, or use a plain smooth hazelnut butter.',
          'Stir 1 teaspoon of the meal through porridge, yogurt, or a fruit mash, or thin the butter with warm water until it is runny.',
          'A chocolate hazelnut spread is mostly sugar and is not a way to introduce this allergen.',
          'Whole and chopped hazelnuts are a serious choking hazard and stay off the menu until age 4-5.',
        ],
      },
      '9': {
        textureNote: 'Fine hazelnut meal stirred through soft food, or thinned plain hazelnut butter spread very thinly.',
        steps: [
          'Grind skinned hazelnuts to a fine meal, or thin plain hazelnut butter until it is runny.',
          'Stir the meal through porridge, yogurt, or soft fruit, or spread the thinned butter very thinly.',
          'Nothing crunchy should be left — pieces stay off the menu.',
        ],
      },
      '12': {
        textureNote: 'Fine hazelnut meal or thinned plain hazelnut butter; whole and chopped nuts stay off the menu.',
        steps: [
          'Keep to finely ground hazelnut meal, or a plain smooth butter thinned until runny.',
          'Read the jar: plain hazelnut butter only, with no added sugar.',
          'Whole and chopped nuts stay off the menu until age 4-5.',
        ],
      },
    },
  },
  {
    slug: 'simple-pecans',
    title: 'Simple pecans',
    minAgeMonths: 6,
    prepMinutes: 5,
    ironFocus: false,
    ingredients: [{ foodSlug: 'pecans', quantityNote: '1 teaspoon shelled pecans, ground to a fine meal' }],
    variants: {
      '6': {
        textureNote: 'A teaspoon of fine pecan meal stirred through porridge, yogurt, or a fruit mash.',
        steps: [
          'Grind shelled pecans to a fine, flour-like meal — halves and pieces are a serious choking hazard and stay off the menu until age 4-5.',
          'Stir 1 teaspoon of the meal through porridge, yogurt, or a fruit mash until nothing crunchy is left.',
          'Tree nut is a top-9 allergen, so offer it on its own at home, in the morning, and watch baby for the rest of the day.',
          'Keep the rest in the fridge — pecan meal is oily and turns rancid quickly.',
        ],
      },
      '9': {
        textureNote: 'Fine pecan meal stirred through porridge, yogurt, soft fruit, or a mash.',
        steps: [
          'Grind shelled pecans to a fine meal, in a small batch.',
          'Stir it through porridge, yogurt, soft fruit, or a mash.',
          'Halves and pieces stay off the menu — grinding is what makes this safe.',
        ],
      },
      '12': {
        textureNote: 'Fine pecan meal stirred into food; halves and pieces stay off the menu.',
        steps: [
          'Keep to finely ground pecan meal stirred into food.',
          'Halves, pieces, and whole nuts stay off the menu until age 4-5.',
          'Grind small batches and keep the meal in the fridge.',
        ],
      },
    },
  },
]
