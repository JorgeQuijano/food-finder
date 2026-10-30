import { PHOTO_VERSION, dishPhotos } from "./dish-photos.js";

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

export function hasDishPhoto(dish) {
  return Boolean(dish && dishPhotos[dish.id]);
}

export function dishPhoto(dish) {
  return dishPhotos[dish?.id] || null;
}

/**
 * Render a compact dish image, or the existing emoji when a photo is missing.
 *
 * The wrapper keeps the surface's own class (emoji-tile, menu-row-emoji, …)
 * so each thumbnail keeps its existing size and border radius. The photo
 * simply fills that box. alt is empty because the dish name is always next to
 * the image in this UI; the fallback is marked decorative.
 */
export function dishMediaHtml(
  dish,
  { className = "", eager = false, alt = "" } = {},
) {
  const photo = dishPhoto(dish);
  const classes = ["dish-media", className, photo ? "has-photo" : "is-fallback"]
    .filter(Boolean)
    .join(" ");

  if (!photo) {
    return `<span class="${escapeHTML(classes)}" aria-hidden="true">${escapeHTML(dish?.emoji || "🍽️")}</span>`;
  }

  const version = PHOTO_VERSION ? `?v=${encodeURIComponent(PHOTO_VERSION)}` : "";
  const loading = eager ? "eager" : "lazy";
  const priority = eager ? ' fetchpriority="high"' : "";

  return `<span class="${escapeHTML(classes)}" data-dish-media data-emoji="${escapeHTML(dish.emoji)}">
    <img
      src="${escapeHTML(photo.src)}${version}"
      width="${photo.width}"
      height="${photo.height}"
      alt="${escapeHTML(alt)}"
      loading="${loading}"
      decoding="async"${priority}
      data-dish-photo
    >
  </span>`;
}

// Image failures should never leave a broken-image icon in the guide.
if (typeof document !== "undefined") {
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.matches("[data-dish-photo]")) {
        return;
      }

      const wrapper = image.closest(".dish-media");
      if (!wrapper) return;

      wrapper.classList.remove("has-photo");
      wrapper.classList.add("is-fallback");
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.closest(".pick-media")?.classList.remove("has-photo");

      const fallback = document.createElement("span");
      fallback.textContent = wrapper.dataset.emoji || "🍽️";
      wrapper.replaceChildren(fallback);
    },
    true,
  );
}
