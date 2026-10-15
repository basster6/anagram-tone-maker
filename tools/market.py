"""
Look up what a block actually is, from the Anagram marketplace.

The device tells you a block's name and parameters but never says what it
emulates or what it is for. The marketplace does, and the join key is the
Shopify variant SKU, which holds the plugin URI.

Descriptions belong to their vendors, so this fetches on demand and caches
locally rather than shipping anything. Factory blocks are not sold, so they do
not appear here.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

CATALOG = "https://api-v2.darkglass.com/shopify/products"
CACHE = Path(__file__).resolve().parent.parent / "reference" / ".market-cache.json"
MAX_AGE = 7 * 24 * 3600


class MarketError(RuntimeError):
    pass


def _fetch_all(page_size: int = 50, pages: int = 20) -> dict:
    """Walk the catalogue and index every product by the plugin URI in its SKU."""
    by_uri: dict[str, dict] = {}
    for page in range(1, pages + 1):
        url = f"{CATALOG}?page={page}&pageSize={page_size}"
        try:
            with urllib.request.urlopen(url, timeout=25) as response:
                body = json.load(response)["data"]
        except (urllib.error.URLError, KeyError, json.JSONDecodeError) as exc:
            raise MarketError(f"Could not read the marketplace: {exc}") from exc
        for edge in body.get("edges") or []:
            node = edge.get("node") or {}
            for variant in (node.get("variants") or {}).get("edges") or []:
                sku = ((variant.get("node") or {}).get("sku") or "").strip()
                if sku:
                    by_uri[sku] = {
                        "title": node.get("title"),
                        "vendor": node.get("vendor"),
                        "productType": node.get("productType"),
                        "tags": node.get("tags") or [],
                        "description": node.get("description"),
                    }
        if page >= body.get("totalPages", 1):
            break
        time.sleep(0.2)
    return by_uri


def catalogue(refresh: bool = False) -> dict:
    """The marketplace index, from a cache no older than a week."""
    if not refresh and CACHE.exists() and time.time() - CACHE.stat().st_mtime < MAX_AGE:
        try:
            return json.loads(CACHE.read_text())
        except json.JSONDecodeError:
            pass
    index = _fetch_all()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(index))
    return index


def describe(uri: str, refresh: bool = False) -> dict | None:
    """What this block is, or None for a factory block the shop does not sell."""
    index = catalogue(refresh)
    return index.get(uri) or index.get(uri.split("#")[0])
