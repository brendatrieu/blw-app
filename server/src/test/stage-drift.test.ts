import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Ledger 861 — cross-stage drift. The owner found the chicken thigh baked
 * for 18-22 minutes at 6 and 9 months but 20-25 at 12, and a porridge that
 * said "stir to release hot spots" at two ages but not the third. A recipe's
 * age variants differ in TEXTURE (cut size, how soft); the safety facts of a
 * cooking step — how long at what heat to reach which internal temperature —
 * must not.
 *
 * Three rules, each built to stay quiet on intentional texture differences:
 *
 * 1. Probe foods (meat, poultry, fish, egg dishes): every stage that cites an
 *    internal temperature for the same food cites the SAME one, and where two
 *    stages cook it the same way (method + oven or burner setting) the time
 *    tied to that temperature is the same. A different method or heat at
 *    another age (pan-fried at 6, slow-cooked at 12) is a different
 *    technique, not drift.
 * 2. Everything else: the same method, heat and foods with the SAME doneness
 *    words after the time ("until fork-tender.") must state the same time. A
 *    softer target at a younger age ("until it mashes between two fingers"
 *    against "until tender") is the texture difference this rule allows.
 * 3. Hot spots: if any stage tells the parent to stir out hot spots, every
 *    stage says "Stir well to release hot spots".
 */

const PROBE_FOOD_WORDS: Record<string, RegExp> = {
  chicken: /\bchicken\b/i,
  chicken_thigh: /\bchicken\b/i,
  turkey: /\bturkey\b/i,
  beef: /\bbeef\b/i,
  pork: /\bpork\b/i,
  lamb: /\blamb\b/i,
  salmon: /\bsalmon\b/i,
  cod: /\bcod\b/i,
  trout: /\btrout\b/i,
  shrimp: /\bshrimp\b/i,
  egg: /\beggs?\b/i,
};

const VERB = /\b(slow-cook|roast|bake|steam|boil|simmer|poach|saut[eé]|fry|brown|scramble|wilt|warm|cook|rest|cool|stand|let|add|adding)(?:e?[sd]|ing)?\b/gi;
const METHOD_CLASS: Record<string, string> = {
  "slow-cook": "slow", roast: "oven", bake: "oven",
  simmer: "water", boil: "water", poach: "water",
  steam: "steam",
  saute: "pan", sauté: "pan", fry: "pan", brown: "pan", scramble: "pan", wilt: "pan", warm: "pan", cook: "pan",
};
const TIME = /\b(\d+(?:½)?(?:\s*[-–]\s*\d+(?:½)?)?)\s*(second|minute|hour)s?\b/gi;
const DEGREES_F = /(\d{2,3})\s*°F/g;
const BURNER = /\b(?:high|medium|low)(?:-(?:high|medium|low))?\s+heat\b/gi;

interface Fact { cls: string; heat: string; time: string; at: number; rest: string }

const sentences = (step: string): string[] => step.split(/(?<=[.;!?])\s+/);

function matchesOf(re: RegExp, text: string): RegExpExecArray[] {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))];
}

/**
 * Every "N-M minutes" in a sentence, tied to the cooking verb before it and
 * the heat setting inside that verb's clause — "bake at 400°F for 18-20
 * minutes, or poach at a bare simmer for 10-12" gives the poach no oven.
 * A bare "cook" may take its heat from just before it ("over low heat and
 * cook, covered, for 4-5 minutes").
 */
function facts(sentence: string): Fact[] {
  const verbs = matchesOf(VERB, sentence);
  const heats = [
    ...matchesOf(DEGREES_F, sentence).filter((m) => Number(m[1]) >= 212).map((m) => ({ at: m.index, heat: `${m[1]}°F` })),
    ...matchesOf(BURNER, sentence).map((m) => ({ at: m.index, heat: m[0].toLowerCase() })),
  ];
  return matchesOf(TIME, sentence).flatMap((m): Fact[] => {
    // "for the last 5 minutes" times an add-in, not the step's own cooking.
    if (/the last\s*$/i.test(sentence.slice(0, m.index))) return [];
    const before = verbs.filter((v) => v.index < m.index);
    const verb = before.at(-1);
    const cls = verb === undefined ? undefined : METHOD_CLASS[(verb[1] ?? "").toLowerCase()];
    if (cls === undefined) return []; // resting, cooling, adding: not a cooking time
    const from = verb === undefined ? 0 : verb.index;
    const to = verbs.find((v) => v.index > m.index)?.index ?? sentence.length;
    const back = before.at(-2);
    const inClause = heats.filter((h) => h.at >= from && h.at < to);
    const candidates =
      inClause.length === 0 && verb?.[1]?.toLowerCase() === "cook"
        ? heats.filter((h) => h.at < from && h.at >= (back === undefined ? 0 : back.index + back[0].length))
        : inClause;
    const nearest = [...candidates].sort((a, b) => Math.abs(a.at - m.index) - Math.abs(b.at - m.index))[0];
    const heat = nearest?.heat ?? "";
    return [{
      cls: heat.endsWith("°F") ? "oven" : cls,
      heat,
      time: `${(m[1] ?? "").replace(/\s|–/g, (c) => (c === "–" ? "-" : ""))} ${(m[2] ?? "").toLowerCase()}`,
      at: m.index,
      rest: sentence.slice(m.index + m[0].length).trim().toLowerCase(),
    }];
  });
}

/** Words that name an ingredient food in a step ("chicken_thigh" → chicken, thigh). */
const NOISE = new Set(["sweet", "white", "green", "bell", "iron", "fortified", "whole", "milk", "wheat", "brown", "butter", "unsalted"]);
function foodWords(slug: string): RegExp[] {
  return slug
    .split("_")
    .filter((w) => !NOISE.has(w) && w.length > 2)
    .map((w) => new RegExp(`\\b${w.replace(/(?:es|s)$/, "")}`, "i"));
}

interface StageRecipe {
  slug: string;
  ingredients: { foodSlug: string }[];
  variants: Partial<Record<string, { steps: string[] }>>;
}

function stageDrift(recipe: StageRecipe): string[] {
  const problems: string[] = [];
  const stages = Object.entries(recipe.variants).flatMap(([stage, v]) => (v === undefined ? [] : [{ stage, steps: v.steps }]));
  const foods = recipe.ingredients.map((i) => i.foodSlug);
  const probeFoods = foods.filter((f) => PROBE_FOOD_WORDS[f] !== undefined);

  // Rule 1: probe foods.
  for (const food of probeFoods) {
    const byStage = stages.flatMap(({ stage, steps }) =>
      steps.flatMap(sentences).flatMap((s) => {
        // A one-meat recipe often says "Cook it ..." without naming the meat.
        if (probeFoods.length > 1 && PROBE_FOOD_WORDS[food]?.test(s) !== true) return [];
        const probe = matchesOf(DEGREES_F, s).find((m) => Number(m[1]) < 212);
        if (probe === undefined) return [];
        const tied = facts(s).sort((a, b) => Math.abs(a.at - probe.index) - Math.abs(b.at - probe.index))[0];
        return [{ stage, temp: `${probe[1]}°F`, fact: tied }];
      }),
    );
    const temps = new Set(byStage.map((x) => x.temp));
    if (temps.size > 1) problems.push(`${recipe.slug}: ${food} internal temperature differs by stage (${[...temps].join(", ")})`);
    for (const [i, a] of byStage.entries()) {
      for (const b of byStage.slice(i + 1)) {
        if (a.stage === b.stage || a.fact === undefined || b.fact === undefined) continue;
        if (a.fact.cls === b.fact.cls && a.fact.heat === b.fact.heat && a.fact.time !== b.fact.time) {
          problems.push(`${recipe.slug}: ${food} ${a.fact.cls} ${a.fact.heat} — ${a.fact.time} at ${a.stage} mo, ${b.fact.time} at ${b.stage} mo`);
        }
      }
    }
  }

  // Rule 2: same method + heat + foods + doneness words → same time.
  const seen = new Map<string, { stage: string; time: string }>();
  for (const { stage, steps } of stages) {
    for (const s of steps.flatMap(sentences)) {
      const probeSentence = probeFoods.length > 0 && matchesOf(DEGREES_F, s).some((m) => Number(m[1]) < 212);
      if (probeSentence) continue; // rule 1's
      // A one-food basic often says "them" instead of the food's name.
      const named =
        foods.length === 1 ? foods[0]! : foods.filter((f) => foodWords(f).some((w) => w.test(s))).sort().join("+");
      if (named === "") continue;
      for (const f of facts(s)) {
        const key = `${f.cls}|${f.heat}|${named}|${f.rest}`;
        const prior = seen.get(key);
        if (prior === undefined) seen.set(key, { stage, time: f.time });
        else if (prior.stage !== stage && prior.time !== f.time) {
          problems.push(`${recipe.slug}: ${named} ${f.cls} "${f.rest}" — ${prior.time} at ${prior.stage} mo, ${f.time} at ${stage} mo`);
        }
      }
    }
  }

  // Rule 3: hot spots at every stage, in the same words.
  const mentions = stages.filter(({ steps }) => steps.some((s) => /hot spots/i.test(s)));
  if (mentions.length > 0) {
    const missing = stages.filter(({ steps }) => !steps.some((s) => /stir well to release hot spots/i.test(s)));
    if (missing.length > 0) problems.push(`${recipe.slug}: "Stir well to release hot spots" missing at ${missing.map((m) => m.stage).join(", ")} mo`);
  }
  return [...new Set(problems)];
}

describe("cross-stage drift (ledger 861)", () => {
  it("finds no drift in any seeded recipe", async () => {
    const dataDir = path.resolve(__dirname, "../../db/seeds/data");
    const { recipes } = (await import(pathToFileURL(path.join(dataDir, "recipes.js")).href)) as { recipes: StageRecipe[] };
    expect(recipes.length).toBeGreaterThan(150);
    expect(recipes.flatMap(stageDrift)).toEqual([]);
  });

  const recipe = (ingredients: string[], variants: Record<string, string[]>): StageRecipe => ({
    slug: "r",
    ingredients: ingredients.map((foodSlug) => ({ foodSlug })),
    variants: Object.fromEntries(Object.entries(variants).map(([k, steps]) => [k, { steps }])),
  });

  it("flags the owner's chicken thigh: same oven, 18-22 minutes at 6 months, 20-25 at 12", () => {
    expect(
      stageDrift(recipe(["chicken_thigh"], {
        "6": ["Bake it at 400°F (200°C) for 18-22 minutes, until a thermometer reads 165°F (74°C)."],
        "12": ["Roast at 400°F (200°C) for 20-25 minutes, until the vegetables are tender and the chicken reads 165°F (74°C)."],
      })),
    ).toHaveLength(1);
  });

  it("flags a different internal temperature at another age", () => {
    expect(
      stageDrift(recipe(["pork"], {
        "6": ["Roast at 400°F (200°C) for 20-25 minutes, until it reads 160°F (71°C)."],
        "9": ["Roast at 400°F (200°C) for 20-25 minutes, until it reads 145°F (63°C)."],
      })),
    ).toEqual(["r: pork internal temperature differs by stage (160°F, 145°F)"]);
  });

  it("allows a different technique at another age, and the vegetable time beside the meat's", () => {
    expect(
      stageDrift(recipe(["beef", "pumpkin"], {
        "6": ["Pan-fry a thin steak over medium heat for 4-5 minutes a side, until it reads 160°F (71°C)."],
        "12": ["Simmer a slow-cooking cut covered for 2-3 hours, until it is well past 160°F (71°C)."],
      })),
    ).toEqual([]);
    // An alternative method in the same sentence keeps its own heat: the poach is not "at 400°F".
    expect(
      stageDrift(recipe(["chicken"], {
        "6": ["Bake at 400°F (200°C) for 18-20 minutes, or poach at a bare simmer for 10-12 minutes, until it reads 165°F (74°C)."],
        "9": ["Bake the chicken at 400°F (200°C) for 18-20 minutes, until it reads 165°F (74°C)."],
      })),
    ).toEqual([]);
    expect(
      stageDrift(recipe(["chicken_thigh", "pumpkin"], {
        "6": ["Roast at 400°F (200°C) for 25-30 minutes, until a pumpkin wedge mashes easily, taking the chicken thigh out after 18-22 minutes, once it is cooked to an internal temperature of 165°F (74°C)."],
        "12": ["Roast at 400°F (200°C) for 20-25 minutes, until the pumpkin is fork-tender, taking the chicken thigh out after 18-22 minutes, once it is cooked to an internal temperature of 165°F (74°C)."],
      })),
    ).toEqual([]);
  });

  it("allows a softer texture target at a younger age, but not the same target at a different time", () => {
    expect(
      stageDrift(recipe(["broccoli"], {
        "6": ["Steam the broccoli for 8-10 minutes, until it mashes easily between two fingers."],
        "12": ["Steam the broccoli for 6-8 minutes, until tender."],
      })),
    ).toEqual([]);
    expect(
      stageDrift(recipe(["oats"], {
        "9": ["Cook the oats over medium-low heat for 4-5 minutes, until thick."],
        "12": ["Cook the oats over medium-low heat for 5-6 minutes, until thick."],
      })),
    ).toHaveLength(1);
  });

  it("flags a stage that drops the hot-spot stir", () => {
    expect(
      stageDrift(recipe(["oats"], {
        "6": ["Stir well to release hot spots, cool to just-warm, and check the temperature."],
        "9": ["Cool to just-warm and serve."],
      })),
    ).toEqual(['r: "Stir well to release hot spots" missing at 9 mo']);
  });
});
