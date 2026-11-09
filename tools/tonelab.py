"""
Community detail on marketplace blocks, from Anagram Tone Lab (anagramblocks.com).

The marketplace says what a vendor wants to say about a block. Tone Lab adds
three things it does not: a short "based on" line naming the gear a block models,
the block's controls (names, ranges, defaults, read off a pedal), and player
ratings. The controls matter most: they let a block you do not own be judged by
where its knobs actually sit, before anyone pays for it.

Tone Lab is a community site, not Darkglass. Its "based on" lines are its own
reading of the vendor's description (and, for firmware blocks, its own guess),
so treat them like the TalkBass attributions: a strong hint, credited, not fact.

The site publishes /blocks/{n}.json, but that carries only ratings, so this reads
the HTML: the /blocks/ listing once, to map names to page numbers, then a block's
own page only when asked about it. Both are cached locally for a week. Pages are
matched to marketplace products by name and vendor, because the site does not
show plugin URIs.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

SITE = "https://www.anagramblocks.com"
CACHE = Path(__file__).resolve().parent.parent / "reference" / ".tonelab-cache.json"
MAX_AGE = 7 * 24 * 3600
USER_AGENT = "anagram-tone-maker (block lookup)"


class TonelabError(RuntimeError):
    pass


def _get(path: str) -> str:
    request = urllib.request.Request(SITE + path, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError) as exc:
        raise TonelabError(f"Could not read {SITE}{path}: {exc}") from exc


def _text(fragment: str | None) -> str | None:
    if fragment is None:
        return None
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", text).strip() or None


def _div(card: str, cls: str) -> str | None:
    match = re.search(rf'<div class="{cls}"[^>]*>(.*?)</div>', card, re.S)
    return _text(match.group(1)) if match else None


def _rating(fragment: str) -> tuple[float | None, int]:
    match = re.search(r"([0-9.]+)\s*\((\d+)", fragment or "")
    return (float(match.group(1)), int(match.group(2))) if match else (None, 0)


def _parse_listing(page: str) -> list[dict]:
    blocks = []
    for number, card in re.findall(r'<a href="/blocks/(\d+)" class="block-card">(.*?)</a>', page, re.S):
        based = _div(card, "block-based")
        rating, reviews = _rating(_div(card, "block-rating") or "")
        blocks.append({
            "id": int(number),
            "name": _div(card, "block-name"),
            "vendor": _div(card, "block-vendor"),
            "based_on": re.sub(r"^(Likely )?based on\s*", "", based, flags=re.I) if based else None,
            "instruments": [_text(p) for p in re.findall(r'<span class="inst-pill">(.*?)</span>', card)],
            "price": _div(card, "block-price"),
            "rating": rating,
            "reviews": reviews,
        })
    if not blocks:
        raise TonelabError("The /blocks/ page had no block cards; the site layout may have changed.")
    return blocks


def _parse_block(page: str) -> dict:
    equiv = re.search(r'<div class="hx-equiv">(.*?)</div>', page, re.S)
    based_on, likely = None, False
    if equiv:
        label = re.search(r'<span class="label">(.*?)</span>', equiv.group(1), re.S)
        likely = bool(label and "likely" in label.group(1).lower())
        body = re.sub(r'<div class="based-guess".*', "", equiv.group(1), flags=re.S)
        body = re.sub(r'<span class="(label|hx-tm)".*?</span>', "", body, flags=re.S)
        based_on = _text(body)
    instruments = re.search(r'<div class="inst-tags".*?</div>', page, re.S)
    rating = re.search(r'class="overall-rating[^"]*".*?</a>', page, re.S)
    table = re.search(r'<table class="controls-table">.*?<tbody>(.*?)</tbody>', page, re.S)
    controls = []
    for row in re.findall(r"<tr>(.*?)</tr>", table.group(1) if table else "", re.S):
        cells = [_text(c) or "" for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) >= 4:
            controls.append({"name": cells[0], "type": cells[1], "range": cells[2], "default": cells[3]})
    note = re.search(r'<p class="controls-note">(.*?)</p>', page, re.S)
    average, reviews = _rating(_text(rating.group(0)) if rating else "")
    return {
        "based_on": based_on,
        "based_on_is_guess": likely,
        "instruments": [_text(a) for a in re.findall(r'<a class="inst-pill"[^>]*>(.*?)</a>',
                                                    instruments.group(0) if instruments else "")],
        "rating": average,
        "reviews": reviews,
        "controls": controls,
        "controls_note": _text(note.group(1)) if note else None,
    }


def _load_cache() -> dict:
    try:
        return json.loads(CACHE.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _save_cache(cache: dict) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache))


def _fresh(entry: dict | None) -> bool:
    return bool(entry) and time.time() - entry.get("fetched", 0) < MAX_AGE


def listing(refresh: bool = False) -> list[dict]:
    """Every marketplace block on the site, from one listing page."""
    cache = _load_cache()
    entry = cache.get("listing")
    if refresh or not _fresh(entry):
        entry = {"fetched": time.time(), "blocks": _parse_listing(_get("/blocks/"))}
        cache["listing"] = entry
        _save_cache(cache)
    return entry["blocks"]


def _norm(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def find(title: str, vendor: str | None = None, refresh: bool = False) -> dict | None:
    """The site's listing entry for a marketplace product, matched by name."""
    blocks = listing(refresh)
    want = _norm(title)
    exact = [b for b in blocks if _norm(b["name"]) == want]
    if vendor:
        same_vendor = [b for b in exact if _norm(b["vendor"]) == _norm(vendor)]
        exact = same_vendor or exact
    if exact:
        return exact[0]
    if not vendor:
        return None
    # The site sometimes shortens a name ("Hold it" for "Hold It Infinite Sustain").
    # Only trust that within the same vendor, and take the longest prefix.
    prefixed = [b for b in blocks if _norm(b["vendor"]) == _norm(vendor)
                and _norm(b["name"]) and want.startswith(_norm(b["name"]))]
    return max(prefixed, key=lambda b: len(_norm(b["name"])), default=None)


def details(block_id: int, refresh: bool = False) -> dict:
    """One block's page: based-on, instruments, rating and controls."""
    cache = _load_cache()
    key = f"block:{block_id}"
    entry = cache.get(key)
    if refresh or not _fresh(entry):
        entry = {"fetched": time.time(), **_parse_block(_get(f"/blocks/{block_id}"))}
        cache[key] = entry
        _save_cache(cache)
    return {k: v for k, v in entry.items() if k != "fetched"} | {"url": f"{SITE}/blocks/{block_id}"}
