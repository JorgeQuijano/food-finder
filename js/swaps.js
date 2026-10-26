import { healthScoreBreakdown } from "./nutrition.js";

/**
 * Conservative, text-aware suggestions for improving an order.
 *
 * A suggestion is only returned when:
 *  - the dish text or tags make the adjustment plausible, and
 *  - the projection improves the score by at least 3 points, or meaningfully
 *    reduces sodium / sugar / saturated fat while still improving the score.
 *
 * All changes are estimates. This is deliberately not a "change every topping"
 * engine: dishes that do not have a clear, useful lever produce no suggestions.
 */

const round1 = (value) => Math.round(value * 10) / 10;
const clampReduction = (value, fraction, max, min = 0.5) =>
  round1(Math.min(max, Math.max(min, Math.abs(value) * fraction)));

function textFor(dish) {
  return `${dish.name || ""} ${dish.description || ""} ${dish.serving || ""}`.toLowerCase();
}

function project(dish, changes, { removeFried = false } = {}) {
  const candidate = { ...dish };

  for (const [key, delta] of Object.entries(changes)) {
    const current = Number(dish[key]) || 0;
    const floor = key === "calories" ? 1 : 0;
    candidate[key] = Math.max(floor, round1(current + delta));
  }

  if (removeFried) {
    candidate.tags = (dish.tags || []).filter((tag) => tag !== "fried");
  }

  const before = healthScoreBreakdown(dish);
  const after = healthScoreBreakdown(candidate);
  const deltas = {};

  for (const key of Object.keys(changes)) {
    const delta = round1((candidate[key] || 0) - (Number(dish[key]) || 0));
    if (delta !== 0) deltas[key] = delta;
  }

  return {
    before,
    after,
    deltas,
    scoreDelta: after.total - before.total,
  };
}

function isMaterial(projection) {
  if (projection.scoreDelta < 1) return false;

  const deltas = projection.deltas;
  const noticeable =
    (deltas.sodium || 0) <= -150 ||
    (deltas.sugar || 0) <= -5 ||
    (deltas.satFat || 0) <= -1.5 ||
    (deltas.calories || 0) <= -80 ||
    (deltas.fat || 0) <= -5 ||
    (deltas.fiber || 0) >= 2 ||
    (deltas.protein || 0) >= 8;

  const bigSingle =
    (deltas.sodium || 0) <= -300 ||
    (deltas.sugar || 0) <= -10 ||
    (deltas.satFat || 0) <= -2.5;

  return (projection.scoreDelta >= 3 && noticeable) || (bigSingle && projection.scoreDelta >= 1);
}

function makeSuggestion(dish, id, label, detail, changes, options = {}) {
  const projection = project(dish, changes, options);
  if (!isMaterial(projection)) return null;

  return {
    id,
    label,
    detail,
    scoreBefore: projection.before.total,
    scoreAfter: projection.after.total,
    scoreDelta: projection.scoreDelta,
    afterBand: projection.after.band,
    changes: projection.deltas,
  };
}

export function buildSmartSwaps(dish) {
  if (!dish) return [];

  const text = textFor(dish);
  const name = (dish.name || "").toLowerCase();
  const tags = dish.tags || [];
  const suggestions = [];

  // Sauce / dressing: only when there is enough sodium or fat for the reduction
  // to matter, and the dish actually describes a sauce or dressing. Skip dishes
  // where the sauce is the identity of the order (a buffalo wrap without
  // buffalo sauce is not the same dish), so the advice stays worth asking for.
  const hasSauceLike =
    /dressing|vinaigrette|aioli|mayonnaise|mayo|crema|drizzle|chimichurri|tahini|pesto|ranch|tzatziki|garlic sauce|house sauce|yogurt sauce|peanut sauce|tartar|remoulade|hollandaise/.test(
      text,
    );
  const sauceIsIdentity =
    /buffalo|bbq|barbecue|teriyaki|honey garlic|satay|butter chicken|tikka masala|curry|pesto/.test(
      name,
    );
  if (hasSauceLike && !sauceIsIdentity && (dish.sodium >= 550 || dish.fat >= 18)) {
    const sauceLabel = /dressing|vinaigrette/.test(text)
      ? "Ask for the dressing on the side"
      : "Ask for the sauce on the side";

    suggestions.push(
      makeSuggestion(
        dish,
        "sauce-side",
        sauceLabel,
        "Use about half rather than cutting it out altogether. You keep the flavour without the full pour.",
        {
          calories: -clampReduction(dish.calories, 0.08, 80, 30),
          fat: -clampReduction(dish.fat, 0.22, 8, 2),
          satFat: -clampReduction(dish.satFat, 0.22, 2.5, 0.5),
          sodium: -clampReduction(dish.sodium, 0.22, 280, 80),
        },
      ),
    );
  }

  // Added sweetener: only when the dish text mentions one, not just because a
  // dish contains fruit sugar.
  const hasSweetener = /syrup|honey|agave|caramel sauce|chocolate sauce|nutella/.test(text);
  if (hasSweetener && dish.sugar >= 15) {
    const sweetLabel = /syrup/.test(text)
      ? "Ask for the syrup on the side"
      : "Go light on the added sweetness";
    const hasCream = /cream|butter|whip/.test(text);
    const changes = {
      sugar: -clampReduction(dish.sugar, 0.38, 12, 8),
      calories: -clampReduction(dish.calories, 0.1, 90, 30),
      carbs: -clampReduction(dish.carbs, 0.16, 15, 6),
    };
    if (hasCream) {
      changes.fat = -3;
      changes.satFat = -1.5;
    }

    suggestions.push(
      makeSuggestion(
        dish,
        "less-sweet",
        sweetLabel,
        "Keep a taste rather than the full pour. The sweet hit stays and the sugar load drops.",
        changes,
      ),
    );
  }

  // Fried protein: don't suggest grilling fries, tempura rolls, chips or other
  // dishes where the fried element is the whole point.
  const hasProtein = /chicken|fish|shrimp|tofu|tempeh|halloumi|beef|pork/.test(text);
  const isRollOrChips = /roll|tempura|chips|fries/.test(text);
  if (tags.includes("fried") && hasProtein && !isRollOrChips) {
    const proteinLabel = /chicken/.test(text)
      ? "Ask for grilled chicken instead of fried"
      : "Ask for the protein grilled instead of fried";

    suggestions.push(
      makeSuggestion(
        dish,
        "grilled-protein",
        proteinLabel,
        "A grilled version keeps the protein and cuts the frying oil. Only worth asking if the kitchen offers it.",
        {
          calories: -80,
          fat: -6,
          satFat: -1.5,
          sodium: -100,
          carbs: -5,
        },
        { removeFried: true },
      ),
    );
  }

  // Fries with a main: a side swap can meaningfully lower calories, fat and
  // sodium. Standalone fries get no suggestion because the dish is the fries.
  const hasFries = /fries|frites/.test(text);
  const isStandaloneFries =
    /^(sweet potato )?fries$/.test(name.trim()) ||
    (/fries$/.test(name.trim()) && !/burger|steak|sandwich|wrap|plate/.test(name));
  if (hasFries && !isStandaloneFries) {
    suggestions.push(
      makeSuggestion(
        dish,
        "fries-to-salad",
        "Swap the fries for a side salad",
        "You still get the main event; the side becomes vegetables instead of fried potatoes.",
        {
          calories: -200,
          fat: -12,
          satFat: -2.5,
          sodium: -120,
          carbs: -24,
          fiber: 1,
        },
      ),
    );
  }

  // Cheese: skip pizza, caprese and quesadillas where the cheese is structural.
  const hasCheese = /cheddar|mozzarella|parmesan|feta|goat cheese|halloumi|cheese/.test(text);
  const isCheeseStructural = /pizza|caprese|margherita|quesadilla|fondue/.test(name);
  if (hasCheese && dish.satFat >= 8 && !isCheeseStructural) {
    suggestions.push(
      makeSuggestion(
        dish,
        "half-cheese",
        "Ask for half the cheese",
        "You keep the creamy, salty note with less saturated fat. Best for burgers, sandwiches and salads.",
        {
          calories: -60,
          fat: -4,
          satFat: -3,
          sodium: -100,
        },
      ),
    );
  }

  // Keep only distinct, useful suggestions and cap the list at two. Multiple
  // reductions on the same dish can otherwise become an essay.
  const seen = new Set();
  return suggestions
    .filter(Boolean)
    .filter((suggestion) => {
      if (seen.has(suggestion.label)) return false;
      seen.add(suggestion.label);
      return true;
    })
    .sort(
      (a, b) =>
        b.scoreDelta - a.scoreDelta ||
        Math.abs(b.changes.sodium || 0) - Math.abs(a.changes.sodium || 0) ||
        Math.abs(b.changes.sugar || 0) - Math.abs(a.changes.sugar || 0),
    )
    .slice(0, 2);
}
