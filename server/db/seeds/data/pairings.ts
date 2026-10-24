import type { PairingSeed } from './types'

// Curated iron-food -> vitamin-C-food pairings. Vitamin C meaningfully boosts absorption of
// non-heme (plant-based) iron; heme iron from meat, poultry, and fish already absorbs well on
// its own, but a vitamin-C side still rounds out the meal, so meats and fish get pairings too,
// alongside the non-heme pairings that matter most nutritionally. Every catalog iron food and
// vitamin-C food has at least one (883b; pairings.test.ts lists the exceptions).
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
  {
    ironFoodSlug: 'tahini',
    vitCFoodSlug: 'orange',
    reason: "Vitamin C from orange segments boosts absorption of the non-heme iron in tahini's sesame paste.",
  },
  {
    ironFoodSlug: 'tahini',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of tahini's non-heme iron.",
  },
  {
    ironFoodSlug: 'sesame_seeds',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of the non-heme iron in a pinch of sesame seeds.",
  },
  {
    ironFoodSlug: 'chia_seeds',
    vitCFoodSlug: 'strawberry',
    reason: 'Mashed strawberry soaked into chia gel adds the vitamin C that makes its plant-based iron easier to absorb.',
  },
  {
    ironFoodSlug: 'flax_seeds',
    vitCFoodSlug: 'orange',
    reason: 'A little orange alongside ground flaxseed boosts how much of its non-heme iron baby actually absorbs.',
  },
  {
    ironFoodSlug: 'hemp_seeds',
    vitCFoodSlug: 'kiwi',
    reason: "Kiwi's vitamin C helps baby absorb more of the plant-based iron in hemp hearts.",
  },
  {
    ironFoodSlug: 'pumpkin_seeds',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C converts ground pumpkin seed's non-heme iron into a form baby's body takes up far more easily.",
  },
  {
    ironFoodSlug: 'cashew_butter',
    vitCFoodSlug: 'mango',
    reason: "Mango's vitamin C boosts absorption of the non-heme iron in thinned cashew butter.",
  },
  {
    ironFoodSlug: 'cashews',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of the non-heme iron in finely ground cashew meal.",
  },
  {
    ironFoodSlug: 'white_beans',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of the plant-based iron in white beans.",
  },
  {
    ironFoodSlug: 'kidney_beans',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C helps baby absorb more of the plant-based iron in kidney beans.",
  },
  {
    ironFoodSlug: 'pinto_beans',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C helps baby absorb more of the plant-based iron in pinto beans.",
  },
  {
    ironFoodSlug: 'butter_beans',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of the plant-based iron in butter beans.",
  },
  {
    ironFoodSlug: 'edamame',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of the plant-based iron in edamame.",
  },
  {
    ironFoodSlug: 'lentils',
    vitCFoodSlug: 'brussels_sprouts',
    reason: "Brussels sprouts' vitamin C helps baby absorb more of the plant-based iron in lentils.",
  },
  {
    ironFoodSlug: 'chickpeas',
    vitCFoodSlug: 'kale',
    reason: "Cooked kale's vitamin C helps baby absorb more of the plant-based iron in chickpeas.",
  },
  {
    ironFoodSlug: 'tofu',
    vitCFoodSlug: 'kale',
    reason: "Cooked kale's vitamin C helps baby absorb more of tofu's non-heme iron.",
  },
  {
    ironFoodSlug: 'iron_fortified_oats',
    vitCFoodSlug: 'cranberries',
    reason: 'Mashed cooked cranberries swirled into iron-fortified oats add the vitamin C that helps baby absorb the added non-heme iron.',
  },
  // 880: every partner a food's notes used to name is a pairing row instead (the notes no longer list them).
  {
    ironFoodSlug: 'turkey',
    vitCFoodSlug: 'cranberries',
    reason: "Cooked cranberries' vitamin C rounds out the meal alongside turkey's heme iron.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'cranberries',
    reason: "Cooked cranberries add vitamin C variety alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'lentils',
    vitCFoodSlug: 'kale',
    reason: "Cooked kale's vitamin C helps baby absorb more of the plant-based iron in lentils.",
  },
  {
    ironFoodSlug: 'egg',
    vitCFoodSlug: 'kale',
    reason: "Cooked kale's vitamin C helps baby absorb more of the iron in egg.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'kale',
    reason: "Cooked kale's vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'brussels_sprouts',
    reason: "Brussels sprouts' vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'lentils',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C helps baby absorb more of the plant-based iron in lentils.",
  },
  {
    ironFoodSlug: 'kidney_beans',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C helps baby absorb more of the plant-based iron in kidney beans.",
  },
  {
    ironFoodSlug: 'pinto_beans',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C helps baby absorb more of the plant-based iron in pinto beans.",
  },
  {
    ironFoodSlug: 'white_beans',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C helps baby absorb more of the plant-based iron in white beans.",
  },
  {
    ironFoodSlug: 'white_beans',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C helps baby absorb more of the plant-based iron in white beans.",
  },
  {
    ironFoodSlug: 'butter_beans',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C helps baby absorb more of the plant-based iron in butter beans.",
  },
  {
    ironFoodSlug: 'edamame',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C helps baby absorb more of the plant-based iron in edamame.",
  },
  // 883b: partners the older foods' notes named (the notes no longer list them).
  {
    ironFoodSlug: 'chickpeas',
    vitCFoodSlug: 'orange',
    reason: "Orange's vitamin C helps baby absorb more of the plant-based iron in chickpeas.",
  },
  {
    ironFoodSlug: 'chickpeas',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C helps baby absorb more of the plant-based iron in chickpeas.",
  },
  {
    ironFoodSlug: 'black_beans',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C helps baby absorb more of the plant-based iron in black beans.",
  },
  {
    ironFoodSlug: 'lentils',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C helps baby absorb more of the plant-based iron in lentils.",
  },
  {
    ironFoodSlug: 'lentils',
    vitCFoodSlug: 'cauliflower',
    reason: "Cauliflower's vitamin C helps baby absorb more of the plant-based iron in lentils.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'broccoli',
    reason: "Broccoli's vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'cauliflower',
    reason: "Cauliflower's vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'bell_pepper',
    reason: "Bell pepper's vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'orange',
    reason: "Orange's vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'chicken',
    vitCFoodSlug: 'orange',
    reason: "Orange's vitamin C rounds out the meal alongside chicken's heme iron.",
  },
  {
    ironFoodSlug: 'sardines',
    vitCFoodSlug: 'tomato',
    reason: "Tomato's vitamin C rounds out the meal alongside sardines' heme iron.",
  },
  {
    ironFoodSlug: 'chicken_thigh',
    vitCFoodSlug: 'sweet_potato',
    reason: "Sweet potato's vitamin C rounds out the meal alongside chicken thigh's heme iron.",
  },
  // 883b (owner: "do for whole catalog"): every iron and vitamin-C food has at least one partner.
  {
    ironFoodSlug: 'beef',
    vitCFoodSlug: 'potato',
    reason: "Potato's vitamin C rounds out the meal alongside beef's already well-absorbed heme iron.",
  },
  {
    ironFoodSlug: 'egg',
    vitCFoodSlug: 'potato',
    reason: "Potato's vitamin C helps baby absorb more of the iron in egg.",
  },
  {
    ironFoodSlug: 'trout',
    vitCFoodSlug: 'potato',
    reason: "Potato's vitamin C rounds out the meal alongside trout's heme iron.",
  },
  {
    ironFoodSlug: 'chickpeas',
    vitCFoodSlug: 'lemon',
    reason: 'A squeeze of lemon adds the vitamin C that helps baby absorb more of the plant-based iron in chickpeas.',
  },
  {
    ironFoodSlug: 'tahini',
    vitCFoodSlug: 'lemon',
    reason: "A squeeze of lemon adds the vitamin C that helps baby absorb more of tahini's non-heme iron.",
  },
  {
    ironFoodSlug: 'tuna',
    vitCFoodSlug: 'avocado',
    reason: "Mashed avocado's vitamin C rounds out the meal alongside tuna's heme iron.",
  },
  {
    ironFoodSlug: 'black_beans',
    vitCFoodSlug: 'avocado',
    reason: "Avocado's vitamin C helps baby absorb more of the plant-based iron in black beans.",
  },
  {
    ironFoodSlug: 'pork',
    vitCFoodSlug: 'apple',
    reason: "Cooked apple's vitamin C rounds out the meal alongside pork's heme iron.",
  },
  {
    ironFoodSlug: 'peanut_butter',
    vitCFoodSlug: 'apple',
    reason: "Cooked apple's vitamin C helps baby absorb more of the plant-based iron in thinned peanut butter.",
  },
  {
    ironFoodSlug: 'walnuts',
    vitCFoodSlug: 'pear',
    reason: "Pear's vitamin C helps baby absorb more of the plant-based iron in finely ground walnut meal.",
  },
  {
    ironFoodSlug: 'hazelnuts',
    vitCFoodSlug: 'pear',
    reason: "Pear's vitamin C helps baby absorb more of the plant-based iron in finely ground hazelnut meal.",
  },
  {
    ironFoodSlug: 'sunflower_seed_butter',
    vitCFoodSlug: 'pear',
    reason: "Pear's vitamin C helps baby absorb more of the plant-based iron in thinned sunflower seed butter.",
  },
  {
    ironFoodSlug: 'almond_butter',
    vitCFoodSlug: 'strawberry',
    reason: "Strawberry's vitamin C helps baby absorb more of the plant-based iron in thinned almond butter.",
  },
  {
    ironFoodSlug: 'iron_fortified_oats',
    vitCFoodSlug: 'blueberry',
    reason: 'Smashed blueberries stirred into iron-fortified oats add the vitamin C that helps baby absorb the added non-heme iron.',
  },
  {
    ironFoodSlug: 'pecans',
    vitCFoodSlug: 'blueberry',
    reason: "Blueberry's vitamin C helps baby absorb more of the plant-based iron in finely ground pecan meal.",
  },
  {
    ironFoodSlug: 'almonds',
    vitCFoodSlug: 'blueberry',
    reason: "Blueberry's vitamin C helps baby absorb more of the plant-based iron in finely ground almond meal.",
  },
  {
    ironFoodSlug: 'pistachios',
    vitCFoodSlug: 'orange',
    reason: "Orange's vitamin C helps baby absorb more of the plant-based iron in finely ground pistachio meal.",
  },
  {
    ironFoodSlug: 'egg',
    vitCFoodSlug: 'zucchini',
    reason: "Zucchini's vitamin C helps baby absorb more of the iron in egg.",
  },
  {
    ironFoodSlug: 'quinoa',
    vitCFoodSlug: 'zucchini',
    reason: "Zucchini's vitamin C helps baby absorb more of quinoa's non-heme iron.",
  },
  {
    ironFoodSlug: 'salmon',
    vitCFoodSlug: 'green_beans',
    reason: "Green beans' vitamin C rounds out the meal alongside salmon's heme iron.",
  },
  {
    ironFoodSlug: 'chicken',
    vitCFoodSlug: 'green_beans',
    reason: "Green beans' vitamin C rounds out the meal alongside chicken's heme iron.",
  },
  {
    ironFoodSlug: 'lamb',
    vitCFoodSlug: 'peas',
    reason: "Peas' vitamin C rounds out the meal alongside lamb's heme iron.",
  },
  {
    ironFoodSlug: 'tuna',
    vitCFoodSlug: 'peas',
    reason: "Peas' vitamin C rounds out the meal alongside tuna's heme iron.",
  },
  {
    ironFoodSlug: 'hemp_seeds',
    vitCFoodSlug: 'watermelon',
    reason: "Watermelon's vitamin C helps baby absorb more of the plant-based iron in hemp hearts.",
  },
]
