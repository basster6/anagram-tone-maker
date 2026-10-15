"""
Rebuild the block reference by asking the device about every block it has.

The catalogue is written in two tiers, because one Anagram is not another:

  blocks-factory.json  the stock blocks, the same on every device at a given
                       firmware, safe to share
  blocks-user.json     blocks the owner installed from the marketplace, which
                       are specific to that device and to what they paid for

A tone designed only from the factory tier works on anybody's pedal. The user
tier is generated locally and is nobody else's business.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

# port.flags is a bitfield; these are the bits we have identified
AUDIO, CONTROL, OUTPUT, SIDECHAIN = 1, 2, 4, 8
TOGGLED, INTEGER, ENUMERATION, LOGARITHMIC = 16, 32, 64, 128

# port.designation
ROLES = {1: "bypass", 2: "hostTempo", 3: "reset", 4: "quickpotDefault"}

# category is a numeric sub-category; these map onto the six families the UI shows
CATEGORIES = {
    1: "Delays & Reverbs", 29: "Delays & Reverbs",
    2: "Overdrive & Distortion",
    5: "Amp & Cabs", 30: "Amp & Cabs",
    6: "EQs, Filters & Dynamics", 9: "EQs, Filters & Dynamics", 11: "EQs, Filters & Dynamics",
    25: "Modulation & Pitch", 26: "Modulation & Pitch", 27: "Modulation & Pitch",
    33: "Utilities", 34: "Utilities",
}
FAMILY_ORDER = [
    "Amp & Cabs", "Overdrive & Distortion", "EQs, Filters & Dynamics",
    "Modulation & Pitch", "Delays & Reverbs", "Utilities",
]


def describe(info: dict) -> dict:
    """Condense one get_plugin_info reply into what a tone designer needs."""
    params = []
    for port in info.get("ports", []):
        flags = port.get("flags", 0)
        if not flags & CONTROL or flags & OUTPUT or port["symbol"].startswith("lv2_"):
            continue
        entry = {
            "symbol": port["symbol"], "name": port["name"],
            "min": port["min"], "max": port["max"], "def": port["def"],
        }
        if port.get("unit"):
            entry["unit"] = port["unit"]
        if flags & TOGGLED:
            entry["toggle"] = True
        elif flags & ENUMERATION:
            entry["options"] = [p["label"] for p in port.get("scalePoints", [])]
        elif flags & INTEGER:
            entry["integer"] = True
        if flags & LOGARITHMIC:
            entry["log"] = True
        if ROLES.get(port.get("designation")):
            entry["role"] = ROLES[port["designation"]]
        params.append(entry)
    return {
        "name": info["name"],
        "abbr": info.get("abbreviation", ""),
        "category": CATEGORIES.get(info.get("category"), "Utilities"),
        "categoryCode": info.get("category"),
        "params": params,
    }


def _range_text(p: dict) -> str:
    if p.get("toggle"):
        return "(toggle)"
    if p.get("options"):
        return "[" + " | ".join(p["options"]) + "]"
    return f"{p['min']:g}..{p['max']:g}" + ("~" if p.get("log") else "")


def catalog_markdown(blocks: dict, title: str, preamble: str) -> str:
    total_params = sum(len(b["params"]) for b in blocks.values())
    out = [
        f"# {title}", "",
        preamble, "",
        f"{len(blocks)} blocks, {total_params} parameters.", "",
        "`sym min..max` is a range, `[a | b]` an enumeration, `(toggle)` on/off, "
        "`~` logarithmic.", "",
    ]
    groups: dict[str, list] = {}
    for uri, spec in blocks.items():
        groups.setdefault(spec["category"], []).append((uri, spec))
    for family in FAMILY_ORDER:
        items = sorted(groups.get(family, []), key=lambda kv: kv[1]["name"])
        if not items:
            continue
        out.append(f"## {family}  ({len(items)})")
        out.append("")
        for uri, spec in items:
            out.append(f"### {spec['name']}  `{spec['abbr']}`")
            out.append(f"`{uri}`")
            out.append("")
            if not spec["params"]:
                out.append("_No user parameters; the device fills them in when the "
                           "block is placed._")
                out.append("")
                continue
            for p in spec["params"]:
                bits = [f"- `{p['symbol']}` {_range_text(p)} default {p['def']:g}"]
                if p.get("unit"):
                    bits.append(p["unit"])
                if p["name"] != p["symbol"]:
                    bits.append(f"— {p['name']}")
                if p.get("role"):
                    bits.append(f"*{p['role']}*")
                out.append("  ".join(bits))
            out.append("")
    return "\n".join(out)


def build(device, reference_dir: Path) -> dict[str, int]:
    """Read every block off the device and write both tiers. Returns the counts."""
    reference_dir.mkdir(parents=True, exist_ok=True)
    firmware = device.firmware()["version"].strip()
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    tiers = {"factory": device.plugins("FACTORY"), "user": device.plugins("USER")}
    counts = {}

    for tier, plugins in tiers.items():
        blocks = {}
        for plugin in plugins:
            try:
                blocks[plugin["uri"]] = describe(device.block_info(plugin["uri"]))
            except Exception:
                continue
        payload = {
            "generatedAt": stamp, "firmware": firmware, "tier": tier,
            "source": "device, get_plugin_info {uri}", "blocks": blocks,
        }
        (reference_dir / f"blocks-{tier}.json").write_text(json.dumps(payload))

        if tier == "factory":
            title = "Anagram factory block catalog"
            preamble = (
                f"The stock blocks of an Anagram on firmware {firmware}, read from the "
                "device itself. Every Anagram on this firmware has these, so a tone "
                "built only from them works on anybody's pedal."
            )
        else:
            title = "Installed block catalog (this device)"
            preamble = (
                f"Blocks installed on this particular Anagram beyond the stock set "
                f"(firmware {firmware}). Another owner will have a different list, so "
                "only reach for these when designing for this device."
            )
        (reference_dir / f"blocks-{tier}-catalog.md").write_text(
            catalog_markdown(blocks, title, preamble)
        )
        counts[tier] = len(blocks)
    return counts
