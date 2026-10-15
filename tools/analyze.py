"""
Build a profile of one player's Anagram: what they own, what they actually use,
and the values they reach for.

The tone designer reads the result so its suggestions fit this player rather
than the factory presets. Nothing here leaves the machine.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

FAMILY_ORDER = [
    "Amp & Cabs", "Overdrive & Distortion", "EQs, Filters & Dynamics",
    "Modulation & Pitch", "Delays & Reverbs", "Utilities",
]
STRUCTURAL = {
    "urn:darkglass-anagram:split", "urn:darkglass-anagram:merge",
    "urn:darkglass-anagram:output", "urn:darkglass-anagram:send",
    "urn:darkglass-anagram:return", "urn:darkglass-anagram:fxloop",
}


def _load_tier(reference_dir: Path, tier: str) -> dict:
    path = reference_dir / f"blocks-{tier}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("blocks", {})


def collect(presets: list[dict], reference_dir: Path) -> dict:
    """presets: [{"filename":..., "document":...}]"""
    factory = _load_tier(reference_dir, "factory")
    user = _load_tier(reference_dir, "user")
    catalog = {**factory, **user}

    usage: Counter[str] = Counter()
    values: dict[tuple[str, str], list[float]] = defaultdict(list)
    first_block: Counter[str] = Counter()
    last_block: Counter[str] = Counter()
    chain_lengths: list[int] = []
    two_row = 0
    with_scenes = 0
    actuators: Counter[str] = Counter()
    outputs: Counter[str] = Counter()
    properties: Counter[str] = Counter()

    for item in presets:
        preset = (item["document"] or {}).get("preset") or {}
        chains = preset.get("chains") or {}
        if "2" in chains:
            two_row += 1

        total = 0
        ordered: list[str] = []
        for row_key in sorted(chains, key=int):
            blocks = (chains[row_key] or {}).get("blocks") or {}
            for slot in sorted(blocks, key=int):
                block = blocks[slot]
                uri = block.get("uri", "")
                usage[uri] += 1
                total += 1
                if row_key == "1":
                    ordered.append(uri)
                for param in (block.get("parameters") or {}).values():
                    if isinstance(param.get("value"), (int, float)):
                        values[(uri, param["symbol"])].append(float(param["value"]))
                for prop in (block.get("properties") or {}).values():
                    if prop.get("value"):
                        properties[str(prop["value"]).rsplit("/", 1)[-1]] += 1
                if any(s.get("parameters") or "enabled" in s
                       for s in (block.get("scenes") or {}).values()):
                    with_scenes += 1
                if uri == "urn:darkglass-anagram:output":
                    for param in (block.get("parameters") or {}).values():
                        if param.get("value"):
                            outputs[param["symbol"]] += 1
        chain_lengths.append(total)
        musical = [u for u in ordered if u not in STRUCTURAL]
        if musical:
            first_block[musical[0]] += 1
            last_block[musical[-1]] += 1

        for key, binding in (preset.get("bindings") or {}).items():
            if binding.get("parameters"):
                actuators[key] += 1

    owned_user = set(user)
    unused_paid = sorted(owned_user - set(usage))

    return {
        "presetCount": len(presets),
        "catalog": catalog,
        "tiers": {"factory": len(factory), "user": len(user)},
        "usage": usage,
        "values": values,
        "firstBlock": first_block,
        "lastBlock": last_block,
        "chainLengths": chain_lengths,
        "twoRow": two_row,
        "blocksWithScenes": with_scenes,
        "actuators": actuators,
        "outputs": outputs,
        "properties": properties,
        "unusedPaid": unused_paid,
    }


def _name(uri: str, catalog: dict) -> str:
    spec = catalog.get(uri) or catalog.get(uri.split("#")[0])
    return spec["name"] if spec else uri.rsplit(":", 1)[-1]


def _family(uri: str, catalog: dict) -> str:
    spec = catalog.get(uri) or catalog.get(uri.split("#")[0])
    return spec["category"] if spec else "Unknown"


def to_markdown(p: dict, firmware: str = "") -> str:
    cat = p["catalog"]
    lines = [
        "# This player's Anagram", "",
        "Built from the blocks installed on the device and every preset stored on it. "
        "Use it to pitch new tones at how this person actually plays, and prefer the "
        "blocks and value ranges they already live in.", "",
    ]
    if firmware:
        lines += [f"Firmware {firmware}.", ""]
    lines += [
        f"- **{p['tiers']['factory']}** stock blocks, **{p['tiers']['user']}** installed on top",
        f"- **{p['presetCount']}** presets stored",
    ]
    if p["chainLengths"]:
        lines.append(
            f"- chains run {min(p['chainLengths'])}-{max(p['chainLengths'])} blocks, "
            f"typically {round(statistics.median(p['chainLengths']))}"
        )
    lines += [
        f"- **{p['twoRow']}** presets use the parallel second row",
        f"- **{p['blocksWithScenes']}** blocks carry scene changes",
        "",
    ]

    if p["actuators"]:
        used = ", ".join(f"`{k}` x{v}" for k, v in p["actuators"].most_common())
        lines += ["## Hardware they bind", "", used, ""]
    if p["outputs"]:
        lines += ["## Outputs they enable", "",
                  ", ".join(f"`{k}` x{v}" for k, v in p["outputs"].most_common()), ""]

    lines += ["## Blocks they reach for", ""]
    by_family: dict[str, list] = defaultdict(list)
    for uri, n in p["usage"].items():
        by_family[_family(uri, cat)].append((uri, n))
    for family in FAMILY_ORDER + ["Unknown"]:
        items = sorted(by_family.get(family, []), key=lambda kv: -kv[1])
        if not items:
            continue
        lines.append(f"**{family}** — " + ", ".join(
            f"{_name(uri, cat)} x{n}" for uri, n in items))
        lines.append("")

    if p["firstBlock"] or p["lastBlock"]:
        lines += ["## Where the chain starts and ends", ""]
        if p["firstBlock"]:
            lines.append("- opens with: " + ", ".join(
                f"{_name(u, cat)} x{n}" for u, n in p["firstBlock"].most_common(5)))
        if p["lastBlock"]:
            lines.append("- closes with: " + ", ".join(
                f"{_name(u, cat)} x{n}" for u, n in p["lastBlock"].most_common(5)))
        lines.append("")

    # the interesting part: where their taste sits against the factory default
    rows = []
    for (uri, symbol), vals in sorted(p["values"].items()):
        if len(vals) < 3:
            continue
        spec = cat.get(uri) or cat.get(uri.split("#")[0])
        param = next((x for x in spec["params"] if x["symbol"] == symbol), None) if spec else None
        if not param or param.get("toggle") or param.get("options"):
            continue
        median = statistics.median(vals)
        default = param["def"]
        span = param["max"] - param["min"] or 1
        drift = (median - default) / span
        rows.append((abs(drift), _name(uri, cat), symbol, median, default,
                     min(vals), max(vals), param.get("unit", ""), len(vals)))
    if rows:
        rows.sort(reverse=True)
        lines += [
            "## Their settings against the factory defaults", "",
            "Parameters they set furthest from the default, so these are taste rather "
            "than accident. Match these when designing for them.", "",
            "| block | parameter | they use | default | their range | n |",
            "|---|---|---|---|---|---|",
        ]
        for _, name, symbol, median, default, lo, hi, unit, n in rows[:25]:
            u = f" {unit}" if unit else ""
            lines.append(
                f"| {name} | `{symbol}` | **{median:g}{u}** | {default:g}{u} "
                f"| {lo:g}–{hi:g} | {n} |"
            )
        lines.append("")

    if p["properties"]:
        lines += ["## Cabinet and model files in use", "",
                  "Reuse these paths rather than inventing one.", ""]
        for filename, n in p["properties"].most_common(12):
            lines.append(f"- `{filename}` x{n}")
        lines.append("")

    if p["unusedPaid"]:
        lines += [
            "## Installed but never used", "",
            "They own these and no preset touches them. Worth offering.", "",
        ]
        for uri in p["unusedPaid"]:
            lines.append(f"- {_name(uri, cat)}  `{uri}`")
        lines.append("")

    return "\n".join(lines)
