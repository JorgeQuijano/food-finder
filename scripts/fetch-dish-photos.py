#!/usr/bin/env python3
"""Build the dish-photo assets and manifest.

Photos are representative, not official restaurant photography. The default
library is sourced from Wikimedia Commons and restricted to CC0/public-domain
files. Add a real photo for any dish by dropping it at:

    photo-sources/<menu>/<dish-key>.(jpg|jpeg|png|webp)

and re-running this script. Those local overrides win over the category image.

Usage:
    python3 scripts/fetch-dish-photos.py
    python3 scripts/fetch-dish-photos.py --force
    python3 scripts/fetch-dish-photos.py --review /tmp/opencode/dish-review.jpg
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = ROOT / "assets" / "dishes"
CATEGORY_DIR = ASSET_DIR / "_categories"
SOURCE_DIR = ROOT / "photo-sources"
MANIFEST_PATH = ROOT / "js" / "dish-photos.js"
CREDITS_PATH = ASSET_DIR / "CREDITS.md"
CACHE_PATH = SOURCE_DIR / "_categories" / "commons.json"

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = (
    "ForkfulHobbyProject/1.0 "
    "(https://jorgequijano.github.io/food-finder/; illustrative dish thumbnails)"
)
TARGET_SIZE = (640, 480)
OUTPUT_WIDTH = 640
OUTPUT_HEIGHT = 480

# One representative photo per dish family. All are CC0/public domain.
CATEGORY_SOURCES = {
    "bowl": "File:Falafel Super Bowl Salad - Leon 2025-10-27.jpg",
    "salad": "File:Green Salad - Flat Iron 2026-02-24.jpg",
    "caesar": "File:Caesar salad with chicken, homemade - Massachusetts.jpg",
    "kale": "File:Salad of mixed greens - Massachusetts.jpg",
    "beet": "File:Beet salad - Boston, MA.jpg",
    "wrap": "File:Vegetable Wrap (toasted) - The naan hut 2023-12-22.jpg",
    "burrito": "File:Burrito grande with chicken etc. - Massachusetts.jpg",
    "sandwich": "File:Turkey club sandwich and potato chips - Cambridge, MA.jpg",
    "breakfast_sandwich": "File:Bacon & egg sandwich - Monty's 2026-02-19.jpg",
    "vegan_sandwich": "File:B-right-on (vegan) sandwich - Social Board 2025-04-01.jpg",
    "burger": "File:NCI Visuals Food Hamburger.jpg",
    "pizza": "File:Pizza ( Italian Food).jpg",
    "pasta": "File:Pasta alla Norma - Wiki Loves Sicilia.jpg",
    "noodles": "File:Noodle soup in Asia Bowl 2025-07-26.jpg",
    "ramen": "File:Butter Corn Ramen.JPG",
    "pho": "File:Pho with steak with garlic - Pho 2025-07-25.jpg",
    "udon": "File:Seafood Yaki Udon - Taro 2025-10-24.jpg",
    "sushi": "File:Eight Different Types of Sushi.jpg",
    "sashimi": "File:Sashimi, seaweed, salad, and rice - San Francisco.jpg",
    "poke": "File:Poke bowl - Cambridge, MA.jpg",
    "taco": "File:Valentines's Day is for Shrimp Tacos!.jpg",
    "quesadilla": "File:Chicken quesadilla - Massachusetts.jpg",
    "guacamole": "File:Chips, guacamole, and salsa - Massachusetts.jpg",
    "shawarma": "File:Chicken Shawarma Platter - Lavash 2025-02-10.jpg",
    "falafel": "File:Falafel - Sheppy's 2025-07-27.jpg",
    "hummus": "File:Houmous.jpg",
    "tabbouleh": "File:Armenian tabbouleh in France (March 2020).jpg",
    "curry": "File:Mixed Veggies Matsaman Curry rice - Tookta's Thai Food.jpg",
    "soup": "File:Lentil Soup - Schnitzel & Co. 2026-05-16.jpg",
    "chili": "File:Chili con carne 50 A.jpg",
    "pancakes": "File:Foodiesfeed.com pouring-honey-on-pancakes-with-walnuts.jpg",
    "french_toast": "File:Fruity French Toast - Muffin Break 2026-06-16.jpg",
    "avocado_toast": "File:Avocado on Toast - Cadence Clubhouse, Newhaven Fort 2025-05-06.jpg",
    "omelette": "File:Mushroom Omelette - Breakfast At Tiffany's Brighton.jpg",
    "eggs_benedict": "File:Eggs Benedict - the M&S Café.jpg",
    "oats": "File:Oatmeal (1).jpg",
    "granola": "File:Granola and yogurt - Bubbles + Brunch 2018 - Sarah Stierch 02.jpg",
    "smoothie": "File:Kiwi Smoothie.jpg",
    "smoothie_bowl": "File:Acai Smoothie Bowls (Unsplash).jpg",
    "fruit": "File:Fruit Salad in Velachery food street.jpg",
    "steak": "File:Ribeye steak, chips, béarnaise sauce.jpg",
    "fish": "File:Grilled salmon and asparagus on rice - Boston, Massachusetts.jpg",
    "seafood": "File:Grilled fish at restaurant in Tokyo.jpg",
    "chicken": "File:Chicken piccata, mushroom ravioli, and two sweets - Boston, MA.jpg",
    "fries": "File:French fries 🍟.jpg",
    "spring_rolls": "File:Spring rolls at Bong Srey Mith Laor.jpg",
    "dumplings": "File:Dumplings on a blue plate.jpg",
    "stir_fry": "File:Stir Fried Watercress.jpg",
    "breakfast": "File:Fiesta Breakfast Bowl - 50302457216.jpg",
    "salmon_bowl": "File:Salmon bowl of Nakau.jpg",
}

BLACKLIST_TITLE_WORDS = (
    "logo",
    "map",
    "diagram",
    "poster",
    "book",
    "menu",
    "sign",
    "museum",
    "painting",
    "drawing",
    "illustration",
    "sculpture",
    "portrait",
    "still life",
)


def http_json(params: dict[str, str], attempts: int = 5) -> dict:
    params = {**params, "action": "query", "format": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
            )
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            wait = 10 * (attempt + 1)
            print(f"  Wikimedia rate limit; waiting {wait}s…", file=sys.stderr)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == attempts - 1:
                raise
            wait = 4 * (attempt + 1)
            print(f"  Network error ({error}); retrying in {wait}s…", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("Wikimedia API did not respond")


def fetch_image_info(titles: list[str]) -> dict[str, dict]:
    """Fetch URL, license and credit metadata for up to 50 file titles."""
    pages: dict[str, dict] = {}
    for chunk_start in range(0, len(titles), 40):
        chunk = titles[chunk_start : chunk_start + 40]
        data = http_json(
            {
                "titles": "|".join(chunk),
                "prop": "imageinfo",
                "iiprop": "url|mime|size|extmetadata",
                "iiurlwidth": "960",
            }
        )
        for page in data.get("query", {}).get("pages", {}).values():
            image_info = (page.get("imageinfo") or [{}])[0]
            metadata = image_info.get("extmetadata", {})
            pages[page.get("title", "")] = {
                "title": page.get("title", ""),
                "mime": image_info.get("mime", ""),
                "width": image_info.get("width", 0),
                "height": image_info.get("height", 0),
                "thumb": image_info.get("thumburl", ""),
                "url": image_info.get("url", ""),
                "descriptionurl": image_info.get("descriptionurl", ""),
                "license": metadata.get("LicenseShortName", {}).get("value", ""),
                "artist": strip_html(metadata.get("Artist", {}).get("value", "")),
                "credit": strip_html(metadata.get("Credit", {}).get("value", "")),
            }
        time.sleep(1.5)
    return pages


def strip_html(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", value).strip()


def download(url: str, attempts: int = 4) -> bytes:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "image/avif,image/webp,image/png,image/jpeg",
                },
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            if attempt == attempts - 1:
                raise
            wait = 3 * (attempt + 1)
            print(f"  Download failed ({error}); retrying in {wait}s…", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("download failed")


def load_dishes() -> list[dict]:
    script = (
        "import { dishes } from './js/data.js';"
        "console.log(JSON.stringify(dishes.map((d) => ({"
        "id:d.id,name:d.name,description:d.description,tags:d.tags,emoji:d.emoji,"
        "menu:d.menu,key:d.key"
        "}))));"
    )
    output = subprocess.check_output(
        ["node", "--input-type=module", "-e", script], cwd=ROOT, text=True
    )
    return json.loads(output)


def classify(dish: dict) -> str:
    """Map a dish to a representative photo family.

    Names win over descriptions so a salad that happens to mention beets does
    not get the beet photo, and a chicken Caesar wrap stays a wrap.
    """
    name = dish["name"].lower()
    text = f"{name} {dish['description']} {' '.join(dish.get('tags', []))}".lower()

    # Breakfast, drinks and sweet bowls
    if "smoothie bowl" in name or "açaí" in name or "acai" in name:
        return "smoothie_bowl"
    if "smoothie" in name:
        return "smoothie"
    if "overnight oats" in name or "oatmeal" in name:
        return "oats"
    if "granola" in name or "chia pudding" in name:
        return "granola"
    if "avocado toast" in name:
        return "avocado_toast"
    if "pancake" in name:
        return "pancakes"
    if "french toast" in name:
        return "french_toast"
    if "omelette" in name:
        return "omelette"
    if "benedict" in name:
        return "eggs_benedict"
    if "fruit salad" in name:
        return "fruit"
    if "breakfast burrito" in name:
        return "burrito"
    if "breakfast sandwich" in name or ("bacon" in name and "egg" in name and "sandwich" in name):
        return "breakfast_sandwich"
    if "breakfast" in name or "egg cloud" in name:
        return "breakfast"

    # Fast food and Italian
    if "burger" in name:
        return "burger"
    if "pizza" in name:
        return "pizza"
    if "parmigiana" in name or "vegan mac" in name:
        return "pasta"

    # Noodles and rolls
    if "fresh rolls" in name or "spring rolls" in name:
        return "spring_rolls"
    if "ramen" in name:
        return "ramen"
    if "pho" in name:
        return "pho"
    if "udon" in name:
        return "udon"
    if "pad thai" in name or "spicy peanut bowl" in name:
        return "noodles"
    if "noodle" in name or "vermicelli" in name:
        return "noodles"

    # Sushi and raw fish
    if "sashimi" in name:
        return "sashimi"
    if "sushi" in name or "california roll" in name or "dynamite roll" in name:
        return "sushi"
    if "poke" in name:
        return "poke"
    if "salmon bowl" in name or "miso salmon" in name:
        return "salmon_bowl"

    # Mexican and Tex-Mex
    if "taco" in name:
        return "taco"
    if "quesadilla" in name:
        return "quesadilla"
    if "guacamole" in name:
        return "guacamole"
    if "street corn" in name or "elote" in name:
        return "taco"
    if "burrito bowl" in name:
        return "bowl"
    if "burrito" in name:
        return "burrito"

    # Middle Eastern and Indian
    if any(
        word in name
        for word in ("shawarma", "tawook", "souvlaki", "gyro", "kebab", "kofta", "mixed grill")
    ):
        return "shawarma"
    if "falafel" in name:
        return "falafel"
    if "hummus" in name:
        return "hummus"
    if "tabbouleh" in name or "mujadara" in name or "fattoush" in name:
        return "tabbouleh"
    if any(word in name for word in ("curry", "tikka", "masala", "dal ", "tadka", "biryani")):
        return "curry"

    # Soups and stews
    if "chili" in name:
        return "chili"
    if "congee" in name or "soup" in name:
        return "soup"

    # Hand-held dishes win over salads they may mention in their names.
    if "wrap" in name:
        return "wrap"

    # Salads. These come before the generic chicken rule so a chicken salad
    # stays a salad.
    if "beet" in name and "salad" in name:
        return "beet"
    if "beet bowl" in name:
        return "beet"
    if "kale" in name:
        return "kale"
    if "caesar" in name:
        return "caesar"
    if "salad" in name:
        return "salad"

    # Hand-held and bowls
    if any(word in name for word in ("tempeh", "reuben", "chickpea melt")):
        return "vegan_sandwich"
    if any(word in name for word in ("sandwich", "reuben", "club", "melt")):
        return "sandwich"
    if "stir fry" in name or "garlic chinese greens" in name or "miso glazed eggplant" in name:
        return "stir_fry"
    if "fries" in name:
        return "fries"
    if "dumpling" in name:
        return "dumplings"
    if "bowl" in name or "buddha" in name or "grain" in name or "quinoa" in name:
        return "bowl"

    # Meat and fish plates
    if any(word in name for word in ("steak", "tenderloin", "beef bites")):
        return "steak"
    if "trout" in name or "salmon" in name or "fish" in name:
        return "fish"
    if "chicken" in name or "pollo" in name:
        return "chicken"

    # Description fallback for the remaining dishes
    if "bowl" in text:
        return "bowl"
    if "salad" in text:
        return "salad"
    if "sandwich" in text or "wrap" in text:
        return "sandwich"
    if "fish" in text or "seafood" in text:
        return "seafood"
    return "bowl"


def fit_and_save(source: Image.Image, destination: Path) -> None:
    image = ImageOps.exif_transpose(source)
    image = image.convert("RGB")
    image = ImageOps.fit(
        image,
        TARGET_SIZE,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.45),
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=82, method=6)


def build_category_images(force: bool) -> dict[str, dict]:
    """Download one CC0/PD photo per dish family and return its metadata."""
    CATEGORY_DIR.mkdir(parents=True, exist_ok=True)
    CATEGORY_SOURCES_CACHE = SOURCE_DIR / "_categories"
    CATEGORY_SOURCES_CACHE.mkdir(parents=True, exist_ok=True)

    titles = list(CATEGORY_SOURCES.values())
    metadata = fetch_image_info(titles)
    if not metadata:
        raise RuntimeError("Wikimedia returned no image metadata")

    results: dict[str, dict] = {}
    for index, (category, title) in enumerate(CATEGORY_SOURCES.items(), start=1):
        info = metadata.get(title)
        if not info:
            print(f"  ! missing metadata for {title}", file=sys.stderr)
            continue
        if info["license"] not in ("CC0", "Public domain", "PDM"):
            print(
                f"  ! skipping {category}: {info['license']} is not CC0/public domain",
                file=sys.stderr,
            )
            continue
        if any(word in info["title"].lower() for word in BLACKLIST_TITLE_WORDS):
            print(f"  ! skipping {category}: blacklisted title {info['title']}", file=sys.stderr)
            continue

        destination = CATEGORY_DIR / f"{category}.webp"
        if destination.exists() and not force:
            results[category] = {**info, "path": destination}
            continue

        print(f"  [{index}/{len(CATEGORY_SOURCES)}] {category}: {info['title']}")
        try:
            raw = download(info["thumb"] or info["url"])
            with Image.open(__import__("io").BytesIO(raw)) as image:
                fit_and_save(image, destination)
        except Exception as error:  # keep going; a missing photo falls back to emoji
            print(f"  ! could not process {category}: {error}", file=sys.stderr)
            continue

        results[category] = {**info, "path": destination}
        CACHE_PATH.write_text(
            json.dumps(
                {
                    key: {k: v for k, v in value.items() if k != "path"}
                    for key, value in results.items()
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        time.sleep(0.25)

    return results


def local_override(dish: dict) -> Path | None:
    folder = SOURCE_DIR / dish["menu"]
    if not folder.is_dir():
        return None
    for extension in (".jpg", ".jpeg", ".png", ".webp"):
        candidate = folder / f"{dish['key']}{extension}"
        if candidate.exists():
            return candidate
    return None


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def asset_version() -> str:
    """Hash the optimized image files so replacing a photo busts caches."""
    digest = hashlib.sha1()
    for path in sorted(ASSET_DIR.rglob("*.webp")):
        digest.update(path.read_bytes())
    return digest.hexdigest()[:10]


def write_manifest(entries: dict[str, dict], version: str | None = None) -> None:
    payload = json.dumps(entries, ensure_ascii=False, sort_keys=True)
    version = version or hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]
    lines = [
        "// Generated by scripts/fetch-dish-photos.py — do not edit by hand.",
        f"export const PHOTO_VERSION = {js_string(version)};",
        "",
        "export const dishPhotos = {",
    ]
    for dish_id in sorted(entries):
        entry = entries[dish_id]
        fields = [
            f"src: {js_string(entry['src'])}",
            f"width: {entry['width']}",
            f"height: {entry['height']}",
            f"category: {js_string(entry['category'])}",
            f"source: {js_string(entry['source'])}",
            f"license: {js_string(entry['license'])}",
            f"credit: {js_string(entry['credit'])}",
            f"sourceUrl: {js_string(entry['sourceUrl'])}",
        ]
        lines.append(f"  {js_string(dish_id)}: {{ {', '.join(fields)} }},")
    lines.append("};")
    MANIFEST_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_credits(categories: dict[str, dict]) -> None:
    lines = [
        "# Dish photo credits",
        "",
        "These photos are representative food images from Wikimedia Commons,",
        "restricted to CC0/public-domain files. They are illustrative and are not",
        "official photos of the restaurant dishes in the guide.",
        "",
        "| Category | Source | License | Credit |",
        "| --- | --- | --- | --- |",
    ]
    for category in sorted(categories):
        info = categories[category]
        title = info.get("title", "")
        url = info.get("descriptionurl", "")
        link = f"[{title}]({url})" if url else title
        credit = info.get("artist", "") or "Wikimedia Commons"
        lines.append(
            f"| {category} | {link} | {info.get('license', '')} | {credit.replace('|', '/')} |"
        )
    lines.append("")
    lines.append(
        "To replace a generic image with a real dish photo, place the file at "
        "`photo-sources/<menu>/<dish-key>.jpg` and run "
        "`python3 scripts/fetch-dish-photos.py`."
    )
    lines.append("")
    CREDITS_PATH.write_text("\n".join(lines), encoding="utf-8")


def make_review(categories: dict[str, dict], destination: Path) -> None:
    items = sorted(categories.items())
    if not items:
        return
    columns = 5
    cell_width, cell_height = 200, 170
    rows = (len(items) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "#f6f2e8")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:
        font = ImageFont.load_default()

    for index, (category, info) in enumerate(items):
        path = info.get("path")
        if not path or not Path(path).exists():
            continue
        with Image.open(path) as image:
            thumb = ImageOps.fit(
                image.convert("RGB"),
                (cell_width - 20, 120),
                method=Image.Resampling.LANCZOS,
            )
        x = (index % columns) * cell_width + 10
        y = (index // columns) * cell_height + 10
        sheet.paste(thumb, (x, y))
        draw.text((x, y + 126), category, fill="#17261c", font=font)

    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=88)
    print(f"Review sheet: {destination}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download category photos")
    parser.add_argument(
        "--review",
        type=Path,
        help="write a contact sheet of category photos to this path",
    )
    args = parser.parse_args()

    dishes = load_dishes()
    print(f"Found {len(dishes)} dishes")

    categories = build_category_images(args.force)
    if not categories:
        raise RuntimeError("No category photos were available")
    print(f"Ready category photos: {len(categories)}")

    entries: dict[str, dict] = {}
    used_categories: dict[str, int] = {}
    override_count = 0
    missing_categories: set[str] = set()

    for dish in dishes:
        category = classify(dish)
        override = local_override(dish)

        if override:
            destination = ASSET_DIR / dish["menu"] / f"{dish['key']}.webp"
            with Image.open(override) as image:
                fit_and_save(image, destination)
            entry = {
                "src": f"assets/dishes/{dish['menu']}/{dish['key']}.webp",
                "width": OUTPUT_WIDTH,
                "height": OUTPUT_HEIGHT,
                "category": "custom",
                "source": override.name,
                "license": "Own photo",
                "credit": "",
                "sourceUrl": "",
            }
            override_count += 1
        else:
            category_info = categories.get(category)
            if not category_info:
                missing_categories.add(category)
                continue
            entry = {
                "src": f"assets/dishes/_categories/{category}.webp",
                "width": OUTPUT_WIDTH,
                "height": OUTPUT_HEIGHT,
                "category": category,
                "source": category_info.get("title", ""),
                "license": category_info.get("license", ""),
                "credit": category_info.get("artist", ""),
                "sourceUrl": category_info.get("descriptionurl", ""),
            }
            used_categories[category] = used_categories.get(category, 0) + 1

        entries[dish["id"]] = entry

    if missing_categories:
        print(
            "Missing category photos (those dishes will fall back to emoji): "
            + ", ".join(sorted(missing_categories)),
            file=sys.stderr,
        )

    write_manifest(entries, asset_version())
    write_credits(categories)

    print(f"Wrote {len(entries)} dish entries ({override_count} custom photos)")
    print("Category usage:")
    for category, count in sorted(used_categories.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {category:16} {count:3} dishes")
    print(f"Manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"Credits:  {CREDITS_PATH.relative_to(ROOT)}")

    if args.review:
        make_review(categories, args.review)

    return 0 if len(entries) == len(dishes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
