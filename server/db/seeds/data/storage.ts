import type { StorageGuidelineSeed } from './types'

// Conservative storage windows for home-prepared baby food. When in doubt, discard sooner
// rather than later. Anything the baby's spoon or mouth has touched should be discarded, not
// stored, regardless of the category below.
export const storageGuidelines: StorageGuidelineSeed[] = [
  {
    category: 'meat_poultry_cooked',
    fridgeHours: 24,
    freezerDays: 60,
    roomTempHours: 2,
    notes:
      'Cool cooked meat and poultry within 1 hour of cooking. Reheat to steaming hot all the way through before serving, and never refreeze after thawing. Discard anything the baby has already eaten from or touched with a used spoon.',
  },
  {
    category: 'fish_seafood_cooked',
    fridgeHours: 24,
    freezerDays: 60,
    roomTempHours: 2,
    notes:
      'Re-check for stray bones every time you portion this out, even from a previously deboned batch. Never refreeze after thawing. Discard anything saliva-touched rather than returning it to storage.',
  },
  {
    category: 'egg_dish_cooked',
    fridgeHours: 48,
    freezerDays: 30,
    roomTempHours: 2,
    notes:
      'Cool baked or cooked egg dishes quickly and refrigerate within 1-2 hours. Texture can turn rubbery after freezing, so thaw and reheat gently. Never refreeze after thawing.',
  },
  {
    category: 'legume_tofu_cooked',
    fridgeHours: 72,
    freezerDays: 90,
    roomTempHours: 2,
    notes:
      'Cooked beans, lentils, chickpeas, and tofu keep well chilled or frozen in an airtight container. Never refreeze after thawing, and discard any portion touched by a used feeding spoon.',
  },
  {
    category: 'grain_cooked',
    fridgeHours: 24,
    freezerDays: 30,
    roomTempHours: 2,
    notes:
      'Cool cooked rice, oats, and quinoa within 1 hour and refrigerate promptly — rice in particular can harbor heat-resistant bacteria if left at room temperature. Reheat only once, to steaming hot, and discard leftovers after that single reheat. Never refreeze after thawing.',
  },
  {
    category: 'produce_cooked_soft',
    fridgeHours: 72,
    freezerDays: 90,
    roomTempHours: 2,
    notes:
      'Steamed or cooked vegetables and softened fruit store well chilled or frozen in an airtight container or ice-cube tray for easy portioning. Never refreeze after thawing.',
  },
  {
    category: 'produce_raw_cut',
    fridgeHours: 24,
    freezerDays: null,
    roomTempHours: 2,
    notes:
      'Raw cut fruit and vegetables (avocado, banana, melon, tomato, berries, and similar) are best served fresh; cut surfaces brown and soften quickly. Not recommended for freezing once cut and prepared for serving. Discard anything left out past room temperature limits.',
  },
  {
    category: 'dairy_soft',
    fridgeHours: 48,
    freezerDays: null,
    roomTempHours: 2,
    notes:
      'Plain whole-milk yogurt and cheese keep chilled in a sealed container. Freezing is not recommended — texture separates and becomes grainy. Always use pasteurized dairy products only.',
  },
  {
    category: 'nut_seed_butter_thinned',
    fridgeHours: 72,
    freezerDays: null,
    roomTempHours: 2,
    notes:
      'Once thinned with water, breast milk, or formula for serving, treat nut and seed butters like a fresh prepared food rather than a shelf-stable pantry item. Freezing is not recommended once thinned. Re-stir before each serving and never serve thick or straight from the jar.',
  },
  {
    category: 'bread_pasta_grain_baked',
    fridgeHours: 48,
    freezerDays: 30,
    roomTempHours: 2,
    notes:
      'Cooked pasta and prepared toast fingers keep chilled in an airtight container. Toast can be frozen and refreshed, but moisten before serving to reduce choking risk. Never refreeze after thawing.',
  },
  {
    category: 'baked_finger_food',
    fridgeHours: 72,
    freezerDays: 90,
    roomTempHours: 2,
    notes:
      'Muffins, patties, fritters, meatballs, and nuggets freeze well individually wrapped or open-frozen on a tray. Reheat to steaming hot and cool to a safe temperature before serving. Never refreeze after thawing.',
  },
  {
    category: 'soup_stew_curry',
    fridgeHours: 48,
    freezerDays: 60,
    roomTempHours: 2,
    notes:
      'Cool soups, stews, and curries quickly by portioning into shallow containers before refrigerating or freezing. Reheat to steaming hot throughout and stir well to eliminate hot spots. Never refreeze after thawing.',
  },
  {
    category: 'porridge_overnight_oats',
    fridgeHours: 48,
    freezerDays: null,
    roomTempHours: 2,
    notes:
      'Overnight oats and similar porridges keep chilled in a sealed container; stir in extra liquid before serving if they have thickened. Not recommended for freezing once dairy or fruit is mixed in.',
  },
  {
    category: 'opened_pouch_jarred_puree',
    fridgeHours: 24,
    freezerDays: null,
    roomTempHours: 1,
    notes:
      'Once opened, store-bought pouches and jars go from ambient-stable to perishable — refrigerate immediately and use within 24 hours. Never refreeze, and never feed baby directly from the pouch or jar if it will be stored again, since saliva contamination means the remainder must be discarded.',
  },
]
