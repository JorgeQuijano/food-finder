import { dishById } from "./data.js";
import { healthScoreBreakdown, formatNumber } from "./nutrition.js";
import { dishMediaHtml } from "./dish-media.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHTML = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });

const THEME_KEY = "forkful.theme";
const THEMES = ["system", "light", "dark"];
const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };
const THEME_ICONS = { system: "monitor", light: "sun", dark: "moon" };
const THEME_NEXT = { system: "light", light: "dark", dark: "system" };
const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const els = {
  header: $(".site-header"),
  themeToggle: $("#theme-toggle"),
  themeIcon: $(".theme-icon"),
  themeLabel: $(".theme-label"),
  themeMeta: $("#theme-color-meta"),
  themeStatus: $("#theme-status"),
  footerYear: $("#footer-year"),
  workedGrid: $("#worked-grid"),
  calc: {
    calories: $("#calc-calories"),
    protein: $("#calc-protein"),
    fiber: $("#calc-fiber"),
    sodium: $("#calc-sodium"),
    sugar: $("#calc-sugar"),
    satFat: $("#calc-satfat"),
    fried: $("#calc-fried"),
    reset: $("#calc-reset"),
    ring: $("#calc-ring"),
    ringValue: $("#calc-ring-value"),
    score: $("#calc-score"),
    scoreNumber: $("#calc-score-number"),
    band: $("#calc-band"),
    raw: $("#calc-raw"),
    breakdown: $("#calc-breakdown"),
    status: $("#calc-status"),
  },
};

let themePref = "system";

function init() {
  setupTheme();
  setupHeaderScroll();
  renderExamples();
  setupCalculator();
  if (els.footerYear) els.footerYear.textContent = String(new Date().getFullYear());
}

function announce(message) {
  if (!els.themeStatus) return;
  els.themeStatus.textContent = "";
  window.setTimeout(() => {
    els.themeStatus.textContent = message;
  }, 30);
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

function setupTheme() {
  const inlinePreference = document.documentElement.dataset.themePref;
  themePref = THEMES.includes(inlinePreference) ? inlinePreference : readStoredTheme();
  applyTheme(themePref, { persist: false });

  els.themeToggle?.addEventListener("click", () => {
    applyTheme(THEME_NEXT[themePref] || "system");
  });

  const onSystemThemeChange = () => {
    if (themePref === "system") applyTheme("system", { persist: false });
  };

  if (typeof themeQuery.addEventListener === "function") {
    themeQuery.addEventListener("change", onSystemThemeChange);
  } else if (typeof themeQuery.addListener === "function") {
    themeQuery.addListener(onSystemThemeChange);
  }
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : "system";
  } catch (error) {
    return "system";
  }
}

function applyTheme(preference, { persist = true } = {}) {
  themePref = THEMES.includes(preference) ? preference : "system";
  const resolved =
    themePref === "system" ? (themeQuery.matches ? "dark" : "light") : themePref;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = themePref;
  document.documentElement.style.colorScheme = resolved;

  if (els.themeMeta) {
    els.themeMeta.setAttribute("content", resolved === "dark" ? "#0d1410" : "#f6f2e8");
  }

  if (els.themeIcon) {
    els.themeIcon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${THEME_ICONS[themePref]}"></use></svg>`;
  }
  if (els.themeLabel) els.themeLabel.textContent = THEME_LABELS[themePref];

  if (els.themeToggle) {
    const next = THEME_NEXT[themePref];
    const explanation =
      themePref === "system"
        ? "follows your device"
        : `${THEME_LABELS[themePref].toLowerCase()} mode`;
    els.themeToggle.setAttribute(
      "aria-label",
      `Theme: ${THEME_LABELS[themePref]} (${explanation}). Click to switch to ${THEME_LABELS[next]}.`,
    );
    els.themeToggle.title = `Theme: ${THEME_LABELS[themePref]}`;
  }

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, themePref);
    } catch (error) {
      // Theme still applies for this session.
    }
    announce(`Theme set to ${THEME_LABELS[themePref]}.`);
  }
}

/* --------------------------------------------------------------------------
   Worked examples
   -------------------------------------------------------------------------- */

const EXAMPLE_IDS = [
  "rootcellar:turmeric-lentil",
  "impact:protein-power",
  "rosalinda:guacamole-chips",
  "calii:acai-bowl",
];

function scoreRingMarkup(total, band) {
  return `
    <div class="score-ring ${band.key}" role="img" aria-label="Forkful health score ${total} out of 100, ${escapeHTML(band.label)}">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="ring-bg" cx="22" cy="22" r="18"></circle>
        <circle class="ring-value" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - total}"></circle>
      </svg>
      <span class="score-number">${total}</span>
    </div>`;
}

function pointsFor(points, maximum, label, className) {
  const width = maximum > 0 ? Math.min((points / maximum) * 100, 100) : 0;
  return `
    <div class="points-row is-${className}">
      <span class="points-label">${escapeHTML(label)}</span>
      <span class="points-bar" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></span>
      <span class="points-value">+${formatNumber(points, 1)}</span>
    </div>`;
}

function penaltyFor(points, label) {
  if (!points) return "";
  return `
    <div class="points-row is-penalty">
      <span class="points-label">${escapeHTML(label)}</span>
      <span class="points-bar" aria-hidden="true"></span>
      <span class="points-value">−${formatNumber(Math.abs(points), 1)}</span>
    </div>`;
}

function breakdownRows(breakdown, { includeTotal = false } = {}) {
  const { components, penalties, total, rawScore } = breakdown;
  const rows = [
    pointsFor(components.base, 10, "Base", "base"),
    pointsFor(components.protein, 22, "Protein", "protein"),
    pointsFor(components.fiber, 22, "Fibre", "fibre"),
    pointsFor(components.sodium, 20, "Sodium", "sodium"),
    pointsFor(components.sugar, 16, "Sugar", "sugar"),
    pointsFor(components.satFat, 10, "Sat fat", "satfat"),
    penaltyFor(penalties.fried, "Fried"),
    penaltyFor(penalties.sweet, "Sweet adj."),
    penaltyFor(penalties.large, "Large serving"),
  ];

  if (includeTotal) {
    rows.push(`
      <div class="points-row is-total">
        <span class="points-label">Rounded total</span>
        <span class="points-bar" aria-hidden="true"></span>
        <span class="points-value">${total}/100</span>
      </div>`);
  }

  return { html: rows.join(""), rawScore };
}

function renderExamples() {
  if (!els.workedGrid) return;

  els.workedGrid.innerHTML = EXAMPLE_IDS.map((dishId, index) => {
    const dish = dishById.get(dishId);
    if (!dish) return "";

    const location = dish.locations[0];
    const breakdown = healthScoreBreakdown(dish);
    const { html } = breakdownRows(breakdown);
    const noteParts = [];
    if (breakdown.penalties.fried) noteParts.push("Fried adjustment applied");
    if (breakdown.penalties.sweet) noteParts.push("Sweetness adjustment applied");
    if (breakdown.penalties.large) noteParts.push("Large-serving adjustment applied");

    return `
      <article class="example-card" style="--i:${index}">
        <header class="example-head">
          ${dishMediaHtml(dish, { className: "example-emoji" })}
          <div class="example-title">
            <p class="example-place">${escapeHTML(location?.name || "Forkful pick")} · ${escapeHTML(location?.city || "Ontario")}</p>
            <h3>${escapeHTML(dish.name)}</h3>
          </div>
          ${scoreRingMarkup(breakdown.total, breakdown.band)}
        </header>
        <p class="example-nutrition">
          ${formatNumber(dish.calories)} kcal · ${formatNumber(dish.protein, 1)} g protein ·
          ${formatNumber(dish.fiber, 1)} g fibre · ${formatNumber(dish.sodium)} mg sodium
        </p>
        <div class="example-points">${html}</div>
        <div class="example-foot">
          <span class="example-raw">Raw ${breakdown.rawScore.toFixed(1)} → ${breakdown.total}</span>
          <span class="band-pill band-${breakdown.band.key}">${escapeHTML(breakdown.band.label)}</span>
        </div>
        ${noteParts.length ? `<p class="example-note">${escapeHTML(noteParts.join(" · "))}.</p>` : ""}
      </article>`;
  }).join("");
}

/* --------------------------------------------------------------------------
   Calculator
   -------------------------------------------------------------------------- */

const CALC_DEFAULTS = {
  calories: 290,
  protein: 15,
  fiber: 11,
  sodium: 460,
  sugar: 6,
  satFat: 1.5,
  fried: false,
};

function numberFrom(element, minimum = 0) {
  const parsed = Number(element?.value);
  return Number.isFinite(parsed) ? Math.max(parsed, minimum) : minimum;
}

function currentCalcDish() {
  return {
    calories: numberFrom(els.calc.calories, 1),
    protein: numberFrom(els.calc.protein, 0),
    fiber: numberFrom(els.calc.fiber, 0),
    sodium: numberFrom(els.calc.sodium, 0),
    sugar: numberFrom(els.calc.sugar, 0),
    satFat: numberFrom(els.calc.satFat, 0),
    tags: els.calc.fried?.checked ? ["fried"] : [],
  };
}

function updateCalculator() {
  const dish = currentCalcDish();
  const breakdown = healthScoreBreakdown(dish);
  const rows = breakdownRows(breakdown, { includeTotal: true });
  const band = breakdown.band;

  if (els.calc.ring) {
    els.calc.ring.className = `score-ring is-large ${band.key}`;
    els.calc.ring.setAttribute(
      "aria-label",
      `Forkful health score ${breakdown.total} out of 100, ${band.label}`,
    );
  }
  if (els.calc.ringValue) {
    els.calc.ringValue.setAttribute("stroke-dashoffset", String(100 - breakdown.total));
  }
  if (els.calc.score) els.calc.score.textContent = String(breakdown.total);
  if (els.calc.scoreNumber) els.calc.scoreNumber.textContent = String(breakdown.total);
  if (els.calc.band) {
    els.calc.band.className = `band-pill band-${band.key}`;
    els.calc.band.textContent = band.label;
  }
  if (els.calc.raw) {
    els.calc.raw.textContent = `raw ${breakdown.rawScore.toFixed(1)}`;
  }
  if (els.calc.breakdown) {
    els.calc.breakdown.innerHTML = rows.html;
  }
  if (els.calc.status) {
    els.calc.status.textContent = `Score ${breakdown.total} out of 100, ${band.label}.`;
  }
}

function setCalculatorDefaults() {
  if (!els.calc.calories) return;
  els.calc.calories.value = String(CALC_DEFAULTS.calories);
  els.calc.protein.value = String(CALC_DEFAULTS.protein);
  els.calc.fiber.value = String(CALC_DEFAULTS.fiber);
  els.calc.sodium.value = String(CALC_DEFAULTS.sodium);
  els.calc.sugar.value = String(CALC_DEFAULTS.sugar);
  els.calc.satFat.value = String(CALC_DEFAULTS.satFat);
  els.calc.fried.checked = CALC_DEFAULTS.fried;
  updateCalculator();
}

function setupCalculator() {
  if (!els.calc.calories) return;

  const inputs = $$(
    "#calc-calories, #calc-protein, #calc-fiber, #calc-sodium, #calc-sugar, #calc-satfat",
  );

  inputs.forEach((input) => input.addEventListener("input", updateCalculator));
  els.calc.fried?.addEventListener("change", updateCalculator);
  els.calc.reset?.addEventListener("click", setCalculatorDefaults);

  setCalculatorDefaults();
}

/* --------------------------------------------------------------------------
   Shared page chrome
   -------------------------------------------------------------------------- */

function setupHeaderScroll() {
  if (!els.header) return;
  const update = () => {
    els.header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

init();
