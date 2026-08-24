import type { FoodSeed } from './types'

// ~40 starter foods spanning iron anchors, vitamin-C pairing foods, allergen vehicles, and
// staples. minAgeMonths is 6 for nearly everything (BLW typically starts around 6 months when
// baby shows readiness signs); shellfish is held to 9 months per the allergen ladder ordering.
// Prep guidance is age-specific: 6-8m favors palmar-grasp finger shapes and thinned textures,
// 9-11m favors pea-sized pincer-grasp pieces, 12m+ moves toward family bite-sized textures.
export const foods: FoodSeed[] = [
  // ---- Iron anchors ----
  {
    slug: 'beef',
    name: 'Beef',
    category: 'protein',
    ironLevel: 'high',
    vitaminCLevel: 'low',
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
    slug: 'zucchini',
    name: 'Zucchini',
    category: 'veg',
    ironLevel: 'low',
    vitaminCLevel: 'moderate',
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
]
