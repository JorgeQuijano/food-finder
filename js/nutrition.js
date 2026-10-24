/**
 * Nutrition helpers and the Forkful health score.
 *
 * The score is a simple, transparent heuristic for comparing dishes.
 * It is not a medical or diagnostic tool. Values are per listed serving.
 */

export const DAILY_VALUES = {
  calories: 2000,
  protein: 50,
  carbs: 275,
  fat: 78,
  satFat: 20,
  fiber: 28,
  sugar: 50,
  sodium: 2300,
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function calcHealthScore(dish) {
  const calories = Math.max(dish.calories, 1);
  const per100 = (grams) => (grams / calories) * 100;

  let score = 10;
  score += Math.min(per100(dish.protein) / 8, 1) * 22;
  score += Math.min(per100(dish.fiber) / 3, 1) * 22;
  score += (1 - clamp((per100(dish.sodium) - 100) / 300, 0, 1)) * 20;
  score += (1 - clamp((per100(dish.sugar) - 1) / 4, 0, 1)) * 16;
  score += (1 - clamp((per100(dish.satFat) - 1.5) / 4.5, 0, 1)) * 10;

  // Fried dishes get a small nudge down; the macro math alone can be kind to them.
  if (dish.tags?.includes("fried")) score -= 8;

  // Very sweet items are capped a little further even when they contain fruit.
  if (dish.sugar > 20) score -= Math.min((dish.sugar - 20) * 0.6, 8);

  // Very large single servings are harder to fit into a balanced day.
  if (dish.calories > 700) score -= 3;

  return Math.round(clamp(score, 0, 100));
}

export function scoreBand(score) {
  if (score >= 80) return { key: "excellent", label: "Excellent" };
  if (score >= 70) return { key: "strong", label: "Strong" };
  if (score >= 60) return { key: "balanced", label: "Balanced" };
  return { key: "treat", label: "Treat" };
}

export function macroCalories(dish) {
  return {
    protein: dish.protein * 4,
    carbs: dish.carbs * 4,
    fat: dish.fat * 9,
  };
}

export function macroPercentages(dish) {
  const cals = macroCalories(dish);
  const total = cals.protein + cals.carbs + cals.fat || 1;
  return {
    protein: (cals.protein / total) * 100,
    carbs: (cals.carbs / total) * 100,
    fat: (cals.fat / total) * 100,
    calories: cals,
  };
}

export function percentDV(amount, nutrient) {
  const reference = DAILY_VALUES[nutrient];
  if (!reference) return 0;
  return Math.round((amount / reference) * 100);
}

export function getDishInsights(dish) {
  const strengths = [];
  if (dish.protein >= 25) strengths.push("High protein");
  else if (dish.protein / Math.max(dish.calories, 1) > 0.05) strengths.push("Protein-dense");
  if (dish.fiber >= 8) strengths.push("High fibre");
  if (dish.calories <= 450) strengths.push("Light meal");
  if (dish.sodium <= 400) strengths.push("Lower sodium");
  if (dish.sugar <= 8) strengths.push("Low sugar");
  if (dish.tags?.includes("omega-3")) strengths.push("Omega-3");
  if (dish.tags?.includes("plant-based")) strengths.push("Plant-powered");
  if (!strengths.length) strengths.push("Balanced macros");

  const watchouts = [];
  if (dish.sodium > 700) {
    watchouts.push(`Sodium runs higher at ${dish.sodium} mg per serving.`);
  }
  if (dish.sugar > 18) {
    watchouts.push(`On the sweeter side with ${dish.sugar} g of sugar.`);
  }
  if (dish.satFat > 8) {
    watchouts.push(`Higher in saturated fat at ${dish.satFat} g.`);
  }
  if (dish.calories > 650) {
    watchouts.push(`A larger serving at ${dish.calories} kcal.`);
  }

  return { strengths: strengths.slice(0, 3), watchouts };
}

export function formatCalories(value) {
  return new Intl.NumberFormat("en-CA").format(Math.round(value));
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return "";
  if (km < 1) return `${Math.max(50, Math.round(km * 10) * 100)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildMealTips(totals) {
  const tips = [];
  if (totals.calories > 1500) {
    tips.push("That is a substantial plate — check whether this is one meal or a few.");
  } else if (totals.calories > 0 && totals.calories < 300) {
    tips.push("A light plate. Add a little protein or fibre if you want it to hold you longer.");
  }
  if (totals.protein > 0 && totals.protein < 20) {
    tips.push("Protein is on the lighter side. Beans, eggs, tofu, chicken or fish would round it out.");
  }
  if (totals.fiber > 0 && totals.fiber < 8) {
    tips.push("Add a vegetable, fruit or whole grain for more fibre.");
  }
  if (totals.sodium > 1500) {
    tips.push("Sodium is stacking up. Go easy on sauces and salty extras for the rest of the day.");
  }
  if (totals.sugar > 35) {
    tips.push("Sugar is on the higher side — a good reason to make the next snack a simple one.");
  }
  if (!tips.length) {
    tips.push("Nicely balanced. Protein, fibre and energy are all doing their part.");
  }
  return tips.slice(0, 2);
}
