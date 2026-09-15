import type { FoodSeed } from './types'

// ~74 starter foods spanning iron anchors, vitamin-C pairing foods, allergen vehicles, and
// staples. minAgeMonths is 6 for nearly everything (BLW typically starts around 6 months when
// baby shows readiness signs); shellfish is held to 9 months per the allergen ladder ordering.
// Prep guidance is age-specific: 6-8m favors palmar-grasp finger shapes and thinned textures,
// 9-11m favors pea-sized pincer-grasp pieces, 12m+ moves toward family bite-sized textures.
// The one exception is `category: 'spice'` (item 329): a spice is never the thing on the tray,
// so its three prep fields answer "how do I use this at this age" instead of naming a cut, and
// it is the one category with no `Simple <food>` basic recipe.
export const foods: FoodSeed[] = [
  // ---- Iron anchors ----
  {
    slug: 'beef',
    name: 'Beef',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook well-done and serve as a finger-length strip along the grain, or mince very finely and moisten with cooking liquid or olive oil so it is not dry or stringy.',
    prep9m:
      'Cook well-done and finely chop or shred into soft, pea-sized pieces baby can pick up with a pincer grasp.',
    prep12m:
      'Cook until tender (a slow-cooked cut works well) and dice into small, soft bite-sized pieces baby can chew with emerging molars.',
    chokingNotes: 'Dense or dry meat can be hard to gum into a swallowable piece — keep it moist, tender, and cut with (not against) or shredded finely against the grain.',
    notes: 'A top heme-iron source — heme iron absorbs well on its own, but pairing with a vitamin-C food still adds nutritional variety to the meal.',
    allergens: [],
    storageCategory: 'meat_poultry_cooked',
  },
  {
    slug: 'chicken_thigh',
    name: 'Chicken Thigh',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook thoroughly and serve as a finger-length strip of dark meat, or shred finely and moisten with a little olive oil or cooking liquid.',
    prep9m:
      'Cook thoroughly and shred or chop into soft, pea-sized pieces for pincer-grasp self-feeding.',
    prep12m:
      'Cook thoroughly and dice into small, soft bite-sized pieces.',
    chokingNotes: 'Trim any tough skin, fat, or gristle, and check carefully for small bones before serving.',
    notes: 'Dark meat carries more iron than chicken breast, making thigh the better BLW cut.',
    allergens: [],
    storageCategory: 'meat_poultry_cooked',
  },
  {
    slug: 'salmon',
    name: 'Salmon',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Bake or poach until just cooked through, then flake into a soft finger-length piece, checking thoroughly with your fingers for bones.',
    prep9m:
      'Cook through and flake into soft, pea-sized pieces, re-checking for stray bones.',
    prep12m:
      'Cook through and flake into small bite-sized pieces or serve as a small whole fillet piece to pick apart.',
    chokingNotes: 'Always run fingers through cooked flakes to feel for pin bones, even from pre-deboned fillets — a missed bone is a real hazard.',
    notes: 'A low-mercury fish choice, good for the allergen ladder fish step. Its heme iron absorbs well without needing a vitamin-C pairing.',
    allergens: ['fish'],
    storageCategory: 'fish_seafood_cooked',
  },
  {
    slug: 'sardines',
    name: 'Sardines',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Use boneless, canned-in-water sardines; mash well and spread thinly on a soft toast finger, or serve as a soft mashed pile for dipping.',
    prep9m:
      'Mash or flake into soft, pea-sized pieces, double-checking for any small bones.',
    prep12m:
      'Flake into small bite-sized pieces or mash onto toast cut into bite-sized squares.',
    chokingNotes: 'Choose boneless varieties and still check by feel for any remaining small, soft bones.',
    notes: 'One of the most iron-dense foods on this list — an excellent heme-iron anchor for early meals.',
    allergens: ['fish'],
    storageCategory: 'fish_seafood_cooked',
  },
  {
    slug: 'egg',
    name: 'Egg',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Serve well-cooked, mashed whole egg (yolk and white) mixed with a little breast milk, formula, or water to loosen it, or as a soft scrambled-egg pile.',
    prep9m:
      'Serve as soft scrambled egg pieces or a slice of firm omelet cut into pea-sized pieces for pincer-grasp self-feeding.',
    prep12m:
      'Serve as bite-sized omelet pieces, a halved hard-boiled egg, or scrambled egg alongside toast fingers.',
    notes: 'A useful iron source alongside its role as the first step on the allergen ladder — always cook whole eggs fully for babies.',
    allergens: ['egg'],
    storageCategory: 'egg_dish_cooked',
  },
  {
    slug: 'lentils',
    name: 'Lentils',
    category: 'legume',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Cook until very soft and serve mashed as a thick spread on a soft toast finger, or thinned into a scoopable puree.',
    prep9m:
      'Cook until soft and serve as a mash with some texture left, or stirred into a fritter for pincer-grasp pieces.',
    prep12m:
      'Cook until soft and serve as-is in small spoonfuls, mixed into a soup, stew, or grain bowl.',
    notes: 'A strong plant-based (non-heme) iron source — pair with a vitamin-C food like bell pepper or tomato to boost absorption.',
    allergens: [],
    storageCategory: 'legume_tofu_cooked',
  },
  {
    slug: 'chickpeas',
    name: 'Chickpeas',
    category: 'legume',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook until very soft, then mash or blend into a smooth hummus-style spread — whole chickpeas and their loose skins are a choking risk at this age.',
    prep9m:
      'Mash lightly, leaving some soft texture, or squeeze each chickpea out of its skin and flatten between your fingers before serving.',
    prep12m:
      'Squash each chickpea flat between finger and thumb before serving, or serve fully blended into hummus or a curry.',
    chokingNotes: 'Whole chickpeas are round and firm enough to be a choking hazard — always mash, squash flat, or blend rather than serving whole.',
    notes: 'Pair with a vitamin-C food such as tomato or orange to boost non-heme iron absorption.',
    allergens: [],
    storageCategory: 'legume_tofu_cooked',
  },
  {
    slug: 'black_beans',
    name: 'Black Beans',
    category: 'legume',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook until very soft and mash well; whole beans can be firm enough to pose a choking risk, so mash or squash each one flat.',
    prep9m:
      'Mash lightly or squash each bean flat between your fingers before serving, leaving some soft texture.',
    prep12m:
      'Serve whole cooked beans that are soft enough to squash easily between two fingers, mixed into rice or a bowl.',
    chokingNotes: 'Squash or mash beans rather than serving them fully whole and round, especially before 9 months.',
    notes: 'Pair with a vitamin-C food such as orange or bell pepper to boost non-heme iron absorption.',
    allergens: [],
    storageCategory: 'legume_tofu_cooked',
  },
  {
    slug: 'tofu',
    name: 'Tofu',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Use firm tofu, pat dry, and cut into finger-length strips; pan-fry lightly in a little oil for a texture that grips easily without being slippery.',
    prep9m:
      'Cut into pea-to-bite-sized soft cubes, pan-fried or baked lightly for grip.',
    prep12m:
      'Cut into small bite-sized cubes, pan-fried, baked, or coated lightly in crumbs for a soft-inside, lightly crisp-outside nugget.',
    chokingNotes: 'Raw or unfried tofu cubes can be slippery — a light pan-fry or coating helps little hands grip it.',
    notes: 'A strong plant-based (non-heme) iron and soy protein source — pair with broccoli or another vitamin-C food to boost absorption.',
    allergens: ['soy'],
    storageCategory: 'legume_tofu_cooked',
  },
  {
    slug: 'iron_fortified_oats',
    name: 'Iron-Fortified Oats',
    category: 'grain',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Cook with breast milk, formula, or water into a smooth, thinned porridge loose enough to drip slowly off a spoon.',
    prep9m:
      'Cook to a thicker, spoonable porridge with some texture, or stir into pancakes or oat-based bites.',
    prep12m:
      'Cook to a thick, family-style porridge, or bake into muffins, pancakes, or patties.',
    notes: 'A commonly recommended first iron source in BLW because it is fortified — pair with fruit for vitamin C and flavor.',
    allergens: [],
    storageCategory: 'grain_cooked',
  },
  {
    slug: 'spinach',
    name: 'Spinach',
    category: 'veg',
    ironLevel: 'high',
    vitaminCLevel: 'moderate',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Steam or wilt until very soft, then finely chop and stir into a mash, omelet, or soft grain rather than serving leaves whole.',
    prep9m:
      'Finely chop cooked spinach and mix into fritters, egg dishes, or a soft mash for pincer-grasp self-feeding.',
    prep12m:
      'Chop cooked spinach and mix into dishes, or serve wilted and finely cut as a side.',
    chokingNotes: 'Whole cooked leaves can be slippery and hard to chew — always chop finely rather than serving whole leaves.',
    notes: 'Spinach carries both iron and some vitamin C, but also natural compounds (oxalates) that reduce iron absorption — pairing with an extra vitamin-C food like kiwi still helps.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'quinoa',
    name: 'Quinoa',
    category: 'grain',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Cook until very soft and serve as a sticky mash pressed into a soft patty shape rather than loose grains, which can be hard to pick up.',
    prep9m:
      'Cook until soft and serve as loose grains for pincer-grasp practice, or bake into small bites.',
    prep12m:
      'Serve as soft cooked grains alongside other foods, or baked into bites.',
    chokingNotes: 'Loose cooked quinoa grains are small and can scatter — pressing into a patty or bite shape makes early self-feeding easier and safer.',
    notes: 'A moderate non-heme iron source — pair with mango or another vitamin-C food to boost absorption.',
    allergens: [],
    storageCategory: 'grain_cooked',
  },

  // ---- Vitamin-C pairing foods ----
  {
    slug: 'broccoli',
    name: 'Broccoli',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'high',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Steam whole florets until soft enough to mash easily between two fingers, keeping a bit of stem as a handle.',
    prep9m:
      'Steam until soft and cut into smaller, pea-to-bite-sized florets for pincer-grasp self-feeding.',
    prep12m:
      'Steam or roast until tender and cut into small bite-sized florets.',
    chokingNotes: 'Raw or under-cooked broccoli is fibrous and hard to chew — always steam until it mashes easily before serving.',
    notes: 'A great vitamin-C pairing partner for iron-rich foods like beef, lentils, or tofu.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'bell_pepper',
    name: 'Bell Pepper',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'high',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Roast or steam strips until soft and the skin wrinkles, removing any tough or papery skin before serving as a finger-length strip.',
    prep9m:
      'Roast or steam until soft and cut into small, pea-to-bite-sized pieces.',
    prep12m:
      'Serve roasted or steamed and softened, or thin raw strips once baby is confidently chewing, cut into small pieces.',
    chokingNotes: 'Raw bell pepper skin is tough and can be hard to bite through — cook until soft, especially before confident chewing develops.',
    notes: 'One of the best vitamin-C partners for iron-rich foods like beef, lentils, or chickpeas.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'strawberry',
    name: 'Strawberry',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'high',
    fiberLevel: 'moderate',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Hull and quarter lengthwise (or mash well), removing the round whole shape entirely before serving.',
    prep9m:
      'Hull and quarter or finely dice so no round or half-berry shape remains.',
    prep12m:
      'Hull and quarter, or slice thinly, always avoiding a whole round berry shape.',
    chokingNotes: 'A whole or halved strawberry can be round enough to block an airway — always quarter lengthwise or mash.',
    notes: 'A bright vitamin-C food to pair with iron-fortified oats or another iron-rich food.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'orange',
    name: 'Orange',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'high',
    fiberLevel: 'moderate',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Remove all peel, pith, membrane, and seeds, and serve a single membrane-free segment split in half lengthwise.',
    prep9m:
      'Remove membrane and seeds and serve small, membrane-free segment pieces for pincer-grasp self-feeding.',
    prep12m:
      'Remove membrane and seeds and serve segments cut into smaller bite-sized pieces.',
    chokingNotes: 'Tough membrane and seeds are the main hazard — always peel every segment down to just the juicy flesh.',
    notes: 'A classic vitamin-C pairing partner for chicken, beef, or plant-based iron foods.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'kiwi',
    name: 'Kiwi',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'high',
    fiberLevel: 'high',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Peel and cut into finger-length wedges or halve and let baby scoop with a spoon; the soft, ripe flesh mashes easily.',
    prep9m:
      'Peel and dice into pea-to-bite-sized soft pieces.',
    prep12m:
      'Peel and dice into small bite-sized pieces.',
    notes: 'One of the highest vitamin-C foods on this list — an easy pairing for spinach or other iron-rich foods.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'mango',
    name: 'Mango',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Peel and cut ripe mango into finger-length strips baby can hold and gnaw.',
    prep9m:
      'Peel and dice into pea-to-bite-sized soft pieces.',
    prep12m:
      'Peel and dice into small bite-sized pieces.',
    chokingNotes: 'Choose fully ripe mango — firm, underripe pieces can be slippery and harder to gum.',
    notes: 'A sweet vitamin-C food that pairs well with quinoa or another iron-rich grain.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'tomato',
    name: 'Tomato',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'low',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Skin, deseed if the seeds are large, and serve soft cooked tomato as a mash, or quarter a small tomato lengthwise if serving raw.',
    prep9m:
      'Quarter lengthwise (never serve whole or halved) and remove any tough skin, or serve cooked and diced.',
    prep12m:
      'Quarter lengthwise or dice into small bite-sized pieces, skin removed if tough.',
    chokingNotes: 'Whole or halved cherry and small tomatoes are a classic choking hazard due to their round, slippery shape and skin — always quarter lengthwise.',
    notes: 'A useful vitamin-C partner for salmon, sardines, or other iron-rich proteins.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'sweet_potato',
    name: 'Sweet Potato',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'high',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Steam, boil, or roast until it mashes easily between two fingers, then cut into a finger-length wedge.',
    prep9m:
      'Cook until soft and cut into pea-to-bite-sized soft cubes.',
    prep12m:
      'Cook until tender and dice into small bite-sized pieces, roasted or mashed.',
    notes: 'A gentle, well-tolerated vitamin-C pairing for beef or chicken thigh.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'butternut_squash',
    name: 'Butternut Squash',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'high',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Steam or roast until it mashes easily between two fingers, then cut into a finger-length wedge.',
    prep9m:
      'Cook until soft and cut into pea-to-bite-sized soft cubes.',
    prep12m:
      'Cook until tender and dice into small bite-sized pieces.',
    notes: 'A mild, naturally sweet vitamin-C pairing for chicken thigh or another iron-rich protein.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },

  // ---- Allergen vehicles ----
  {
    slug: 'peanut_butter',
    name: 'Peanut Butter',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Thin 1-2 teaspoons of smooth peanut butter with warm water, breast milk, or formula until runny, then serve on a spoon or spread in a very thin layer on a soft toast finger.',
    prep9m:
      'Thin smooth peanut butter until runny and stir into oatmeal, yogurt, or a thin spread on toast or banana.',
    prep12m:
      'Thin smooth peanut butter until runny for spreads and dips; still avoid thick spoonfuls or globs.',
    chokingNotes: 'Thick or sticky peanut butter is a serious choking hazard for babies and young children — always thin it until runny, and never serve a spoonful straight or whole/chopped peanuts.',
    notes: 'A common first-exposure food for the peanut step of the allergen ladder — introduce as its own step, in a small amount, at home.',
    allergens: ['peanut'],
    storageCategory: 'nut_seed_butter_thinned',
  },
  {
    slug: 'almond_butter',
    name: 'Almond Butter',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Thin 1-2 teaspoons of smooth almond butter with warm water, breast milk, or formula until runny, then serve on a spoon or spread in a very thin layer on a soft toast finger.',
    prep9m:
      'Thin smooth almond butter until runny and stir into oatmeal, yogurt, or a thin spread on toast or fruit.',
    prep12m:
      'Thin smooth almond butter until runny for spreads and dips; still avoid thick spoonfuls or globs.',
    chokingNotes: 'Thick or sticky nut butter is a serious choking hazard — always thin it until runny, and never serve whole or chopped nuts.',
    notes: 'The typical tree-nut-ladder starter food — introduce as its own step, in a small amount, at home.',
    allergens: ['tree_nut'],
    storageCategory: 'nut_seed_butter_thinned',
  },
  {
    slug: 'tahini',
    name: 'Tahini',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Thin 1 teaspoon of tahini with warm water, breast milk, or formula until runny, then drizzle thinly over food or spread very thin on toast.',
    prep9m:
      'Thin tahini and stir into porridge, yogurt, or vegetables, or spread thinly on toast.',
    prep12m:
      'Use thinned as a dressing or dip base; keep the layer thin rather than a thick paste.',
    chokingNotes: 'A thick layer of tahini can stick in the mouth — always thin it and spread only a light layer.',
    notes: 'The sesame-ladder starter food and a good source of non-heme iron — pair with a vitamin-C food when used as a main component.',
    allergens: ['sesame'],
    storageCategory: 'nut_seed_butter_thinned',
  },
  {
    slug: 'yogurt',
    name: 'Whole-Milk Yogurt',
    category: 'dairy',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Serve plain, unsweetened whole-milk yogurt on a pre-loaded spoon or let baby dip fingers in.',
    prep9m:
      'Serve plain whole-milk yogurt with a spoon for self-feeding, optionally mixed with mashed fruit.',
    prep12m:
      'Serve plain whole-milk yogurt with a spoon, optionally mixed with diced soft fruit.',
    notes: 'Use plain, unsweetened, pasteurized whole-milk yogurt only — the typical dairy-ladder starter food.',
    allergens: ['milk'],
    storageCategory: 'dairy_soft',
  },
  {
    slug: 'cheese',
    name: 'Cheese',
    category: 'dairy',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Serve finely grated or as a very thin, soft strip of a mild, pasteurized cheese — never a firm cube.',
    prep9m:
      'Serve grated or in small, soft, pea-sized pieces of a mild pasteurized cheese.',
    prep12m:
      'Serve in small bite-sized soft pieces or thin slices of a mild pasteurized cheese.',
    chokingNotes: 'Firm cheese cubes are a choking hazard — always grate, shred, or cut into thin strips rather than cubes.',
    notes: 'Use only pasteurized, mild cheese (such as mild cheddar or mozzarella) — avoid unpasteurized or soft-ripened cheeses for babies.',
    allergens: ['milk'],
    storageCategory: 'dairy_soft',
  },
  {
    slug: 'wheat_toast',
    name: 'Wheat Toast',
    category: 'grain',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Toast lightly, then moisten with a little water, milk, or a thin spread so it is soft and bends without snapping; cut into finger-length strips.',
    prep9m:
      'Toast and moisten, then cut into small squares for pincer-grasp self-feeding.',
    prep12m:
      'Toast and cut into small bite-sized squares or triangles, plain or lightly topped.',
    chokingNotes: 'Dry, hard toast can crumble into shards or feel scratchy going down — always soften or moisten before serving.',
    notes: 'A common wheat-ladder starter food; check for a wheat-free label if introducing wheat for the very first time in isolation.',
    allergens: ['wheat'],
    storageCategory: 'bread_pasta_grain_baked',
  },
  {
    slug: 'wheat_pasta',
    name: 'Wheat Pasta',
    category: 'grain',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Cook until very soft, well past al dente, and serve larger shapes (like penne or fusilli) whole as a finger food.',
    prep9m:
      'Cook until soft and serve smaller shapes for pincer-grasp self-feeding.',
    prep12m:
      'Cook until tender and serve as-is, mixed with a soft sauce or vegetables.',
    notes: 'A gentle wheat-ladder option that is easy to prepare very soft.',
    allergens: ['wheat'],
    storageCategory: 'bread_pasta_grain_baked',
  },
  {
    slug: 'shrimp',
    name: 'Shrimp',
    category: 'protein',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 9,
    prep6m:
      'Not recommended before 9 months — shellfish is introduced later on the allergen ladder.',
    prep9m:
      'Cook thoroughly and finely chop into small, pea-sized pieces; avoid serving a whole shrimp, which can be tough and round.',
    prep12m:
      'Cook thoroughly and chop into small bite-sized pieces.',
    chokingNotes: 'Whole or large shrimp pieces can be rubbery and hard to bite through — always chop finely.',
    notes: 'Held to 9 months and introduced last on the allergen ladder; cook thoroughly and serve fresh.',
    allergens: ['shellfish'],
    storageCategory: 'fish_seafood_cooked',
  },

  // ---- Staples ----
  {
    slug: 'avocado',
    name: 'Avocado',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'high',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Cut a ripe avocado into a finger-length wedge, leaving a little skin on one side as a grip, or serve mashed on a spoon.',
    prep9m:
      'Dice ripe avocado into pea-to-bite-sized soft pieces.',
    prep12m:
      'Dice or slice ripe avocado into small bite-sized pieces.',
    chokingNotes: 'A very ripe avocado can be slippery — a thin coating of a dry food like oat flour on a wedge can help with grip if needed.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'banana',
    name: 'Banana',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cut into finger-length spears (not round coins), leaving a strip of peel at one end as a grip if helpful.',
    prep9m:
      'Cut into half-moons or small pea-to-bite-sized pieces for pincer-grasp self-feeding.',
    prep12m:
      'Slice into small bite-sized rounds or pieces.',
    chokingNotes: 'Whole round coin-shaped slices can be a choking hazard — cut into spears or half-moons instead.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'apple',
    name: 'Apple',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'moderate',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Cook (steam, bake, or simmer) until it mashes easily between two fingers — never serve raw apple under 12 months. Cut cooked apple into a soft finger-length wedge.',
    prep9m:
      'Cook until soft and dice into pea-to-bite-sized soft pieces; still avoid raw apple.',
    prep12m:
      'Once chewing is confident, thin raw slices can be offered alongside cooked options — grate raw apple finely or cook until softened for a safer first try.',
    chokingNotes: 'Raw apple is firm and can shear off in a hard, airway-blocking chunk — always cook until squishable before 12 months, and introduce raw with caution afterward.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'pear',
    name: 'Pear',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Choose a very ripe, soft pear and cut into a finger-length wedge; if firm, steam or poach first until it mashes easily.',
    prep9m:
      'Dice ripe (or lightly cooked, if firm) pear into pea-to-bite-sized soft pieces.',
    prep12m:
      'Dice ripe pear into small bite-sized pieces, cooking first if the pear is still firm.',
    chokingNotes: 'A firm, underripe pear behaves like raw apple — cook it until soft if it does not yield easily to gentle pressure.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'blueberry',
    name: 'Blueberry',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'moderate',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Smash each blueberry flat with a fork so no whole, round berry shape remains, and mix into yogurt or oats.',
    prep9m:
      'Smash flat or quarter lengthwise so no round or half-berry shape remains.',
    prep12m:
      'Quarter lengthwise rather than serving whole, even as chewing improves.',
    chokingNotes: 'Whole blueberries are round, firm, and exactly airway-sized — always smash flat or quarter before serving, at any age.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'carrot',
    name: 'Carrot',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Steam or boil until it mashes easily between two fingers — never serve raw carrot under 12 months. Cut into a finger-length spear.',
    prep9m:
      'Cook until soft and cut into pea-to-bite-sized soft cubes; still avoid raw carrot.',
    prep12m:
      'Cook until tender-soft and dice into small bite-sized pieces; hold off on raw carrot sticks until chewing is confident, well beyond 12 months.',
    chokingNotes: 'Raw carrot is hard and can shear into a firm, airway-blocking chunk — always cook until it mashes easily under 12 months.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    // Item 356. Levels from USDA FoodData Central 170093 (potatoes, baked, flesh and skin,
    // without salt): iron 1.08 mg, vitamin C 9.6 mg, fiber 2.2 g per 100 g — and the peeled
    // flesh the youngest babies get is 0.31-0.35 mg of iron. See
    // .workflow/scratch/catalog-expansion/sources.md §11 for how each level was bucketed.
    slug: 'potato',
    name: 'Potato',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'moderate',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Peel, then steam, boil, or bake until it mashes easily between two fingers, and serve as a thick finger-length wedge or strip — never raw and never a firm cube.',
    prep9m:
      'Cook until it mashes easily between two fingers, then serve as a soft mash or in pea-to-bite-sized soft pieces; the skin can stay on once baby handles it well.',
    prep12m:
      'Cook until tender and serve in small bite-sized pieces, or as a soft mash stirred loose rather than beaten sticky.',
    chokingNotes: 'Raw or under-cooked potato is hard and slippery and can shear into a firm, airway-blocking chunk — always cook until it mashes easily between two fingers, peel it for the youngest babies, and never serve raw or firm cubes. Stiff, gluey mash is hard to swallow too, so keep it loose and soft.',
    notes: 'A gentle, filling everyday vegetable with more vitamin C than it gets credit for, especially cooked in its skin. Serve it with no added salt, and trim away any green patches or sprouts before cooking.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'zucchini',
    name: 'Zucchini',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Steam or roast until soft and cut into a finger-length spear, skin on or off.',
    prep9m:
      'Cook until soft and dice into pea-to-bite-sized soft pieces.',
    prep12m:
      'Cook until tender and dice into small bite-sized pieces.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'green_beans',
    name: 'Green Beans',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Steam until very soft and serve whole, trimmed pods as a finger food that mashes easily between two fingers.',
    prep9m:
      'Steam until soft and cut into pea-to-bite-sized pieces.',
    prep12m:
      'Steam until tender and cut into small bite-sized pieces.',
    chokingNotes: 'Under-cooked green beans are stringy and fibrous — cook until they mash easily before serving.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'peas',
    name: 'Peas',
    category: 'veg',
    ironLevel: 'moderate',
    vitaminCLevel: 'high',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook until soft and mash or squash each pea flat, since whole round peas can be a choking hazard.',
    prep9m:
      'Cook until soft and squash flat between finger and thumb, or serve lightly mashed.',
    prep12m:
      'Cook until tender; once chewing is confident, whole soft peas can be offered in small amounts, though squashing remains the safer default.',
    chokingNotes: 'Whole round peas are small and firm enough to be a choking hazard — squash or mash rather than serving straight from the pod.',
    notes: 'A useful vitamin-C food to pair with an iron-rich protein or grain.',
    allergens: [],
    storageCategory: 'produce_cooked_soft',
  },
  {
    slug: 'rice',
    name: 'Rice',
    category: 'grain',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Cook until very soft and sticky, then press into a soft ball or patty shape rather than serving loose grains.',
    prep9m:
      'Cook until soft and serve as loose grains for pincer-grasp practice, or pressed into small bites.',
    prep12m:
      'Serve as soft cooked grains alongside other foods.',
    chokingNotes: 'Cool and reheat rice carefully, and reheat only once — discard any leftovers after that single reheat.',
    allergens: [],
    storageCategory: 'grain_cooked',
  },
  {
    slug: 'watermelon',
    name: 'Watermelon',
    category: 'fruit',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Remove all seeds and rind, and cut into a finger-length wedge or stick that is not too thin to grip.',
    prep9m:
      'Remove all seeds and rind, and dice into pea-to-bite-sized pieces.',
    prep12m:
      'Remove all seeds and rind, and dice into small bite-sized pieces.',
    chokingNotes: 'Watermelon is slippery and can slide toward the throat in large pieces — check thoroughly for seeds and keep pieces a manageable, gummable size.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },

  // ---- Plain meats (item 330) ----
  {
    slug: 'chicken',
    name: 'Chicken',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook breast meat thoroughly and serve as a finger-length strip cut along the grain, or shred it finely and moisten with cooking liquid or olive oil so it is never dry or stringy.',
    prep9m:
      'Cook thoroughly and shred or chop into soft, pea-sized pieces for pincer-grasp self-feeding, moistened so they do not crumble apart.',
    prep12m:
      'Cook thoroughly and dice into small, soft bite-sized pieces.',
    chokingNotes: 'Breast meat dries out faster than thigh and turns stringy or crumbly when it does — keep it moist, trim any gristle, and check carefully for small bones before serving.',
    notes: 'Leaner and milder than chicken thigh, which carries more iron — reach for thigh when the meal is meant to be the iron anchor.',
    allergens: [],
    storageCategory: 'meat_poultry_cooked',
  },
  {
    slug: 'turkey',
    name: 'Turkey',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Shape ground turkey into a thin, moist patty and cut it into finger-length strips, or slow-cook thigh meat and shred it finely, moistened with cooking liquid.',
    prep9m:
      'Cook thoroughly and serve as soft, pea-sized pieces of mince or shredded thigh, or as a small meatball squashed flat.',
    prep12m:
      'Cook thoroughly and dice or shred into small, soft bite-sized pieces.',
    chokingNotes: 'Ground turkey is very lean and cooks dry and crumbly — bind it with grated vegetable or a little oil, and never serve a firm, round meatball whole.',
    notes: 'A mild poultry with a little more iron than chicken breast; dark thigh meat carries the most.',
    allergens: [],
    storageCategory: 'meat_poultry_cooked',
  },
  {
    slug: 'pork',
    name: 'Pork',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Choose a tender cut such as loin or tenderloin, cook it well-done, and serve a finger-length strip cut along the grain, moistened with cooking liquid or olive oil.',
    prep9m:
      'Cook well-done and shred or finely chop into soft, pea-sized pieces.',
    prep12m:
      'Cook until tender and dice into small, soft bite-sized pieces, or slow-cook and shred.',
    chokingNotes: 'Pork firms up and turns chewy the moment it is overcooked — keep it moist, shred it finely against the grain, and trim every piece of fat, rind, and gristle first.',
    notes: 'Fresh, tender cuts only — bacon, ham, sausage, and every other cured pork carries far too much salt for a baby, whatever the cut underneath.',
    allergens: [],
    storageCategory: 'meat_poultry_cooked',
  },
  {
    slug: 'lamb',
    name: 'Lamb',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Use lamb mince cooked well-done and moistened into a soft pile, or slow-cook shoulder until it falls apart and serve a finger-length shred.',
    prep9m:
      'Cook well-done and serve soft, pea-sized pieces of mince or shredded slow-cooked shoulder.',
    prep12m:
      'Slow-cook until tender and dice or shred into small, soft bite-sized pieces.',
    chokingNotes: 'Chops and any cut on the bone are not a baby food — serve mince or slow-cooked shoulder only, and check by feel for bone fragments before every serving.',
    notes: 'Richer and more strongly flavoured than chicken or pork, with a little more iron — an easy way to widen the meat rotation.',
    allergens: [],
    storageCategory: 'meat_poultry_cooked',
  },

  // ---- More fish ----
  {
    slug: 'cod',
    name: 'Cod',
    category: 'protein',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Bake or poach until it flakes, then serve a soft finger-length piece, running your fingers through it for bones first.',
    prep9m:
      'Cook through and flake into soft, pea-sized pieces, re-checking for stray bones.',
    prep12m:
      'Cook through and flake into small bite-sized pieces, or serve a small piece of fillet to pick apart.',
    chokingNotes: 'Cod is a low-bone fish, not a boneless one — run your fingers through every flake before serving, and moisten dry flakes with a little cooking liquid or olive oil.',
    notes: 'A mild, low-mercury white fish and an easy first try at the fish step of the allergen ladder. Lean enough that it carries very little iron, so pair it with an iron-rich food rather than leaning on it.',
    allergens: ['fish'],
    storageCategory: 'fish_seafood_cooked',
  },
  {
    slug: 'trout',
    name: 'Trout',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Bake or poach until just cooked through, then flake into a soft finger-length piece, feeling carefully for pin bones.',
    prep9m:
      'Cook through and flake into soft, pea-sized pieces, checking for pin bones twice.',
    prep12m:
      'Cook through and flake into small bite-sized pieces.',
    chokingNotes: 'Trout carries a row of fine pin bones that survive cooking — check every flake by feel, twice, even from a fillet sold as deboned.',
    notes: 'A low-mercury freshwater fish with a gentler flavour than salmon; another option for the fish step of the allergen ladder.',
    allergens: ['fish'],
    storageCategory: 'fish_seafood_cooked',
  },
  {
    slug: 'tuna',
    name: 'Canned Light Tuna',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Drain skipjack ("light") tuna canned in water and mash it smooth with plain yogurt, mashed avocado, or olive oil so it is not dry and crumbly, then serve as a soft mashed pile or spread a thin layer on a soft toast finger.',
    prep9m:
      'Mash drained light tuna smooth with yogurt or olive oil and serve as soft, pea-sized dollops, or stir it through soft pasta or a vegetable mash.',
    prep12m:
      'Mash or flake drained light tuna into small bite-sized pieces, stirred through pasta or spread thinly.',
    chokingNotes: 'Drained tuna is dry and crumbly on its own and packs into a dense ball in the mouth — always mash it with something wet, such as plain yogurt, mashed avocado, or a little olive oil.',
    notes: 'Skipjack ("light") tuna canned in water only — never albacore, white, or bigeye tuna, which carry far more mercury. Keep it to about one small serving (roughly 1 ounce / 30g) a week while baby is under two, and choose a no-salt-added can.',
    allergens: ['fish'],
    storageCategory: 'fish_seafood_cooked',
  },

  // ---- Plain oats ----
  {
    slug: 'oats',
    name: 'Oats',
    category: 'grain',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Simmer rolled or quick oats with plenty of water, breast milk, or formula into a smooth, thin porridge loose enough to drip slowly off a spoon.',
    prep9m:
      'Simmer to a thicker, spoonable porridge with a little texture left, or stir cooked oats into pancakes or soft oat patties.',
    prep12m:
      'Simmer to a thick, family-style porridge, or bake cooked oats into muffins, pancakes, or patties.',
    chokingNotes: 'Steel-cut and jumbo oats stay firm and chewy — use rolled or quick oats, cook them until soft, and never serve dry oats or uncooked muesli.',
    notes: 'Plain oats are not a substitute for iron-fortified oats, which carry several times the iron — use the fortified kind when the meal is meant to be the iron anchor, and pair either one with a vitamin-C food.',
    allergens: [],
    storageCategory: 'grain_cooked',
  },

  // ---- Seeds ----
  {
    slug: 'sesame_seeds',
    name: 'Sesame Seeds',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Grind to a fine meal and stir a pinch through porridge or yogurt, or sprinkle a pinch of whole seeds over a wet food so they cling rather than scatter.',
    prep9m:
      'Sprinkle a pinch of whole or ground seeds over yogurt, porridge, hummus, or soft vegetables, or stir them through a mash.',
    prep12m:
      'Sprinkle over family food or stir into a dip or a mash — still a pinch, never a spoonful.',
    chokingNotes: 'Sesame seeds are small, but a dry spoonful of any seed can be inhaled — sprinkle a pinch onto wet food so the seeds stick, and never hand over a spoon or a pile of dry seeds.',
    notes: 'A sesame carrier alongside tahini, and one of the most iron-dense foods here by weight — though a pinch is a small amount, so keep tahini or another anchor doing the heavy lifting and pair with a vitamin-C food.',
    allergens: ['sesame'],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'chia_seeds',
    name: 'Chia Seeds',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Always soak first: stir 1 teaspoon into 4-5 tablespoons of milk, water, or mashed fruit and leave it 10 minutes or longer until the seeds swell into a soft gel, then thin it to a smooth, spoonable porridge.',
    prep9m:
      'Serve soaked, gelled chia stirred through yogurt, porridge, or a fruit mash, still spoonable rather than stiff.',
    prep12m:
      'Serve soaked chia in puddings, porridge, or smoothies; soak it before it goes in, never dry.',
    chokingNotes: 'Dry chia absorbs many times its weight in liquid and can swell and clump after it is swallowed — always bloom it for at least 10 minutes or stir it into a wet food, and never offer it dry.',
    notes: 'A very high-fiber seed: a teaspoon at a time is plenty, with extra fluid alongside. Pair with a vitamin-C food to get more from its plant-based iron.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'flax_seeds',
    name: 'Flax Seeds',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Use ground flaxseed only: stir 1 teaspoon of the ground meal through porridge, yogurt, or a vegetable mash until it disappears.',
    prep9m:
      'Stir ground flaxseed through porridge, yogurt, fruit mash, or a fritter mix.',
    prep12m:
      'Stir ground flaxseed into porridge or baking; whole seeds stay off the menu.',
    chokingNotes: 'Whole flaxseeds are hard and slippery and pass straight through undigested — grind them first, every time, and stir the meal into a wet food rather than serving it dry.',
    notes: 'Grind in small batches and keep the meal in the fridge — flax turns rancid quickly once ground. Pair with a vitamin-C food to boost absorption of its plant-based iron.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'hemp_seeds',
    name: 'Hemp Seeds',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Sprinkle a pinch of hulled hemp hearts over a wet food such as porridge, yogurt, or a vegetable mash, or stir them through so they soften.',
    prep9m:
      'Sprinkle or stir hulled hemp hearts through porridge, yogurt, soft fruit, or vegetables.',
    prep12m:
      'Sprinkle hulled hemp hearts over family food, or stir them into porridge, dips, and baking.',
    chokingNotes: 'Buy hulled hemp hearts rather than whole hemp seed with the shell on — the hearts are soft and crumble easily, while the shell is hard and fibrous.',
    notes: 'Soft enough to need no grinding, which makes it the gentlest seed to start with. Pair with a vitamin-C food to boost absorption of its plant-based iron.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'pumpkin_seeds',
    name: 'Pumpkin Seeds',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Grind hulled pumpkin seeds to a fine meal and stir 1 teaspoon through porridge, yogurt, or a vegetable mash, or thin a smooth pumpkin seed butter with warm water until runny.',
    prep9m:
      'Stir finely ground pumpkin seed meal through porridge, yogurt, or a mash, or thin smooth pumpkin seed butter until runny and spread it very thinly.',
    prep12m:
      'Keep to ground meal or thinned smooth butter; whole and chopped seeds stay off the menu well past this age.',
    chokingNotes: 'Whole pumpkin seeds are named as a choking hazard alongside whole nuts and stay off the menu until age 4-5 — grind them to a fine meal or use a smooth butter thinned runny, never whole, chopped, or roasted as a snack.',
    notes: 'A dense plant-based iron source once ground. Pair with a vitamin-C food to boost absorption.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'sunflower_seed_butter',
    name: 'Sunflower Seed Butter',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Thin 1-2 teaspoons of smooth, unsalted, unsweetened sunflower seed butter with warm water, breast milk, or formula until runny, then serve on a pre-loaded spoon or spread a very thin layer on a soft toast finger.',
    prep9m:
      'Thin smooth sunflower seed butter until runny and stir it into porridge or yogurt, or spread it thinly on toast or banana.',
    prep12m:
      'Thin smooth sunflower seed butter until runny for spreads and dips; still avoid thick spoonfuls or globs.',
    chokingNotes: 'Thick or sticky seed butter is a serious choking hazard — always thin it until runny, spread only a light layer, and never serve a spoonful straight or whole sunflower seeds.',
    notes: 'Not a nut butter: sunflower seed is neither a peanut nor a tree nut, which makes it the usual stand-in when nuts are off the menu. Check the label for added salt and sugar.',
    allergens: [],
    storageCategory: 'nut_seed_butter_thinned',
  },

  // ---- Tree nuts (ground or thinned only) ----
  {
    slug: 'cashew_butter',
    name: 'Cashew Butter',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'moderate',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Thin 1-2 teaspoons of smooth, unsalted cashew butter with warm water, breast milk, or formula until runny, then serve on a pre-loaded spoon or spread a very thin layer on a soft toast finger.',
    prep9m:
      'Thin smooth cashew butter until runny and stir it into porridge or yogurt, or spread it thinly on toast or soft fruit.',
    prep12m:
      'Thin smooth cashew butter until runny for spreads and dips; still avoid thick spoonfuls or globs.',
    chokingNotes: 'Thick or sticky nut butter is a serious choking hazard — always thin it until runny, and never serve whole or chopped cashews, which stay off the menu until age 4-5.',
    notes: 'A tree-nut ladder option alongside almond butter, and a good plant-based iron source — pair with a vitamin-C food. Cashew and pistachio are closely related, so a reaction to one means taking care with the other.',
    allergens: ['tree_nut'],
    storageCategory: 'nut_seed_butter_thinned',
  },
  {
    slug: 'walnuts',
    name: 'Walnuts',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Grind shelled walnuts to a fine, flour-like meal and stir 1 teaspoon through porridge, yogurt, or a fruit mash — never a piece, a half, or a whole nut.',
    prep9m:
      'Stir finely ground walnut meal through porridge, yogurt, soft fruit, or a fritter mix.',
    prep12m:
      'Keep to finely ground walnut meal stirred into food, or a smooth walnut butter thinned runny; pieces stay off the menu.',
    chokingNotes: 'Whole nuts and nut pieces are a serious choking hazard and stay off the menu until age 4-5 — grind walnuts to a fine meal and stir it into a wet food so nothing crunchy is left.',
    notes: 'A tree-nut carrier for the allergen ladder. Grind in small batches and keep the meal in the fridge — walnut meal turns rancid quickly.',
    allergens: ['tree_nut'],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'pistachios',
    name: 'Pistachios',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Use shelled, unsalted pistachios ground to a fine, flour-like meal, and stir 1 teaspoon through porridge, yogurt, or a fruit mash.',
    prep9m:
      'Stir finely ground pistachio meal through porridge, yogurt, soft fruit, or a mash.',
    prep12m:
      'Keep to finely ground pistachio meal stirred into food; whole and chopped nuts stay off the menu.',
    chokingNotes: 'Whole and chopped pistachios are a serious choking hazard and stay off the menu until age 4-5 — grind them to a fine meal, and never serve them in the shell.',
    notes: 'Buy unsalted kernels: salted pistachios carry far too much sodium for a baby. Pistachio and cashew are closely related, so a reaction to one means taking care with the other.',
    allergens: ['tree_nut'],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'hazelnuts',
    name: 'Hazelnuts',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Grind skinned, shelled hazelnuts to a fine, flour-like meal and stir 1 teaspoon through porridge, yogurt, or a fruit mash, or thin a plain smooth hazelnut butter with warm water until runny.',
    prep9m:
      'Stir finely ground hazelnut meal through porridge, yogurt, or soft fruit, or spread thinned plain hazelnut butter very thinly.',
    prep12m:
      'Keep to finely ground hazelnut meal or thinned plain hazelnut butter; whole and chopped nuts stay off the menu.',
    chokingNotes: 'Whole and chopped hazelnuts are a serious choking hazard and stay off the menu until age 4-5 — grind them to a fine meal, or use a plain smooth butter thinned runny.',
    notes: 'Use a plain hazelnut butter with nothing added — a chocolate hazelnut spread is mostly sugar and is not a way to introduce this allergen.',
    allergens: ['tree_nut'],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'pecans',
    name: 'Pecans',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Grind shelled pecans to a fine, flour-like meal and stir 1 teaspoon through porridge, yogurt, or a fruit mash.',
    prep9m:
      'Stir finely ground pecan meal through porridge, yogurt, soft fruit, or a mash.',
    prep12m:
      'Keep to finely ground pecan meal stirred into food; halves and pieces stay off the menu.',
    chokingNotes: 'Pecan halves and pieces are a serious choking hazard and stay off the menu until age 4-5 — grind them to a fine meal and stir it into a wet food.',
    notes: 'A tree-nut carrier for the allergen ladder. Grind in small batches and keep the meal in the fridge — pecan meal is oily and turns rancid quickly.',
    allergens: ['tree_nut'],
    storageCategory: 'pantry_dry',
  },
  // Item 342: the plain nuts behind the two butters the catalog already carries.
  // `almond_butter` and `cashew_butter` stay — a ground meal and a thinned butter
  // are different things on the tray — and both rows are held to the same rule as
  // the other ground nuts: a fine, flour-like meal stirred into a wet food, never a
  // piece, a half, or a whole nut.
  {
    slug: 'almonds',
    name: 'Almonds',
    category: 'protein',
    ironLevel: 'moderate',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Grind shelled almonds to a fine, flour-like meal and stir 1 teaspoon through porridge, yogurt, or a fruit mash — never a piece, a half, or a whole nut.',
    prep9m:
      'Stir finely ground almond meal through porridge, yogurt, soft fruit, or a mash.',
    prep12m:
      'Keep to finely ground almond meal stirred into food, or a smooth almond butter thinned runny; pieces and whole nuts stay off the menu.',
    chokingNotes: 'Whole and chopped almonds are a serious choking hazard and stay off the menu until age 4-5 — grind them to a fine meal and stir it into a wet food so nothing hard is left.',
    notes: 'The plain-nut form of the tree-nut ladder step almond butter already covers. Plain ground almonds (sold as almond flour or almond meal) are the same thing, as long as nothing is added to them.',
    allergens: ['tree_nut'],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'cashews',
    name: 'Cashews',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
    fiberLevel: 'high',
    chokingRisk: 'high',
    minAgeMonths: 6,
    prep6m:
      'Grind plain, unsalted cashews to a fine, flour-like meal and stir 1 teaspoon through porridge, yogurt, or a fruit mash — never a piece, a half, or a whole nut.',
    prep9m:
      'Stir finely ground cashew meal through porridge, yogurt, soft fruit, or a mash.',
    prep12m:
      'Keep to finely ground cashew meal stirred into food, or a smooth cashew butter thinned runny; pieces and whole nuts stay off the menu.',
    chokingNotes: 'Whole and chopped cashews are a serious choking hazard and stay off the menu until age 4-5 — grind them to a fine meal and stir it into a wet food, or use a plain smooth cashew butter thinned runny.',
    notes: 'Buy plain, unsalted kernels: salted cashews carry far too much sodium for a baby. One of the better plant-based iron sources, so pair it with a vitamin-C food. Cashew and pistachio are closely related, so a reaction to one means taking care with the other.',
    allergens: ['tree_nut'],
    storageCategory: 'pantry_dry',
  },

  // ---- Spices & herbs (item 329) ----
  // `prep6m/9m/12m` answer "how do I use this at this age", not "what shape do
  // I cut it into": a spice is never the thing on the tray. Every level is
  // `low` because a serving is a pinch — see
  // .workflow/scratch/catalog-expansion/sources.md for the per-100 g figures
  // and why they do not decide the badge. No spice has a basic recipe.
  {
    slug: 'cinnamon',
    name: 'Cinnamon',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Add a pinch of ground cinnamon to porridge, mashed fruit, or roasting vegetables while you cook — enough to smell, not enough to see, and with no sweetener alongside it.',
    prep9m:
      'Stir a pinch into porridge, yogurt, apple or pear mash, or squash; cinnamon is there for flavour, not sweetness.',
    prep12m:
      'Use a pinch in family cooking and baking — porridge, stewed fruit, squash, lentils — still with no added sugar.',
    chokingNotes: 'Never let baby lick dry cinnamon off a spoon or a finger: loose powder is easy to inhale and irritates the airway. Mix it into food instead.',
    notes: 'Ceylon ("true") cinnamon is the gentler choice if cinnamon becomes a daily habit; the common cassia kind is fine now and then. Cinnamon is a flavour, not a sweetener — the no-added-sugar rule still applies.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'cumin',
    name: 'Cumin',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Warm a pinch of ground cumin in the pan with the vegetables, lentils, or meat you are already cooking — a few seconds in the oil takes the raw edge off.',
    prep9m:
      'Add a pinch of ground cumin to lentils, beans, squash, or minced meat as they cook.',
    prep12m:
      'Use a pinch in family cooking — curries, stews, roasted vegetables, hummus — as long as the dish stays salt-free.',
    chokingNotes: 'Stir ground spice into food rather than sprinkling it on top dry — loose powder is easy to inhale.',
    notes: 'Warm and earthy rather than hot. Cumin is one of the easiest ways to make a salt-free lentil or bean dish taste like a real meal.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'turmeric',
    name: 'Turmeric',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Stir a small pinch of ground turmeric into whatever you are cooking — lentils, rice, egg, or vegetables — and let it cook through rather than adding it at the table.',
    prep9m:
      'Add a pinch to lentils, rice, soups, or vegetables as they cook.',
    prep12m:
      'Use a pinch in family cooking; a little fat in the dish helps carry the flavour.',
    chokingNotes: 'Stir ground spice into food rather than sprinkling it on dry — loose powder is easy to inhale.',
    notes: 'Mild and slightly bitter, and it stains everything it touches — clothes, high chairs, and hands included. Use it for flavour and colour; it is not a supplement.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'paprika',
    name: 'Sweet Paprika',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Use sweet (mild) paprika only, and stir a pinch into vegetables, chicken, or a tomato-based sauce as it cooks.',
    prep9m:
      'Add a pinch of sweet paprika to roasting vegetables, minced meat, beans, or a soft stew.',
    prep12m:
      'Use a pinch in family cooking wherever a gentle, sweet-peppery flavour and a little colour help.',
    chokingNotes: 'Stir ground spice into food rather than sprinkling it on dry — loose powder is easy to inhale.',
    notes: 'Sweet paprika only — hot paprika, smoked hot paprika, chili powder, and cayenne all carry a heat a baby has no reason to meet. Check the jar says sweet or mild.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'curry_powder',
    name: 'Mild Curry Powder',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Use a mild blend with no salt and no chili, and cook a small pinch into lentils, vegetables, or a soft stew rather than stirring it in at the end.',
    prep9m:
      'Add a pinch of mild curry powder to lentils, chickpeas, squash, or minced meat as they cook.',
    prep12m:
      'Use a pinch in family curries and stews, keeping the blend mild and the dish salt-free.',
    chokingNotes: 'Stir the blend into food as it cooks rather than sprinkling it on dry — loose powder is easy to inhale.',
    notes: 'Blends vary enormously, so read the label and pick one with no salt and no chili or cayenne. Most supermarket mild curry powder is mostly cumin, coriander, and turmeric, which is exactly the gentle end of the shelf.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'black_pepper',
    name: 'Black Pepper',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'A pinch of finely ground black pepper cooked into food is fine; skip the mill at the table, where the coarse grind lands on top.',
    prep9m:
      'Add a small pinch of finely ground pepper to savoury food as it cooks.',
    prep12m:
      'Use a pinch in family cooking, keeping it finely ground rather than coarse.',
    chokingNotes: 'Coarse grinds and whole peppercorns make babies cough and sneeze and can be inhaled — use a fine grind stirred into food, and keep whole peppercorns out of reach.',
    notes: 'Mild warmth rather than chili heat. Pepper is one of the flavour-builders that makes salt-free cooking taste finished.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'oregano',
    name: 'Oregano',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Rub a pinch of dried oregano between your fingers to break it up finely, then cook it into a tomato sauce, vegetables, or minced meat.',
    prep9m:
      'Add a pinch of finely rubbed dried oregano to pasta sauce, beans, vegetables, or a soft stew.',
    prep12m:
      'Use a pinch in family cooking, or a little fresh oregano chopped very finely.',
    chokingNotes: 'Whole dried leaves are papery and can stick to the roof of the mouth or the back of the throat — rub them fine between your fingers and cook them into the dish.',
    notes: 'A gentle Mediterranean herb that does a lot of work in a salt-free tomato sauce.',
    allergens: [],
    storageCategory: 'pantry_dry',
  },
  {
    slug: 'garlic',
    name: 'Garlic',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    // The one spice with a shape: a raw clove is firm, round, and airway-sized,
    // which is how chickpeas and whole beans are bucketed too. Everything else
    // in this category is a powder, a grating, or a chopped leaf.
    chokingRisk: 'moderate',
    minAgeMonths: 6,
    prep6m:
      'Cook it, never raw: soften finely minced or crushed garlic in the pan before the other ingredients go in, or roast a whole clove until soft and stir the paste through a mash. Half a small clove is plenty for a baby portion.',
    prep9m:
      'Cook finely minced garlic into vegetables, lentils, sauces, or minced meat; salt-free garlic powder works the same way.',
    prep12m:
      'Use finely minced cooked garlic in family cooking; raw garlic is harsh and stays off the menu for now.',
    chokingNotes: 'A whole or halved clove is firm, round, and exactly the wrong size — mince, crush, or roast it to a soft paste, and never serve a raw piece.',
    notes: 'One of the best salt-free flavour-builders there is. If you reach for garlic powder, check the label says garlic only — garlic salt is mostly salt.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'ginger',
    name: 'Ginger',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Peel and grate fresh ginger on the fine side of a grater, and cook a small pinch into the dish rather than adding it raw.',
    prep9m:
      'Cook finely grated ginger into lentils, squash, carrot, chicken, or a mild curry.',
    prep12m:
      'Use finely grated or very finely minced ginger in family cooking; ground dried ginger works too.',
    chokingNotes: 'Ginger is fibrous and stringy — grate it finely and cook it in, and never serve a slice, a coin, or a chunk.',
    notes: 'Warming rather than hot. Ginger and turmeric are both good ways to make a mild, salt-free vegetable dish taste like something.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'basil',
    name: 'Basil',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Chop fresh basil very finely and stir it through a warm mash, soft pasta, or a tomato sauce at the end of cooking.',
    prep9m:
      'Stir very finely chopped fresh basil into pasta, tomato sauce, soft vegetables, or a mash.',
    prep12m:
      'Use finely chopped fresh basil in family food; whole leaves stay off the menu until chewing is confident.',
    chokingNotes: 'A whole basil leaf is slippery and can fold over the airway — always chop it finely rather than serving leaves whole.',
    notes: 'Add it at the end: the flavour fades with long cooking. Dried basil works too, rubbed fine between your fingers.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'cilantro',
    name: 'Cilantro',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Chop fresh cilantro leaves very finely and stir a small amount through a warm mash, lentils, or rice at the end of cooking.',
    prep9m:
      'Stir very finely chopped cilantro into rice, lentils, beans, or soft vegetables.',
    prep12m:
      'Use finely chopped cilantro in family food; the stalks are stringy, so stick to the leaves.',
    chokingNotes: 'Whole leaves and stalks are stringy and slippery — chop finely and stir them in rather than serving sprigs.',
    notes: 'Fresh and citrusy, and an early flavour in a great many cuisines. Some people taste it as soapy, which is genetic — if your baby turns it down, that may be why.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
  {
    slug: 'dill',
    name: 'Dill',
    category: 'spice',
    ironLevel: 'low',
    vitaminCLevel: 'low',
    fiberLevel: 'low',
    chokingRisk: 'low',
    minAgeMonths: 6,
    prep6m:
      'Snip the soft fronds finely with scissors and stir a small amount through a warm mash, yogurt, or flaked fish at the end of cooking.',
    prep9m:
      'Stir finely snipped dill fronds into a yogurt dip, soft vegetables, or fish.',
    prep12m:
      'Use finely snipped fresh dill in family food, keeping the tough stalks out.',
    chokingNotes: 'Dill stalks are tough and stringy — use only the soft fronds, snipped small.',
    notes: 'Mild and grassy, and a natural partner for the fish and yogurt already in this catalog.',
    allergens: [],
    storageCategory: 'produce_raw_cut',
  },
]
