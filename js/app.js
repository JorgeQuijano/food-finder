import {
  restaurants,
  dishes,
  dishById,
  restaurantById,
  cities,
  cuisines,
  dietFilters,
  dietLabels,
  dishTagLabels,
  stats,
  DATA_NOTE,
  getPlaceDishes,
} from "./data.js";
import {
  percentDV,
  macroPercentages,
  formatCalories,
  formatNumber,
  formatDistance,
  distanceKm,
  getDishInsights,
  buildMealTips,
  clamp,
} from "./nutrition.js";

/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */

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

const norm = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .trim();

const icon = (name, className = "icon") =>
  `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const cuisineSlug = (cuisine) =>
  cuisine
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const priceLabel = (price) => "$".repeat(Math.max(1, Number(price) || 1));

const plural = (count, singular, pluralWord = `${singular}s`) =>
  count === 1 ? singular : pluralWord;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

const THEME_KEY = "forkful.theme";
const MEAL_KEY = "forkful.meal.v1";
const TARGET_KEY = "forkful.target.v1";
const THEMES = ["system", "light", "dark"];
const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };
const THEME_ICONS = { system: "monitor", light: "sun", dark: "moon" };
const THEME_NEXT = { system: "light", light: "dark", dark: "system" };
const TARGETS = [1600, 2000, 2500];
const ALLOWED_SORTS = new Set([
  "recommended",
  "healthiest",
  "protein",
  "calories",
  "rating",
  "nearest",
]);

const SEARCH_ALIASES = {
  "plant-based": "plant based vegan",
  vegetarian: "vegetarian veggie",
  "gluten-free": "gluten free gf",
  "dairy-free": "dairy free df",
  "high-protein": "high protein protein rich",
  "high-fiber": "high fibre high fiber fiber",
  halal: "halal",
  "omega-3": "omega 3 omega-3",
  light: "light low calorie",
  fried: "fried crispy",
};

const DEFAULT_STATE = {
  q: "",
  city: "all",
  cuisine: "all",
  diets: [],
  maxCal: 900,
  minProtein: 0,
  highScore: false,
  sort: "recommended",
  view: "places",
};

/* --------------------------------------------------------------------------
   App state
   -------------------------------------------------------------------------- */

let state = { ...DEFAULT_STATE };
let userLocation = null;
let meal = [];
let mealTarget = 2000;
let themePref = "system";
let lastResultCount = null;
let urlTimer = null;
let toastTimer = null;
let toastActionHandler = null;
let filterReturnFocus = null;
const flashTimers = new WeakMap();

const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const mobileFilterQuery = window.matchMedia("(max-width: 960px)");

const els = {};

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

function init() {
  cacheElements();
  readUrlState();
  meal = loadMeal();
  mealTarget = loadMealTarget();
  setupTheme();
  populateFilters();
  syncAllControls();
  bindEvents();
  renderHero();
  renderStats();
  renderResults();
  updateMealUI();
  renderMeal();
  updateFooter();
  setupHeaderScroll();
  syncUrl();
  document.body.classList.add("is-ready");
}

function cacheElements() {
  els.header = $(".site-header");
  els.searchForm = $("#search-form");
  els.searchInput = $("#search-input");
  els.searchClear = $("#search-clear");
  els.searchKbd = $(".search-kbd");
  els.quickChips = $$("[data-quick]");

  els.explore = $("#explore");
  els.viewButtons = $$("[data-view]");
  els.cityFilter = $("#city-filter");
  els.cuisineFilter = $("#cuisine-filter");
  els.dietFilters = $("#diet-filters");
  els.maxCalories = $("#max-calories");
  els.maxCaloriesOutput = $("#max-calories-output");
  els.minProtein = $("#min-protein");
  els.minProteinOutput = $("#min-protein-output");
  els.highScore = $("#high-score");
  els.sortSelect = $("#sort-select");
  els.nearMe = $("#near-me");
  els.resultsCount = $("#results-count");
  els.resultsGrid = $("#results-grid");
  els.emptyState = $("#empty-state");
  els.emptyReset = $("#empty-reset");
  els.activeFilters = $("#active-filters");
  els.applyFilters = $("#apply-filters");
  els.resetFilters = $("#reset-filters");
  els.openFilters = $("#open-filters");
  els.closeFilters = $("#close-filters");
  els.filtersPanel = $("#filters-panel");
  els.filtersBackdrop = $("#filters-backdrop");
  els.filterCount = $("#filter-count");

  els.heroCard = $("#hero-card");
  els.statPlaces = $("#stat-places");
  els.statDishes = $("#stat-dishes");
  els.statCities = $("#stat-cities");
  els.surpriseButton = $("#surprise-button");

  els.themeToggle = $("#theme-toggle");
  els.themeIcon = $(".theme-icon", els.themeToggle);
  els.themeLabel = $(".theme-label", els.themeToggle);
  els.themeMeta = $("#theme-color-meta");

  els.openMealTop = $("#open-meal-top");
  els.mealCountTop = $("#meal-count-top");
  els.openMealFab = $("#open-meal-fab");
  els.mealFabSummary = $("#meal-fab-summary");
  els.detailDialog = $("#detail-dialog");
  els.detailContent = $("#detail-content");
  els.mealDialog = $("#meal-dialog");
  els.mealContent = $("#meal-content");
  els.aboutDialog = $("#about-dialog");
  els.toast = $("#toast");
  els.toastMessage = $("#toast-message");
  els.toastAction = $("#toast-action");
  els.toastClose = $("#toast-close");
  els.a11yStatus = $("#a11y-status");
  els.footerYear = $("#footer-year");
}

function announce(message) {
  if (!els.a11yStatus) return;
  els.a11yStatus.textContent = "";
  window.setTimeout(() => {
    els.a11yStatus.textContent = message;
  }, 30);
}

/* --------------------------------------------------------------------------
   URL state
   -------------------------------------------------------------------------- */

function readUrlState() {
  const params = new URLSearchParams(window.location.search);

  const query = params.get("q");
  if (query) state.q = query.slice(0, 100);

  const city = params.get("city");
  if (cities.includes(city)) state.city = city;

  const cuisine = params.get("cuisine");
  if (cuisines.includes(cuisine)) state.cuisine = cuisine;

  const diets = params.get("diets");
  if (diets) {
    const validDiets = new Set(dietFilters.map((diet) => diet.key));
    state.diets = [
      ...new Set(
        diets
          .split(",")
          .map((diet) => diet.trim())
          .filter((diet) => validDiets.has(diet)),
      ),
    ];
  }

  const maxCalParam = params.get("maxCal");
  if (maxCalParam !== null) {
    const maxCal = Number(maxCalParam);
    if (Number.isFinite(maxCal)) {
      state.maxCal = clamp(Math.round(maxCal / 10) * 10, 250, 900);
    }
  }

  const minProteinParam = params.get("minProtein");
  if (minProteinParam !== null) {
    const minProtein = Number(minProteinParam);
    if (Number.isFinite(minProtein)) {
      state.minProtein = clamp(Math.round(minProtein / 5) * 5, 0, 45);
    }
  }

  state.highScore = params.get("score") === "80";

  const sort = params.get("sort");
  if (sort && ALLOWED_SORTS.has(sort)) state.sort = sort;

  if (params.get("view") === "dishes") state.view = "dishes";

  if (state.sort === "nearest") {
    // A shared nearest-first URL needs a location. Wait for the user to ask for it.
    state.sort = "recommended";
  }
}

function scheduleUrlSync() {
  window.clearTimeout(urlTimer);
  urlTimer = window.setTimeout(syncUrl, 160);
}

function syncUrl() {
  const params = new URLSearchParams();

  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.city !== "all") params.set("city", state.city);
  if (state.cuisine !== "all") params.set("cuisine", state.cuisine);
  if (state.diets.length) params.set("diets", state.diets.join(","));
  if (state.maxCal < 900) params.set("maxCal", String(state.maxCal));
  if (state.minProtein > 0) params.set("minProtein", String(state.minProtein));
  if (state.highScore) params.set("score", "80");
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.view !== "places") params.set("view", "dishes");

  const queryString = params.toString();
  const nextUrl =
    window.location.pathname + (queryString ? `?${queryString}` : "") + window.location.hash;

  try {
    window.history.replaceState(null, "", nextUrl);
  } catch (error) {
    // File URLs or restricted contexts can refuse history updates.
  }
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

function setupTheme() {
  const inlinePreference = document.documentElement.dataset.themePref;
  themePref = THEMES.includes(inlinePreference) ? inlinePreference : readStoredTheme();
  applyTheme(themePref, { persist: false });

  els.themeToggle.addEventListener("click", () => {
    const next = THEME_NEXT[themePref] || "system";
    applyTheme(next);
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
    els.themeIcon.innerHTML = icon(THEME_ICONS[themePref]);
  }
  if (els.themeLabel) {
    els.themeLabel.textContent = THEME_LABELS[themePref];
  }
  if (els.themeToggle) {
    const next = THEME_NEXT[themePref];
    const explanation =
      themePref === "system" ? "follows your device" : `${THEME_LABELS[themePref].toLowerCase()} mode`;
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
   Filters, controls and URL
   -------------------------------------------------------------------------- */

function populateFilters() {
  els.cityFilter.innerHTML =
    `<option value="all">All GTA</option>` +
    cities.map((city) => `<option value="${escapeHTML(city)}">${escapeHTML(city)}</option>`).join("");

  els.cuisineFilter.innerHTML =
    `<option value="all">All cuisines</option>` +
    cuisines
      .map((cuisine) => `<option value="${escapeHTML(cuisine)}">${escapeHTML(cuisine)}</option>`)
      .join("");

  els.dietFilters.innerHTML = dietFilters
    .map(
      (diet) =>
        `<button class="diet-chip" type="button" data-diet="${escapeHTML(diet.key)}" aria-pressed="false">${escapeHTML(diet.label)}</button>`,
    )
    .join("");

  if (els.searchKbd) {
    const isApple = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
    els.searchKbd.textContent = isApple ? "⌘K" : "Ctrl K";
  }
}

function syncAllControls() {
  els.searchInput.value = state.q;
  syncFilterControls();
  updateSearchAffordances();
}

function syncFilterControls() {
  els.cityFilter.value = state.city;
  els.cuisineFilter.value = state.cuisine;
  els.maxCalories.value = String(state.maxCal);
  els.maxCaloriesOutput.textContent = state.maxCal >= 900 ? "Any" : `${state.maxCal} kcal`;
  els.minProtein.value = String(state.minProtein);
  els.minProteinOutput.textContent = state.minProtein > 0 ? `${state.minProtein} g+` : "Any";
  els.highScore.checked = state.highScore;
  els.sortSelect.value = state.sort;

  $$(".diet-chip", els.dietFilters).forEach((button) => {
    button.setAttribute("aria-pressed", String(state.diets.includes(button.dataset.diet)));
  });

  const quickState = {
    plant: state.diets.includes("plant"),
    protein: state.minProtein >= 25,
    light: state.maxCal <= 500,
    halal: state.diets.includes("halal"),
  };

  els.quickChips.forEach((chip) => {
    chip.setAttribute("aria-pressed", String(Boolean(quickState[chip.dataset.quick])));
  });

  els.viewButtons.forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  updateNearButton();
  updateFilterCount();
}

function updateSearchAffordances() {
  const hasQuery = state.q.trim().length > 0;
  els.searchClear.hidden = !hasQuery;
}

function updateNearButton() {
  if (!els.nearMe) return;
  els.nearMe.classList.toggle("is-active", Boolean(userLocation));
  const label = $("span", els.nearMe);
  if (label) label.textContent = userLocation ? "Near you" : "Near me";
  els.nearMe.setAttribute(
    "aria-label",
    userLocation ? "Using your approximate location" : "Sort by distance from me",
  );
}

function updateFilterCount() {
  const count = getActiveFilterItems().length;
  els.filterCount.textContent = String(count);
  els.filterCount.hidden = count === 0;

  if (lastResultCount !== null) {
    const noun =
      state.view === "places"
        ? plural(lastResultCount, "place")
        : plural(lastResultCount, "dish", "dishes");
    els.applyFilters.textContent = `Show ${lastResultCount} ${noun}`;
  }
}

function getActiveFilterItems() {
  const items = [];

  if (state.city !== "all") items.push({ type: "city", value: state.city, label: state.city });
  if (state.cuisine !== "all") {
    items.push({ type: "cuisine", value: state.cuisine, label: state.cuisine });
  }

  state.diets.forEach((key) => {
    const diet = dietFilters.find((item) => item.key === key);
    if (diet) items.push({ type: "diet", value: key, label: diet.label });
  });

  if (state.maxCal < 900) {
    items.push({ type: "maxCal", value: String(state.maxCal), label: `≤ ${state.maxCal} kcal` });
  }
  if (state.minProtein > 0) {
    items.push({
      type: "minProtein",
      value: String(state.minProtein),
      label: `${state.minProtein} g+ protein`,
    });
  }
  if (state.highScore) items.push({ type: "highScore", value: "80", label: "80+ score" });

  return items;
}

function renderActiveFilters() {
  const items = getActiveFilterItems();
  els.activeFilters.hidden = items.length === 0;

  if (!items.length) {
    els.activeFilters.innerHTML = "";
    return;
  }

  els.activeFilters.innerHTML =
    items
      .map(
        (item) => `
          <span class="active-chip">
            ${escapeHTML(item.label)}
            <button type="button" data-filter-remove="${escapeHTML(item.type)}" data-filter-value="${escapeHTML(item.value)}" aria-label="Remove ${escapeHTML(item.label)} filter">
              ${icon("x")}
            </button>
          </span>`,
      )
      .join("") +
    `<button class="clear-filters" type="button" data-clear-filters>Clear all</button>`;
}

function removeFilter(type, value) {
  if (type === "city") state.city = "all";
  else if (type === "cuisine") state.cuisine = "all";
  else if (type === "diet") state.diets = state.diets.filter((diet) => diet !== value);
  else if (type === "maxCal") state.maxCal = 900;
  else if (type === "minProtein") state.minProtein = 0;
  else if (type === "highScore") state.highScore = false;

  syncFilterControls();
  renderResults();
}

function resetFilters({ closeDrawer = true } = {}) {
  state.q = "";
  state.city = "all";
  state.cuisine = "all";
  state.diets = [];
  state.maxCal = 900;
  state.minProtein = 0;
  state.highScore = false;

  if (state.sort === "nearest" && !userLocation) state.sort = "recommended";

  syncAllControls();
  renderResults();

  if (closeDrawer && document.body.classList.contains("filters-open")) {
    closeFilters();
  }
}

function toggleDiet(key) {
  if (state.diets.includes(key)) {
    state.diets = state.diets.filter((diet) => diet !== key);
  } else {
    state.diets = [...state.diets, key];
  }
}

function applyQuickFilter(key) {
  if (key === "plant") toggleDiet("plant");
  else if (key === "halal") toggleDiet("halal");
  else if (key === "protein") state.minProtein = state.minProtein >= 25 ? 0 : 25;
  else if (key === "light") state.maxCal = state.maxCal <= 500 ? 900 : 500;

  syncFilterControls();
  renderResults();
  scrollToExplore();
}

/* --------------------------------------------------------------------------
   Rendering: hero and stats
   -------------------------------------------------------------------------- */

function renderStats() {
  els.statPlaces.textContent = String(stats.places);
  els.statDishes.textContent = String(stats.dishes);
  els.statCities.textContent = String(stats.cities);
}

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function renderHero() {
  const candidates = dishes
    .filter((dish) => dish.score >= 75)
    .sort((a, b) => b.score - a.score || b.protein - a.protein)
    .slice(0, 16);

  const pick = candidates[dayOfYear() % candidates.length] || dishes[0];
  if (!pick) return;

  const location = pickBestLocation(pick.locations);
  if (!location) return;

  const insights = getDishInsights(pick);
  const highlight = insights.strengths[0] || "Balanced plate";

  els.heroCard.innerHTML = `
    <article class="pick-card">
      <div class="pick-kicker-row">
        <span class="pick-kicker">${icon("sparkles")} Today's smart pick</span>
        <span class="score-pill ${pick.band.key}">${pick.score}<small>/100</small></span>
      </div>
      <div class="pick-media">
        <span class="pick-emoji" aria-hidden="true">${escapeHTML(pick.emoji)}</span>
        <span class="pick-sticker">per serving</span>
        <div class="pick-media-tags">
          <span>${escapeHTML(location.area)}</span>
          <span>${escapeHTML(location.city)}</span>
        </div>
      </div>
      <div class="pick-content">
        <p class="pick-place">${escapeHTML(location.name)}</p>
        <h2 class="pick-name">${escapeHTML(pick.name)}</h2>
        <p class="pick-desc">${escapeHTML(pick.description)}</p>
        <div class="pick-macros">
          <div><strong>${formatCalories(pick.calories)}</strong><span>kcal</span></div>
          <div><strong>${formatNumber(pick.protein)} g</strong><span>protein</span></div>
          <div><strong>${formatNumber(pick.fiber)} g</strong><span>fibre</span></div>
        </div>
        ${macroBarHtml(pick)}
        <div class="macro-key pick-macro-key">
          <span><i class="macro-dot protein"></i>P ${formatNumber(pick.protein)}g</span>
          <span><i class="macro-dot carbs"></i>C ${formatNumber(pick.carbs)}g</span>
          <span><i class="macro-dot fat"></i>F ${formatNumber(pick.fat)}g</span>
        </div>
        <div class="pick-footer">
          <span class="pick-badge">${icon("leaf")}${escapeHTML(highlight)}</span>
          <button class="pick-link" type="button" data-open-dish="${escapeHTML(pick.id)}">
            See the breakdown ${icon("arrow-right")}
          </button>
        </div>
      </div>
    </article>`;
}

/* --------------------------------------------------------------------------
   Filtering
   -------------------------------------------------------------------------- */

function dishDietFlags(dish) {
  const flags = new Set();
  const tags = dish.tags || [];

  if (tags.includes("plant-based")) {
    flags.add("plant");
    flags.add("veg");
    flags.add("df");
  }
  if (tags.includes("vegetarian")) flags.add("veg");
  if (tags.includes("gluten-free")) flags.add("gf");
  if (tags.includes("dairy-free")) flags.add("df");
  if (tags.includes("halal")) flags.add("halal");

  return flags;
}

function matchesDiets(dish) {
  if (!state.diets.length) return true;
  const flags = dishDietFlags(dish);
  return state.diets.every((key) => flags.has(key));
}

function matchesNumericFilters(dish) {
  if (state.maxCal < 900 && dish.calories > state.maxCal) return false;
  if (state.minProtein > 0 && dish.protein < state.minProtein) return false;
  if (state.highScore && dish.score < 80) return false;
  return true;
}

const placeSearchCache = new Map();
const dishSearchCache = new Map();

function placeSearchText(place) {
  if (placeSearchCache.has(place.id)) return placeSearchCache.get(place.id);

  const text = norm(
    [place.name, place.area, place.city, place.cuisine, place.blurb].join(" "),
  );
  placeSearchCache.set(place.id, text);
  return text;
}

function dishSearchText(dish) {
  if (dishSearchCache.has(dish.id)) return dishSearchCache.get(dish.id);

  const tags = (dish.tags || [])
    .map((tag) => `${dishTagLabels[tag] || tag} ${SEARCH_ALIASES[tag] || ""}`)
    .join(" ");

  const text = norm(
    [dish.name, dish.description, dish.serving, tags].join(" "),
  );
  dishSearchCache.set(dish.id, text);
  return text;
}

function getPlaceResults(query) {
  const results = [];

  for (const place of restaurants) {
    if (state.city !== "all" && place.city !== state.city) continue;
    if (state.cuisine !== "all" && place.cuisine !== state.cuisine) continue;

    const placeMatches = query ? placeSearchText(place).includes(query) : true;
    const menu = getPlaceDishes(place);
    const matching = menu.filter((dish) => {
      if (!matchesNumericFilters(dish) || !matchesDiets(dish)) return false;
      if (query && !placeMatches && !dishSearchText(dish).includes(query)) return false;
      return true;
    });

    if (!matching.length) continue;

    matching.sort((a, b) => b.score - a.score);
    const best = matching[0];
    const distance =
      userLocation && isFinite(place.lat) && isFinite(place.lng)
        ? distanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng)
        : null;

    results.push({ place, matching, best, distance });
  }

  sortPlaceResults(results);
  return results;
}

function sortPlaceResults(results) {
  if (state.sort === "nearest" && userLocation) {
    results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return;
  }

  switch (state.sort) {
    case "healthiest":
      results.sort((a, b) => b.best.score - a.best.score || b.place.rating - a.place.rating);
      break;
    case "protein":
      results.sort(
        (a, b) => maxProtein(b.matching) - maxProtein(a.matching) || b.best.score - a.best.score,
      );
      break;
    case "calories":
      results.sort(
        (a, b) =>
          Math.min(...a.matching.map((dish) => dish.calories)) -
            Math.min(...b.matching.map((dish) => dish.calories)) ||
          b.best.score - a.best.score,
      );
      break;
    case "rating":
      results.sort((a, b) => b.place.rating - a.place.rating || b.best.score - a.best.score);
      break;
    case "nearest":
    case "recommended":
    default:
      results.sort(
        (a, b) =>
          b.best.score + b.place.rating * 4 - (a.best.score + a.place.rating * 4) ||
          b.best.protein - a.best.protein,
      );
      break;
  }
}

function getDishResults(query) {
  const results = [];

  for (const dish of dishes) {
    if (!matchesNumericFilters(dish) || !matchesDiets(dish)) continue;

    const locations = dish.locations.filter((location) => {
      if (state.city !== "all" && location.city !== state.city) return false;
      if (state.cuisine !== "all") {
        const place = restaurantById.get(location.id);
        if (!place || place.cuisine !== state.cuisine) return false;
      }
      return true;
    });

    if (!locations.length) continue;

    if (query) {
      const ownMatch = dishSearchText(dish).includes(query);
      const locationMatch = locations.some((location) => {
        const place = restaurantById.get(location.id);
        const text = norm(
          [location.name, location.area, location.city, place?.cuisine || ""].join(" "),
        );
        return text.includes(query);
      });
      if (!ownMatch && !locationMatch) continue;
    }

    const primary = pickBestLocation(locations);
    const distance = userLocation ? nearestDistance(locations) : null;
    const rating = Math.max(...locations.map((location) => location.rating));

    results.push({ dish, locations, primary, distance, rating });
  }

  sortDishResults(results);
  return results;
}

function sortDishResults(results) {
  if (state.sort === "nearest" && userLocation) {
    results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return;
  }

  switch (state.sort) {
    case "healthiest":
      results.sort((a, b) => b.dish.score - a.dish.score || b.dish.protein - a.dish.protein);
      break;
    case "protein":
      results.sort((a, b) => b.dish.protein - a.dish.protein || b.dish.score - a.dish.score);
      break;
    case "calories":
      results.sort((a, b) => a.dish.calories - b.dish.calories || b.dish.score - a.dish.score);
      break;
    case "rating":
      results.sort((a, b) => b.rating - a.rating || b.dish.score - a.dish.score);
      break;
    case "nearest":
    case "recommended":
    default:
      results.sort(
        (a, b) =>
          b.dish.score + b.rating * 3 - (a.dish.score + a.rating * 3) ||
          b.dish.protein - a.dish.protein,
      );
      break;
  }
}

function maxProtein(items) {
  return Math.max(...items.map((dish) => dish.protein));
}

function pickBestLocation(locations) {
  if (!locations?.length) return null;

  if (userLocation) {
    return [...locations].sort(
      (a, b) =>
        distanceKm(userLocation.lat, userLocation.lng, a.lat, a.lng) -
        distanceKm(userLocation.lat, userLocation.lng, b.lat, b.lng),
    )[0];
  }

  return [...locations].sort((a, b) => b.rating - a.rating)[0];
}

function nearestDistance(locations) {
  if (!userLocation || !locations?.length) return null;
  return Math.min(
    ...locations.map((location) =>
      distanceKm(userLocation.lat, userLocation.lng, location.lat, location.lng),
    ),
  );
}

/* --------------------------------------------------------------------------
   Results rendering
   -------------------------------------------------------------------------- */

function renderResults() {
  if (state.sort === "nearest" && !userLocation) state.sort = "recommended";

  const query = norm(state.q);
  const cityText = state.city === "all" ? "" : ` in ${escapeHTML(state.city)}`;
  const queryText = query ? ` for “${escapeHTML(state.q.trim())}”` : "";

  if (state.view === "places") {
    const results = getPlaceResults(query);
    lastResultCount = results.length;
    const matchingDishes = new Set(
      results.flatMap((result) => result.matching.map((dish) => dish.id)),
    ).size;

    els.resultsGrid.innerHTML = results
      .map((result, index) => placeCardHtml(result, index))
      .join("");

    els.resultsCount.innerHTML =
      results.length === 0
        ? `<strong>No places</strong> match${cityText}${queryText}`
        : `<strong>${results.length}</strong> ${plural(results.length, "place")}${cityText}${queryText} <span class="results-sep">·</span> ${matchingDishes} matching ${plural(matchingDishes, "dish", "dishes")}`;
  } else {
    const results = getDishResults(query);
    lastResultCount = results.length;
    const locationCount = new Set(results.flatMap((result) => result.locations.map((loc) => loc.id)))
      .size;

    els.resultsGrid.innerHTML = results
      .map((result, index) => dishCardHtml(result, index))
      .join("");

    els.resultsCount.innerHTML =
      results.length === 0
        ? `<strong>No dishes</strong> match${cityText}${queryText}`
        : `<strong>${results.length}</strong> ${plural(results.length, "dish", "dishes")}${cityText}${queryText} <span class="results-sep">·</span> across ${locationCount} ${plural(locationCount, "spot")}`;
  }

  els.sortSelect.value = state.sort;
  els.resultsGrid.hidden = lastResultCount === 0;
  els.emptyState.hidden = lastResultCount > 0;

  renderActiveFilters();
  updateFilterCount();
  updateSearchAffordances();
  scheduleUrlSync();
}

function placeCardHtml({ place, matching, best, distance }, index) {
  const total = place.dishes.length;
  const countLabel =
    matching.length === total
      ? `${total} ${plural(total, "dish", "dishes")}`
      : `${matching.length} of ${total} match`;
  const distanceHtml =
    distance != null
      ? `<span class="distance" title="Straight-line distance from your location to the neighbourhood centre">${icon("pin")}~${formatDistance(distance)}</span>`
      : "";

  return `
    <article class="place-card" style="--i:${index}">
      <div class="place-card-top">
        <div class="emoji-tile tile-${escapeHTML(cuisineSlug(place.cuisine))}" aria-hidden="true">${escapeHTML(place.emoji)}</div>
        <div class="place-title-wrap">
          <h3 class="place-name">
            <button class="card-title-btn" type="button" data-open-place="${escapeHTML(place.id)}">${escapeHTML(place.name)}</button>
          </h3>
          <p class="place-meta">
            <span>${escapeHTML(place.area)}</span>
            <span class="dot" aria-hidden="true">·</span>
            <span>${escapeHTML(place.city)}</span>
            <span class="dot" aria-hidden="true">·</span>
            <span title="Price level ${escapeHTML(priceLabel(place.price))}">${escapeHTML(priceLabel(place.price))}</span>
            ${distanceHtml ? `<span class="dot" aria-hidden="true">·</span>${distanceHtml}` : ""}
          </p>
        </div>
        <span class="place-rating" title="Illustrative rating">
          ${icon("star")}${escapeHTML(place.rating.toFixed(1))}<span class="sr-only"> out of 5</span>
        </span>
      </div>

      <div class="tag-row">${placeDietTags(place, 3)}</div>

      <p class="place-blurb">${escapeHTML(place.blurb)}</p>

      <div class="best-dish">
        <div class="best-dish-head">
          <span class="overline">Best match</span>
          <span class="score-pill ${best.band.key}" aria-label="Forkful health score ${best.score} out of 100">${best.score}<small>/100</small></span>
        </div>
        <div class="best-dish-main">
          <span class="best-dish-name">${escapeHTML(best.name)}</span>
          <span class="best-dish-cals">${formatCalories(best.calories)} kcal</span>
        </div>
        <div class="mini-stats">
          <span><strong>${formatNumber(best.protein, 1)}g</strong> protein</span>
          <span><strong>${formatNumber(best.fiber, 1)}g</strong> fibre</span>
          <span><strong>${formatNumber(best.sodium)}mg</strong> sodium</span>
        </div>
        ${macroBarHtml(best)}
      </div>

      <div class="place-card-footer">
        <span class="dish-count">${countLabel}</span>
        <button class="card-link" type="button" data-open-place="${escapeHTML(place.id)}">
          View menu ${icon("arrow-right")}
        </button>
      </div>
    </article>`;
}

function dishCardHtml({ dish, locations, primary, distance }, index) {
  const primaryPlace = primary ? restaurantById.get(primary.id) : null;
  const moreCount = Math.max(0, locations.length - 1);
  const locationLine = primary
    ? `<button type="button" data-open-place="${escapeHTML(primary.id)}">${escapeHTML(primary.name)}</button>
       <span aria-hidden="true">·</span>
       <span>${escapeHTML(primary.area)}, ${escapeHTML(primary.city)}</span>
       ${moreCount > 0 ? `<span class="loc-more" title="Available at ${locations.length} locations">+${moreCount} ${plural(moreCount, "spot")}</span>` : ""}
       ${distance != null ? `<span class="dish-distance" title="Nearest location, straight-line estimate">${icon("pin")}~${formatDistance(distance)}</span>` : ""}`
    : "";

  return `
    <article class="dish-card" style="--i:${index}">
      <div class="dish-card-top">
        <div class="emoji-tile tile-${escapeHTML(cuisineSlug(primaryPlace?.cuisine || ""))}" aria-hidden="true">${escapeHTML(dish.emoji)}</div>
        <div class="dish-title-wrap">
          <p class="dish-place">${locationLine}</p>
          <h3 class="dish-name">
            <button class="card-title-btn" type="button" data-open-dish="${escapeHTML(dish.id)}">${escapeHTML(dish.name)}</button>
          </h3>
        </div>
        ${scoreRingHtml(dish)}
      </div>

      <div class="tag-row">${dishBadges(dish, 3)}</div>
      <p class="dish-desc">${escapeHTML(dish.description)}</p>

      <div class="nutrition-strip">
        <div><span>Calories</span><strong>${formatCalories(dish.calories)}</strong></div>
        <div><span>Protein</span><strong>${formatNumber(dish.protein, 1)}g</strong></div>
        <div><span>Fibre</span><strong>${formatNumber(dish.fiber, 1)}g</strong></div>
        <div><span>Sodium</span><strong>${formatNumber(dish.sodium)}<small>mg</small></strong></div>
      </div>

      ${macroBarHtml(dish)}

      <div class="dish-card-footer">
        <button class="card-link" type="button" data-open-dish="${escapeHTML(dish.id)}">
          Full breakdown ${icon("arrow-right")}
        </button>
        <button class="add-button" type="button" data-add-dish="${escapeHTML(dish.id)}" aria-label="Add ${escapeHTML(dish.name)} to your meal">
          ${icon("plus")}Add
        </button>
      </div>
    </article>`;
}

function placeDietTags(place, limit = place.diet.length) {
  return place.diet
    .slice(0, limit)
    .map((key) => {
      const classes = key === "plant" ? "tag-plant" : key === "halal" ? "tag-halal" : "";
      return `<span class="tag ${classes}">${escapeHTML(dietLabels[key] || key)}</span>`;
    })
    .join("");
}

const BADGE_PRIORITY = [
  "high-protein",
  "high-fiber",
  "plant-based",
  "gluten-free",
  "omega-3",
  "light",
  "vegetarian",
  "halal",
  "spicy",
];

function dishBadges(dish, limit = 2) {
  const tags = [...(dish.tags || [])]
    .filter((tag) => tag !== "fried")
    .sort((a, b) => {
      const aIndex = BADGE_PRIORITY.indexOf(a);
      const bIndex = BADGE_PRIORITY.indexOf(b);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    })
    .slice(0, limit);

  return tags
    .map((tag) => {
      let className = "";
      if (tag === "plant-based") className = "tag-plant";
      else if (tag === "high-protein") className = "tag-high-protein";
      else if (tag === "high-fiber") className = "tag-high-fiber";
      else if (tag === "halal") className = "tag-halal";
      return `<span class="tag ${className}">${escapeHTML(dishTagLabels[tag] || tag)}</span>`;
    })
    .join("");
}

function scoreRingHtml(dish) {
  return `
    <div class="score-ring ${dish.band.key}" role="img" aria-label="Forkful health score ${dish.score} out of 100, ${escapeHTML(dish.band.label)}">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="ring-bg" cx="22" cy="22" r="18"></circle>
        <circle class="ring-value" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - dish.score}"></circle>
      </svg>
      <span class="score-number">${dish.score}</span>
    </div>`;
}

function macroBarHtml(dish) {
  const percentages = macroPercentages(dish);
  const aria = `Macro split by calories: ${Math.round(percentages.protein)} percent protein, ${Math.round(percentages.carbs)} percent carbs, ${Math.round(percentages.fat)} percent fat`;
  return `
    <div class="macro-bar" role="img" aria-label="${aria}">
      <span class="macro-protein" style="width:${percentages.protein.toFixed(2)}%"></span>
      <span class="macro-carbs" style="width:${percentages.carbs.toFixed(2)}%"></span>
      <span class="macro-fat" style="width:${percentages.fat.toFixed(2)}%"></span>
    </div>`;
}

/* --------------------------------------------------------------------------
   Detail dialog
   -------------------------------------------------------------------------- */

function openDishDetail(dishId) {
  const dish = dishById.get(dishId);
  if (!dish) return;
  showDetailHtml(dishDetailHtml(dish));
}

function openPlaceDetail(placeId) {
  const place = restaurantById.get(placeId);
  if (!place) return;
  showDetailHtml(placeDetailHtml(place));
}

function showDetailHtml(html) {
  const wasOpen = els.detailDialog.open;
  els.detailContent.innerHTML = html;

  if (!wasOpen) {
    openDialog(els.detailDialog);
  }

  const scrollArea = $(".modal-scroll", els.detailDialog);
  if (scrollArea) {
    scrollArea.scrollTop = 0;
  }

  if (wasOpen) {
    const title = $("#detail-title", els.detailContent);
    if (title) {
      title.setAttribute("tabindex", "-1");
      title.focus({ preventScroll: true });
    }
  }
}

function dishDetailHtml(dish) {
  const insights = getDishInsights(dish);
  const locations = [...dish.locations].sort((a, b) => {
    if (userLocation) {
      return (
        distanceKm(userLocation.lat, userLocation.lng, a.lat, a.lng) -
        distanceKm(userLocation.lat, userLocation.lng, b.lat, b.lng)
      );
    }
    return b.rating - a.rating;
  });
  const primary = locations[0];
  const primaryPlace = primary ? restaurantById.get(primary.id) : null;
  const mapUrl = primary ? mapsUrl(primary) : "#";
  const primaryDistance = primary && userLocation ? nearestDistance([primary]) : null;
  const percentages = macroPercentages(dish);

  const nutrientTiles = [
    {
      label: "Fibre",
      amount: `${formatNumber(dish.fiber, 1)} g`,
      pct: percentDV(dish.fiber, "fiber"),
      className: "is-fiber",
    },
    {
      label: "Sugar",
      amount: `${formatNumber(dish.sugar, 1)} g`,
      pct: percentDV(dish.sugar, "sugar"),
      className: "is-sugar",
    },
    {
      label: "Sodium",
      amount: `${formatNumber(dish.sodium)} mg`,
      pct: percentDV(dish.sodium, "sodium"),
      className: "is-sodium",
    },
    {
      label: "Saturated fat",
      amount: `${formatNumber(dish.satFat, 1)} g`,
      pct: percentDV(dish.satFat, "satFat"),
      className: "is-satfat",
    },
  ]
    .map(
      (nutrient) => `
        <div class="nutrient-tile ${nutrient.className}">
          <div class="nutrient-tile-head">
            <span>${escapeHTML(nutrient.label)}</span>
            <strong>${escapeHTML(nutrient.amount)}</strong>
          </div>
          <small>${nutrient.pct}% daily value</small>
          <div class="nutrient-bar"><span style="width:${Math.min(nutrient.pct, 100)}%"></span></div>
        </div>`,
    )
    .join("");

  const facts = [
    ["Calories", `${formatCalories(dish.calories)} kcal`, `${percentDV(dish.calories, "calories")}%`],
    ["Protein", `${formatNumber(dish.protein, 1)} g`, `${percentDV(dish.protein, "protein")}%`],
    ["Carbohydrates", `${formatNumber(dish.carbs, 1)} g`, `${percentDV(dish.carbs, "carbs")}%`],
    ["Fat", `${formatNumber(dish.fat, 1)} g`, `${percentDV(dish.fat, "fat")}%`],
    ["Saturated fat", `${formatNumber(dish.satFat, 1)} g`, `${percentDV(dish.satFat, "satFat")}%`],
    ["Fibre", `${formatNumber(dish.fiber, 1)} g`, `${percentDV(dish.fiber, "fiber")}%`],
    ["Sugars", `${formatNumber(dish.sugar, 1)} g`, `${percentDV(dish.sugar, "sugar")}%`],
    ["Sodium", `${formatNumber(dish.sodium)} mg`, `${percentDV(dish.sodium, "sodium")}%`],
  ]
    .map(
      ([label, amount, dv]) => `
        <div class="fact-row">
          <span>${escapeHTML(label)}</span>
          <strong>${escapeHTML(amount)}</strong>
          <span class="dv">${escapeHTML(dv)}</span>
        </div>`,
    )
    .join("");

  const locationRows = locations
    .map((location) => {
      const km = userLocation
        ? distanceKm(userLocation.lat, userLocation.lng, location.lat, location.lng)
        : null;
      return `
        <button class="location-row" type="button" data-open-place="${escapeHTML(location.id)}">
          <span>
            <strong>${escapeHTML(location.name)}</strong>
            <small>${escapeHTML(location.area)}, ${escapeHTML(location.city)}</small>
          </span>
          <span class="location-distance">${km != null ? `~${formatDistance(km)}` : `★ ${escapeHTML(location.rating.toFixed(1))}`}</span>
        </button>`;
    })
    .join("");

  const watchouts = insights.watchouts.length
    ? `<div class="watchouts">
         <h4>Worth knowing</h4>
         <ul>${insights.watchouts.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
       </div>`
    : `<p class="no-watchouts">No major flags on sodium, sugar or saturated fat for this serving.</p>`;

  return `
    <div class="modal-topbar">
      <div>
        <p class="overline">Dish breakdown</p>
        <p class="modal-context">${escapeHTML(dish.serving)} · ${escapeHTML(primaryPlace?.cuisine || "GTA")}</p>
      </div>
      <button class="modal-close" type="button" data-close-dialog aria-label="Close dish details">
        ${icon("x")}
      </button>
    </div>
    <div class="modal-scroll">
      <div class="detail-hero">
        <div class="detail-emoji" aria-hidden="true">${escapeHTML(dish.emoji)}</div>
        <div class="detail-heading">
          <p class="detail-breadcrumb">
            <span>${escapeHTML(primaryPlace?.cuisine || "GTA find")}</span>
            <span aria-hidden="true">·</span>
            <button type="button" data-open-place="${escapeHTML(primary?.id || "")}">${escapeHTML(primary?.name || "Find a spot")}</button>
            <span aria-hidden="true">·</span>
            <span>${escapeHTML(primary ? `${primary.area}, ${primary.city}` : "GTA")}</span>
          </p>
          <h2 id="detail-title">${escapeHTML(dish.name)}</h2>
          <p class="detail-desc">${escapeHTML(dish.description)}</p>
          <div class="tag-row">${dishBadges(dish, 4)}</div>
        </div>
        <div class="detail-score">
          ${scoreRingHtml(dish)}
          <div class="detail-score-copy">
            <strong>${dish.score} / 100</strong>
            <span>${escapeHTML(dish.band.label)} · per serving</span>
          </div>
        </div>
      </div>

      <div class="detail-hero-actions">
        <button class="btn btn-primary" type="button" data-add-dish="${escapeHTML(dish.id)}">
          ${icon("plus")} Add to meal
        </button>
        <a class="btn btn-secondary" href="${mapUrl}" target="_blank" rel="noreferrer">
          ${icon("pin")} Find it
          ${icon("arrow-up-right")}
        </a>
      </div>

      <div class="detail-layout">
        <section class="panel macro-panel" aria-labelledby="nutrition-heading">
          <div class="panel-head">
            <div>
              <p class="overline">Per serving</p>
              <h3 id="nutrition-heading">Nutrition breakdown</h3>
            </div>
            <span>${escapeHTML(dish.serving)}</span>
          </div>
          <div class="energy-line">
            <strong>${formatCalories(dish.calories)}</strong>
            <span>kcal</span>
            <small>${percentDV(dish.calories, "calories")}% of a 2,000 kcal reference day</small>
          </div>
          ${macroBarHtml(dish)}
          <div class="macro-key">
            <span><i class="macro-dot protein"></i>Protein <strong>${formatNumber(dish.protein, 1)} g</strong> · ${Math.round(percentages.protein)}%</span>
            <span><i class="macro-dot carbs"></i>Carbs <strong>${formatNumber(dish.carbs, 1)} g</strong> · ${Math.round(percentages.carbs)}%</span>
            <span><i class="macro-dot fat"></i>Fat <strong>${formatNumber(dish.fat, 1)} g</strong> · ${Math.round(percentages.fat)}%</span>
          </div>
          <div class="nutrient-grid">${nutrientTiles}</div>
          <details class="full-facts">
            <summary>Full nutrient table ${icon("chevron")}</summary>
            <div class="fact-list">${facts}</div>
            <p class="dv-note">% daily values are based on a 2,000 kcal reference diet. They are general guidance, not a personal target.</p>
          </details>
        </section>

        <aside class="detail-side">
          <section class="panel insight-panel" aria-labelledby="insight-heading">
            <p class="overline">Why it fits</p>
            <h3 id="insight-heading">${escapeHTML(insights.strengths.slice(0, 2).join(" + "))}.</h3>
            <div class="insight-chips">
              ${insights.strengths.map((item) => `<span class="tag">${escapeHTML(item)}</span>`).join("")}
            </div>
            ${watchouts}
            <button class="text-button" type="button" data-open-about>
              How this score works ${icon("arrow-right")}
            </button>
          </section>

          <section class="panel location-panel" aria-labelledby="location-heading">
            <div class="panel-head">
              <h3 id="location-heading">Where to find it</h3>
              <span>${locations.length} ${plural(locations.length, "spot")}</span>
            </div>
            <div class="location-list">${locationRows}</div>
            <a class="btn btn-secondary" href="${mapUrl}" target="_blank" rel="noreferrer">
              ${icon("pin")} Open in Google Maps ${icon("arrow-up-right")}
            </a>
            <p class="location-note">
              Neighbourhood pin, not the exact door${primaryDistance != null ? ` · ~${formatDistance(primaryDistance)} away` : ""}. Call ahead for today's menu and allergens.
            </p>
          </section>
        </aside>
      </div>

      <p class="detail-note">${escapeHTML(DATA_NOTE)}</p>
    </div>`;
}

function placeDetailHtml(place) {
  const menu = [...getPlaceDishes(place)].sort((a, b) => b.score - a.score);
  const best = menu[0];
  const distance = userLocation
    ? distanceKm(userLocation.lat, userLocation.lng, place.lat, place.lng)
    : null;
  const mapUrl = mapsUrl(place);

  const menuRows = menu
    .map(
      (dish) => `
        <article class="menu-row">
          <div class="menu-row-emoji" aria-hidden="true">${escapeHTML(dish.emoji)}</div>
          <div class="menu-row-main">
            <div class="menu-row-title">
              <h4><button type="button" data-open-dish="${escapeHTML(dish.id)}">${escapeHTML(dish.name)}</button></h4>
              <span class="score-pill ${dish.band.key}">${dish.score}<small>/100</small></span>
            </div>
            <p class="menu-row-desc">${escapeHTML(dish.description)}</p>
            <div class="menu-row-stats">
              <span><strong>${formatCalories(dish.calories)}</strong> kcal</span>
              <span><strong>${formatNumber(dish.protein, 1)} g</strong> protein</span>
              <span><strong>${formatNumber(dish.fiber, 1)} g</strong> fibre</span>
              <span><strong>${formatNumber(dish.sodium)} mg</strong> sodium</span>
            </div>
          </div>
          <div class="menu-row-actions">
            <button class="icon-add" type="button" data-add-dish="${escapeHTML(dish.id)}" aria-label="Add ${escapeHTML(dish.name)} to your meal">
              ${icon("plus")}
            </button>
            <button class="menu-row-open" type="button" data-open-dish="${escapeHTML(dish.id)}" aria-label="View full nutrition for ${escapeHTML(dish.name)}">
              ${icon("arrow-right")}
            </button>
          </div>
        </article>`,
    )
    .join("");

  return `
    <div class="modal-topbar">
      <div>
        <p class="overline">Spot details</p>
        <p class="modal-context">${escapeHTML(place.cuisine)} · ${escapeHTML(place.area)}, ${escapeHTML(place.city)}</p>
      </div>
      <button class="modal-close" type="button" data-close-dialog aria-label="Close spot details">
        ${icon("x")}
      </button>
    </div>
    <div class="modal-scroll">
      <div class="detail-hero">
        <div class="detail-emoji" aria-hidden="true">${escapeHTML(place.emoji)}</div>
        <div class="detail-heading">
          <p class="detail-breadcrumb">
            <span>${escapeHTML(place.cuisine)}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHTML(place.area)}, ${escapeHTML(place.city)}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHTML(priceLabel(place.price))}</span>
          </p>
          <h2 id="detail-title">${escapeHTML(place.name)}</h2>
          <p class="detail-desc">${escapeHTML(place.blurb)}</p>
          <div class="tag-row">${placeDietTags(place)}</div>
        </div>
        <div class="detail-score detail-place-rating">
          ${icon("star")}
          <div>
            <strong>${escapeHTML(place.rating.toFixed(1))}</strong>
            <span>illustrative rating</span>
          </div>
        </div>
      </div>

      <div class="detail-hero-actions">
        ${
          best
            ? `<button class="btn btn-primary" type="button" data-add-dish="${escapeHTML(best.id)}">
                 ${icon("plus")} Add best match
               </button>`
            : ""
        }
        <a class="btn btn-secondary" href="${mapUrl}" target="_blank" rel="noreferrer">
          ${icon("pin")} Directions ${icon("arrow-up-right")}
        </a>
      </div>

      <div class="detail-layout">
        <section class="panel menu-panel" aria-labelledby="menu-heading">
          <div class="panel-head">
            <div>
              <p class="overline">Menu snapshot</p>
              <h3 id="menu-heading">Dishes & numbers</h3>
            </div>
            <span>${menu.length} ${plural(menu.length, "dish", "dishes")}</span>
          </div>
          <div class="menu-list">${menuRows}</div>
          <p class="dv-note">A sample of the menu, not a live menu. Tap any dish for the full breakdown.</p>
        </section>

        <aside class="detail-side">
          <section class="panel" aria-labelledby="facts-heading">
            <h3 id="facts-heading">Good to know</h3>
            <dl class="place-facts">
              <div><dt>Cuisine</dt><dd>${escapeHTML(place.cuisine)}</dd></div>
              <div><dt>Price</dt><dd>${escapeHTML(priceLabel(place.price))}</dd></div>
              <div><dt>Rating</dt><dd>★ ${escapeHTML(place.rating.toFixed(1))} / 5</dd></div>
              <div><dt>Top dish score</dt><dd>${best ? `${best.score} / 100` : "—"}</dd></div>
              <div><dt>Dietary</dt><dd>${place.diet.map((key) => escapeHTML(dietLabels[key])).join(", ")}</dd></div>
            </dl>
          </section>

          <section class="panel location-panel" aria-labelledby="find-heading">
            <h3 id="find-heading">Find it</h3>
            <p class="location-note">
              ${escapeHTML(place.area)}, ${escapeHTML(place.city)}${distance != null ? ` · ~${formatDistance(distance)} away` : ""}
            </p>
            <a class="btn btn-secondary" href="${mapUrl}" target="_blank" rel="noreferrer">
              ${icon("pin")} Open in Google Maps ${icon("arrow-up-right")}
            </a>
            <p class="location-note">The pin points to the neighbourhood centre, not the exact door. Confirm hours and menu directly with the restaurant.</p>
          </section>
        </aside>
      </div>

      <p class="detail-note">${escapeHTML(DATA_NOTE)}</p>
    </div>`;
}

function mapsUrl(location) {
  const query = encodeURIComponent(
    `${location.name} ${location.area || ""} ${location.city || ""} Ontario`,
  );
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function openDialog(dialog) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  document.body.classList.add("modal-open");
}

function syncModalLock() {
  const anyDialogOpen = Boolean(document.querySelector("dialog[open]"));
  document.body.classList.toggle("modal-open", anyDialogOpen);
}

/* --------------------------------------------------------------------------
   Meal builder
   -------------------------------------------------------------------------- */

function loadMeal() {
  try {
    const raw = JSON.parse(localStorage.getItem(MEAL_KEY) || "[]");
    if (!Array.isArray(raw)) return [];

    const merged = new Map();
    for (const item of raw) {
      const id = typeof item === "string" ? item : item?.id;
      if (!id || !dishById.has(id)) continue;
      const quantity = clamp(
        Math.round(Number(typeof item === "object" ? item.qty : 1) || 1),
        1,
        9,
      );
      if (merged.has(id)) merged.set(id, clamp((merged.get(id) || 0) + quantity, 1, 9));
      else merged.set(id, quantity);
    }

    return [...merged.entries()].map(([id, qty]) => ({ id, qty }));
  } catch (error) {
    return [];
  }
}

function saveMeal() {
  try {
    localStorage.setItem(MEAL_KEY, JSON.stringify(meal));
  } catch (error) {
    // Meal still works for this session.
  }
}

function loadMealTarget() {
  try {
    const stored = Number(localStorage.getItem(TARGET_KEY));
    return TARGETS.includes(stored) ? stored : 2000;
  } catch (error) {
    return 2000;
  }
}

function saveMealTarget() {
  try {
    localStorage.setItem(TARGET_KEY, String(mealTarget));
  } catch (error) {
    // Reference target still applies for this session.
  }
}

function getMealEntries() {
  return meal
    .map((entry) => ({ ...entry, dish: dishById.get(entry.id) }))
    .filter((entry) => Boolean(entry.dish));
}

function getMealTotals() {
  const entries = getMealEntries();
  const totals = {
    count: 0,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    satFat: 0,
  };

  for (const entry of entries) {
    const quantity = entry.qty || 1;
    totals.count += quantity;
    for (const key of [
      "calories",
      "protein",
      "carbs",
      "fat",
      "fiber",
      "sugar",
      "sodium",
      "satFat",
    ]) {
      totals[key] += (entry.dish[key] || 0) * quantity;
    }
  }

  return totals;
}

function updateMealUI() {
  const totals = getMealTotals();
  els.mealCountTop.textContent = String(totals.count);
  els.mealCountTop.classList.toggle("has-items", totals.count > 0);
  els.openMealTop.setAttribute(
    "aria-label",
    totals.count > 0 ? `Open your meal, ${totals.count} ${plural(totals.count, "item")}` : "Open your meal",
  );

  els.openMealFab.hidden = totals.count === 0;
  els.mealFabSummary.textContent = `${totals.count} ${plural(totals.count, "item")} · ${formatCalories(totals.calories)} kcal`;
}

function addDishToMeal(dishId, button = null) {
  const dish = dishById.get(dishId);
  if (!dish) return;

  const existing = meal.find((entry) => entry.id === dishId);
  if (existing && existing.qty >= 9) {
    if (!document.querySelector("dialog[open]")) {
      showToast("That dish is already at the maximum quantity.");
    }
    return;
  }

  if (existing) {
    existing.qty = clamp(existing.qty + 1, 1, 9);
  } else {
    meal = [...meal, { id: dishId, qty: 1 }];
  }

  saveMeal();
  updateMealUI();

  const mealOpen = els.mealDialog.open;
  if (mealOpen) {
    renderMeal();
  } else if (button) {
    flashAdded(button);
  }

  const totals = getMealTotals();
  announce(
    `${dish.name} added to your meal. ${totals.count} ${plural(totals.count, "item")} total.`,
  );

  const dialogOpen = Boolean(document.querySelector("dialog[open]"));
  if (!dialogOpen) {
    showToast(`Added ${dish.name}`, {
      actionLabel: "View meal",
      onAction: openMeal,
      duration: 3600,
    });
  }
}

function flashAdded(button) {
  const existing = flashTimers.get(button);
  if (existing) window.clearTimeout(existing.timer);

  if (!existing) {
    flashTimers.set(button, { original: button.innerHTML });
  }

  const state = flashTimers.get(button);
  button.classList.add("is-added");
  const isPill = button.classList.contains("add-button");
  button.innerHTML = `${icon("check")}${isPill ? " Added" : ""}`;

  state.timer = window.setTimeout(() => {
    if (button.isConnected) {
      button.classList.remove("is-added");
      button.innerHTML = state.original;
    }
    flashTimers.delete(button);
  }, 1400);
}

function renderMeal() {
  const entries = getMealEntries();
  const totals = getMealTotals();
  const scrollTop = els.mealContent.scrollTop;
  const activeElement = document.activeElement;
  const activeMealAction =
    activeElement instanceof HTMLElement && els.mealContent.contains(activeElement)
      ? {
          action: activeElement.dataset.mealAction || "",
          id: activeElement.dataset.mealId || "",
          elementId: activeElement.id || "",
          isClear: Boolean(activeElement.closest("[data-meal-clear]")),
        }
      : null;

  if (!entries.length) {
    const suggestions = [...dishes]
      .sort((a, b) => b.score - a.score || a.calories - b.calories)
      .slice(0, 3);

    els.mealContent.innerHTML = `
      <div class="meal-empty">
        <div class="meal-empty-emoji" aria-hidden="true">🥗</div>
        <h3>An empty plate is a fresh start.</h3>
        <p>Add dishes from the guide to see the combined calories, macros and a couple of useful nudges.</p>
        <div class="suggestion-list">
          <p class="suggestion-label">Three strong places to start</p>
          ${suggestions
            .map((dish) => {
              const location = pickBestLocation(dish.locations);
              return `
                <button class="suggestion" type="button" data-add-dish="${escapeHTML(dish.id)}">
                  <span class="suggestion-emoji" aria-hidden="true">${escapeHTML(dish.emoji)}</span>
                  <span class="suggestion-copy">
                    <strong>${escapeHTML(dish.name)}</strong>
                    <small>${escapeHTML(location?.name || "GTA")} · ${formatCalories(dish.calories)} kcal · ${dish.score}/100</small>
                  </span>
                  <span class="suggestion-btn">${icon("plus")} Add</span>
                </button>`;
            })
            .join("")}
        </div>
        <div class="meal-empty-actions">
          <button class="text-button" type="button" data-meal-add-more>
            Browse all dishes ${icon("arrow-right")}
          </button>
        </div>
      </div>`;
    els.mealContent.scrollTop = 0;

    if (activeMealAction) {
      window.requestAnimationFrame(() => {
        els.mealContent.querySelector("[data-meal-add-more]")?.focus();
      });
    }
    return;
  }

  const target = mealTarget;
  const caloriePercent = target > 0 ? Math.min(100, (totals.calories / target) * 100) : 0;
  const remaining = target - totals.calories;
  const weightedScore = Math.round(
    entries.reduce((total, entry) => total + entry.dish.score * entry.qty, 0) /
      Math.max(totals.count, 1),
  );
  const tips = buildMealTips(totals);
  const percentages = macroPercentages(totals);

  const items = entries
    .map((entry) => {
      const dish = entry.dish;
      const location = pickBestLocation(dish.locations);
      const locationText = location
        ? `${location.name} · ${location.area}${dish.locations.length > 1 ? ` +${dish.locations.length - 1}` : ""}`
        : "GTA";

      return `
        <li class="meal-item">
          <span class="meal-item-emoji" aria-hidden="true">${escapeHTML(dish.emoji)}</span>
          <div class="meal-item-copy">
            <strong>${escapeHTML(dish.name)}</strong>
            <span>${escapeHTML(locationText)}</span>
            <small>${formatCalories(dish.calories * entry.qty)} kcal · ${formatNumber(dish.protein * entry.qty, 1)} g protein · ${formatNumber(dish.fiber * entry.qty, 1)} g fibre</small>
          </div>
          <div class="qty-control">
            <button type="button" data-meal-action="dec" data-meal-id="${escapeHTML(dish.id)}" aria-label="Remove one ${escapeHTML(dish.name)}">
              ${icon("minus")}
            </button>
            <span aria-label="Quantity ${entry.qty}">${entry.qty}</span>
            <button type="button" data-meal-action="inc" data-meal-id="${escapeHTML(dish.id)}" aria-label="Add another ${escapeHTML(dish.name)}">
              ${icon("plus")}
            </button>
          </div>
          <button class="meal-remove" type="button" data-meal-action="remove" data-meal-id="${escapeHTML(dish.id)}" aria-label="Remove ${escapeHTML(dish.name)} from your meal">
            ${icon("trash")}
          </button>
        </li>`;
    })
    .join("");

  const targetOptions = TARGETS.map(
    (value) =>
      `<option value="${value}" ${value === target ? "selected" : ""}>${formatNumber(value)} kcal</option>`,
  ).join("");

  els.mealContent.innerHTML = `
    <div class="meal-layout">
      <section class="meal-items" aria-labelledby="meal-items-heading">
        <div class="meal-items-head">
          <h3 id="meal-items-heading">${totals.count} ${plural(totals.count, "item")}</h3>
          <button class="text-button" type="button" data-meal-clear>Clear plate</button>
        </div>
        <ul class="meal-list">${items}</ul>
        <div class="meal-items-footer">
          <button class="text-button" type="button" data-meal-add-more>
            Add more dishes ${icon("arrow-right")}
          </button>
        </div>
      </section>

      <aside class="meal-summary" aria-label="Meal nutrition totals">
        <span class="overline">Meal total</span>
        <div class="meal-calories">
          <strong>${formatCalories(totals.calories)}</strong>
          <span>kcal</span>
        </div>

        <div class="meal-target-row">
          <label for="meal-target">Daily reference</label>
          <select id="meal-target">${targetOptions}</select>
        </div>

        <div class="progress-track" role="progressbar" aria-label="Calories compared to reference" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(totals.calories, target)}">
          <span style="width:${caloriePercent.toFixed(1)}%"></span>
        </div>
        <div class="progress-caption">
          <span>${Math.round((totals.calories / target) * 100)}% of reference</span>
          <strong>${remaining >= 0 ? `${formatCalories(remaining)} kcal left` : `${formatCalories(Math.abs(remaining))} kcal over`}</strong>
        </div>

        <div class="meal-macros">
          <div class="meal-macro"><span>Protein</span><strong>${formatNumber(totals.protein, 1)} g</strong></div>
          <div class="meal-macro"><span>Carbs</span><strong>${formatNumber(totals.carbs, 1)} g</strong></div>
          <div class="meal-macro"><span>Fat</span><strong>${formatNumber(totals.fat, 1)} g</strong></div>
          <div class="meal-macro"><span>Fibre</span><strong>${formatNumber(totals.fiber, 1)} g</strong></div>
          <div class="meal-macro"><span>Sugar</span><strong>${formatNumber(totals.sugar, 1)} g</strong></div>
          <div class="meal-macro"><span>Sodium</span><strong>${formatNumber(totals.sodium)} mg</strong></div>
        </div>

        ${macroBarHtml(totals)}
        <div class="macro-key">
          <span><i class="macro-dot protein"></i>P <strong>${formatNumber(totals.protein, 1)}g</strong> · ${Math.round(percentages.protein)}%</span>
          <span><i class="macro-dot carbs"></i>C <strong>${formatNumber(totals.carbs, 1)}g</strong> · ${Math.round(percentages.carbs)}%</span>
          <span><i class="macro-dot fat"></i>F <strong>${formatNumber(totals.fat, 1)}g</strong> · ${Math.round(percentages.fat)}%</span>
        </div>

        <div class="meal-score">
          <span>Average dish score</span>
          <strong>${weightedScore} / 100</strong>
        </div>

        <ul class="meal-tips">
          ${tips.map((tip) => `<li>${escapeHTML(tip)}</li>`).join("")}
        </ul>

        <p class="meal-note">Totals use estimated per-serving values. The daily reference is a general guide, not a personal target.</p>
      </aside>
    </div>`;

  els.mealContent.scrollTop = scrollTop;

  window.requestAnimationFrame(() => {
    if (activeMealAction?.elementId === "meal-target") {
      els.mealContent.querySelector("#meal-target")?.focus();
      return;
    }

    if (activeMealAction?.action && activeMealAction?.id) {
      const replacement = els.mealContent.querySelector(
        `[data-meal-action="${activeMealAction.action}"][data-meal-id="${activeMealAction.id}"]`,
      );
      if (replacement) {
        replacement.focus();
        return;
      }
    }

    if (activeMealAction?.action || activeMealAction?.isClear) {
      els.mealContent.querySelector("[data-meal-add-more]")?.focus();
    }
  });
}

function adjustMealQuantity(dishId, delta) {
  const entry = meal.find((item) => item.id === dishId);
  if (!entry) return;

  const dish = dishById.get(dishId);
  entry.qty += delta;
  if (entry.qty <= 0) {
    meal = meal.filter((item) => item.id !== dishId);
    announce(`${dish?.name || "Dish"} removed from your meal.`);
  } else {
    entry.qty = clamp(entry.qty, 1, 9);
    announce(`${dish?.name || "Dish"} quantity ${entry.qty}.`);
  }

  saveMeal();
  updateMealUI();
  renderMeal();
}

function removeMealItem(dishId) {
  const dish = dishById.get(dishId);
  meal = meal.filter((item) => item.id !== dishId);
  saveMeal();
  updateMealUI();
  renderMeal();
  announce(`${dish?.name || "Dish"} removed from your meal.`);
}

function clearMeal() {
  meal = [];
  saveMeal();
  updateMealUI();
  renderMeal();
  announce("Meal cleared.");
}

function openMeal() {
  if (els.detailDialog.open) els.detailDialog.close();
  if (els.aboutDialog.open) els.aboutDialog.close();

  renderMeal();
  if (!els.mealDialog.open) openDialog(els.mealDialog);
  const content = els.mealContent;
  if (content) content.scrollTop = 0;
}

/* --------------------------------------------------------------------------
   Filters drawer
   -------------------------------------------------------------------------- */

function openFilters() {
  if (!mobileFilterQuery.matches) return;
  filterReturnFocus = document.activeElement;
  els.filtersBackdrop.hidden = false;
  document.body.classList.add("filters-open");
  els.openFilters.setAttribute("aria-expanded", "true");
  els.filtersPanel.setAttribute("role", "dialog");
  els.filtersPanel.setAttribute("aria-modal", "true");

  window.setTimeout(() => els.closeFilters.focus(), 60);
}

function closeFilters({ restoreFocus = true } = {}) {
  if (!document.body.classList.contains("filters-open")) return;
  document.body.classList.remove("filters-open");
  els.filtersBackdrop.hidden = true;
  els.openFilters.setAttribute("aria-expanded", "false");
  els.filtersPanel.setAttribute("role", "group");
  els.filtersPanel.removeAttribute("aria-modal");

  if (restoreFocus) {
    const target = filterReturnFocus || els.openFilters;
    if (target && typeof target.focus === "function") target.focus();
  }
  filterReturnFocus = null;
}

function trapFocus(event, container) {
  if (event.key !== "Tab") return;

  const focusable = $$(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    container,
  ).filter((element) => element.getClientRects().length > 0);

  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/* --------------------------------------------------------------------------
   Geolocation
   -------------------------------------------------------------------------- */

function ensureLocation() {
  if (userLocation) return Promise.resolve(userLocation);
  if (!navigator.geolocation) {
    showToast("Location isn't available in this browser. Try filtering by city instead.");
    return Promise.resolve(null);
  }

  const label = $("span", els.nearMe);
  const previousLabel = label?.textContent || "Near me";
  if (label) label.textContent = "Locating…";
  els.nearMe.classList.add("is-loading");
  els.nearMe.disabled = true;
  els.nearMe.setAttribute("aria-busy", "true");

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        if (label) label.textContent = "Near you";
        els.nearMe.classList.remove("is-loading");
        els.nearMe.disabled = false;
        els.nearMe.removeAttribute("aria-busy");
        updateNearButton();
        showToast("Using approximate straight-line distances from neighbourhood centres.");
        resolve(userLocation);
      },
      (error) => {
        if (label) label.textContent = previousLabel;
        els.nearMe.classList.remove("is-loading");
        els.nearMe.disabled = false;
        els.nearMe.removeAttribute("aria-busy");

        let message = "Couldn't get your location. You can still browse by city.";
        if (error?.code === 1) {
          message = "Location permission was blocked. You can still browse by city.";
        } else if (error?.code === 3) {
          message = "Location took too long. Try again or browse by city.";
        }
        showToast(message, { duration: 4200 });
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 },
    );
  });
}

async function handleNearMe() {
  if (userLocation) {
    state.sort = "nearest";
    syncFilterControls();
    renderResults();
    showToast("Sorted by nearest.");
    return;
  }

  const location = await ensureLocation();
  if (!location) return;

  state.sort = "nearest";
  syncFilterControls();
  renderResults();
}

async function handleSortChange() {
  const selected = els.sortSelect.value;

  if (selected === "nearest" && !userLocation) {
    const previous = state.sort;
    els.sortSelect.value = previous;
    const location = await ensureLocation();
    if (!location) {
      els.sortSelect.value = state.sort;
      return;
    }
  }

  state.sort = selected;
  els.sortSelect.value = selected;
  renderResults();
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

function showToast(message, { actionLabel = "", onAction = null, duration = 3200 } = {}) {
  window.clearTimeout(toastTimer);
  toastActionHandler = onAction;

  els.toastMessage.textContent = message;
  els.toastAction.hidden = !actionLabel;
  els.toastAction.textContent = actionLabel;
  els.toast.hidden = false;

  toastTimer = window.setTimeout(hideToast, duration);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  els.toast.hidden = true;
  toastActionHandler = null;
}

/* --------------------------------------------------------------------------
   Misc UI
   -------------------------------------------------------------------------- */

function scrollToExplore() {
  const target = document.getElementById("explore");
  if (!target) return;
  target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

function updateFooter() {
  if (els.footerYear) els.footerYear.textContent = String(new Date().getFullYear());
}

function setupHeaderScroll() {
  const update = () => {
    els.header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

function surpriseMe() {
  const strongPicks = dishes.filter((dish) => dish.score >= 74);
  const pool = strongPicks.length ? strongPicks : dishes;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick) openDishDetail(pick.id);
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

function bindEvents() {
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    scrollToExplore();
  });

  els.searchInput.addEventListener("input", () => {
    state.q = els.searchInput.value;
    updateSearchAffordances();
    renderResults();
  });

  els.searchClear.addEventListener("click", () => {
    state.q = "";
    els.searchInput.value = "";
    updateSearchAffordances();
    renderResults();
    els.searchInput.focus();
  });

  els.cityFilter.addEventListener("change", () => {
    state.city = els.cityFilter.value;
    syncFilterControls();
    renderResults();
  });

  els.cuisineFilter.addEventListener("change", () => {
    state.cuisine = els.cuisineFilter.value;
    syncFilterControls();
    renderResults();
  });

  els.maxCalories.addEventListener("input", () => {
    state.maxCal = Number(els.maxCalories.value);
    els.maxCaloriesOutput.textContent = state.maxCal >= 900 ? "Any" : `${state.maxCal} kcal`;
    updateFilterCount();
    renderResults();
  });

  els.minProtein.addEventListener("input", () => {
    state.minProtein = Number(els.minProtein.value);
    els.minProteinOutput.textContent = state.minProtein > 0 ? `${state.minProtein} g+` : "Any";
    updateFilterCount();
    renderResults();
  });

  els.highScore.addEventListener("change", () => {
    state.highScore = els.highScore.checked;
    updateFilterCount();
    renderResults();
  });

  els.dietFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-diet]");
    if (!button) return;
    toggleDiet(button.dataset.diet);
    syncFilterControls();
    renderResults();
  });

  els.quickChips.forEach((chip) => {
    chip.addEventListener("click", () => applyQuickFilter(chip.dataset.quick));
  });

  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view === "dishes" ? "dishes" : "places";
      syncFilterControls();
      renderResults();
    });
  });

  els.activeFilters.addEventListener("click", (event) => {
    if (event.target.closest("[data-clear-filters]")) {
      resetFilters({ closeDrawer: false });
      return;
    }

    const removeButton = event.target.closest("[data-filter-remove]");
    if (!removeButton) return;
    removeFilter(removeButton.dataset.filterRemove, removeButton.dataset.filterValue);
  });

  els.sortSelect.addEventListener("change", handleSortChange);
  els.nearMe.addEventListener("click", handleNearMe);

  els.openFilters.addEventListener("click", openFilters);
  els.closeFilters.addEventListener("click", () => closeFilters());
  els.filtersBackdrop.addEventListener("click", () => closeFilters());
  els.applyFilters.addEventListener("click", () => closeFilters());
  els.resetFilters.addEventListener("click", () => resetFilters());
  els.emptyReset.addEventListener("click", () => resetFilters({ closeDrawer: false }));

  els.openMealTop.addEventListener("click", openMeal);
  els.openMealFab.addEventListener("click", openMeal);

  els.surpriseButton.addEventListener("click", surpriseMe);

  els.mealContent.addEventListener("click", (event) => {
    const addMore = event.target.closest("[data-meal-add-more]");
    if (addMore) {
      els.mealDialog.close();
      scrollToExplore();
      return;
    }

    if (event.target.closest("[data-meal-clear]")) {
      clearMeal();
      return;
    }

    const actionButton = event.target.closest("[data-meal-action]");
    if (!actionButton) return;

    const dishId = actionButton.dataset.mealId;
    const action = actionButton.dataset.mealAction;

    if (action === "inc") adjustMealQuantity(dishId, 1);
    else if (action === "dec") adjustMealQuantity(dishId, -1);
    else if (action === "remove") removeMealItem(dishId);
  });

  els.mealContent.addEventListener("change", (event) => {
    if (event.target.id !== "meal-target") return;
    const nextTarget = Number(event.target.value);
    if (!TARGETS.includes(nextTarget)) return;
    mealTarget = nextTarget;
    saveMealTarget();
    renderMeal();
  });

  els.toastClose.addEventListener("click", hideToast);
  els.toastAction.addEventListener("click", () => {
    const action = toastActionHandler;
    hideToast();
    if (typeof action === "function") action();
  });

  $$("dialog.modal").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", syncModalLock);
  });

  document.addEventListener("click", handleGlobalClick);

  document.addEventListener("keydown", (event) => {
    const dialogOpen = Boolean(document.querySelector("dialog[open]"));

    if (document.body.classList.contains("filters-open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFilters();
        return;
      }
      trapFocus(event, els.filtersPanel);
      return;
    }

    if (dialogOpen) return;

    const target = event.target;
    const inField =
      target instanceof Element &&
      Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
      return;
    }

    if (event.key === "/" && !inField) {
      event.preventDefault();
      els.searchInput.focus();
    }
  });

  mobileFilterQuery.addEventListener("change", (event) => {
    if (!event.matches && document.body.classList.contains("filters-open")) {
      closeFilters({ restoreFocus: false });
    }
  });
}

function handleGlobalClick(event) {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    closeButton.closest("dialog")?.close();
    return;
  }

  const addButton = event.target.closest("[data-add-dish]");
  if (addButton) {
    event.preventDefault();
    addDishToMeal(addButton.dataset.addDish, addButton);
    return;
  }

  const dishButton = event.target.closest("[data-open-dish]");
  if (dishButton) {
    event.preventDefault();
    openDishDetail(dishButton.dataset.openDish);
    return;
  }

  const placeButton = event.target.closest("[data-open-place]");
  if (placeButton) {
    event.preventDefault();
    openPlaceDetail(placeButton.dataset.openPlace);
    return;
  }

  const scrollButton = event.target.closest("[data-scroll-to]");
  if (scrollButton) {
    event.preventDefault();
    const target = document.getElementById(scrollButton.dataset.scrollTo);
    target?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    return;
  }

  const aboutButton = event.target.closest("[data-open-about]");
  if (aboutButton) {
    event.preventDefault();
    if (!els.aboutDialog.open) openDialog(els.aboutDialog);
    return;
  }

  const mealButton = event.target.closest("[data-open-meal]");
  if (mealButton) {
    event.preventDefault();
    openMeal();
  }
}

init();
