"""
Check a preset document against the Anagram's preset format.

The rules here were calibrated against every preset read off a real device:
unmodified device presets must produce zero errors. Warnings are for things
that are legal but usually unintended.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable

MAX_ROWS = 2
MAX_SLOTS = 12
SCENES = (1, 2, 3)
ACTUATORS = (
    "pot1", "pot2", "pot3", "pot4", "pot5", "pot6",
    "foot1", "foot2", "foot3", "exp.pedal",
)
FOOTSWITCHES = {"foot1", "foot2", "foot3"}
UUID_RE = re.compile(r"^[0-9a-f]{16}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{24}$")

_REFERENCE_DIR = Path(__file__).resolve().parent.parent / "reference"


def load_blocks(tiers: tuple[str, ...] = ("factory", "user")) -> dict:
    """
    The device-derived block reference, keyed by plugin URI.

    The factory tier ships with the skill; the user tier is whatever this
    particular device has installed on top, and may be absent.
    """
    blocks: dict = {}
    for tier in tiers:
        path = _REFERENCE_DIR / f"blocks-{tier}.json"
        if path.exists():
            blocks.update(json.loads(path.read_text()).get("blocks", {}))
    return blocks


class Issue:
    __slots__ = ("severity", "where", "message")

    def __init__(self, severity: str, where: str, message: str):
        self.severity, self.where, self.message = severity, where, message

    def __repr__(self) -> str:
        return f"{self.severity:7} {self.where:28} {self.message}"

    def as_dict(self) -> dict:
        return {"severity": self.severity, "where": self.where, "message": self.message}


def _known_symbols(uri: str, blocks: dict) -> set[str]:
    spec = blocks.get(uri) or blocks.get(uri.split("#")[0])
    return {p["symbol"] for p in spec["params"]} if spec else set()


def _param_spec(uri: str, symbol: str, blocks: dict) -> dict | None:
    spec = blocks.get(uri) or blocks.get(uri.split("#")[0])
    if not spec:
        return None
    return next((p for p in spec["params"] if p["symbol"] == symbol), None)


def validate(document: Any, blocks: dict | None = None) -> list[Issue]:
    """Return every problem found in a whole preset document."""
    blocks = load_blocks() if blocks is None else blocks
    out: list[Issue] = []
    err = lambda w, m: out.append(Issue("error", w, m))
    warn = lambda w, m: out.append(Issue("warning", w, m))

    if not isinstance(document, dict):
        err("root", "A preset document must be a JSON object.")
        return out
    if document.get("type") != "preset":
        err("type", 'The root "type" must be the string "preset".')
    if document.get("version") != 1:
        err("version", 'The root "version" must be 1.')
    preset = document.get("preset")
    if not isinstance(preset, dict):
        err("preset", 'The document needs a "preset" object.')
        return out

    if not str(preset.get("name") or "").strip():
        warn("preset.name", "The preset has no name.")
    uuid = preset.get("uuid")
    if uuid and not UUID_RE.match(str(uuid)):
        warn("preset.uuid", "The uuid is not 56 lowercase hex digits in 16-8-8-24 groups; "
                            "the device replaces it on save anyway.")
    scene = preset.get("scene")
    if isinstance(scene, int) and not 0 <= scene < len(SCENES):
        err("preset.scene", f"The active scene counts from 0, so it must be 0-{len(SCENES) - 1}.")

    chains = preset.get("chains") or {}
    if not chains:
        warn("preset.chains", "The preset has no blocks.")

    for row_key, row in chains.items():
        if not (str(row_key).isdigit() and 1 <= int(row_key) <= MAX_ROWS):
            err(f"chains.{row_key}", f"A chain row must be 1-{MAX_ROWS}.")
        for slot_key, block in (row.get("blocks") or {}).items():
            at = f"row {row_key} / slot {slot_key}"
            if not (str(slot_key).isdigit() and 1 <= int(slot_key) <= MAX_SLOTS):
                err(at, f"A slot must be 1-{MAX_SLOTS}.")
            uri = block.get("uri")
            if not uri:
                err(at, 'A block needs a "uri"; it is the only required field.')
                continue
            if blocks and uri not in blocks and uri.split("#")[0] not in blocks:
                warn(at, f'"{uri}" is not a block this device reports as installed.')

            for field in ("parameters", "properties"):
                keys = sorted(int(k) for k in (block.get(field) or {}) if str(k).isdigit())
                if keys and keys != list(range(1, len(keys) + 1)):
                    err(f"{at} / {field}",
                        f"{field} keys must run 1..N with no gaps; found {keys}.")

            stored = {p["symbol"] for p in (block.get("parameters") or {}).values() if "symbol" in p}
            known = _known_symbols(uri, blocks)

            def wrong(symbol: str) -> bool:
                return symbol not in stored and bool(known) and symbol not in known

            quickpot = block.get("quickpot")
            if quickpot and wrong(quickpot):
                err(at, f'quickpot "{quickpot}" is not a parameter of this plugin.')

            for param in (block.get("parameters") or {}).values():
                spec = _param_spec(uri, param.get("symbol", ""), blocks)
                value = param.get("value")
                if spec and isinstance(value, (int, float)):
                    if not spec["min"] <= value <= spec["max"]:
                        err(f"{at} / {param['symbol']}",
                            f"{value:g} is outside the plugin range {spec['min']:g} to {spec['max']:g}.")
                    elif spec.get("options") and value != int(value):
                        warn(f"{at} / {param['symbol']}",
                             "This is an enumeration, so the value should be a whole number.")

            for scene_key, delta in (block.get("scenes") or {}).items():
                if not (str(scene_key).isdigit() and int(scene_key) in SCENES):
                    err(f"{at} / scene {scene_key}", f"A scene must be one of {list(SCENES)}.")
                params = delta.get("parameters")
                if params is not None and not isinstance(params, list):
                    err(f"{at} / scene {scene_key}",
                        "Scene parameters are an array, unlike the block's parameters object.")
                for entry in params or []:
                    if wrong(entry.get("symbol", "")):
                        err(f"{at} / scene {scene_key}",
                            f'The scene overrides "{entry.get("symbol")}", which this plugin does not have.')

    for key, binding in (preset.get("bindings") or {}).items():
        at = f"bindings.{key}"
        if key not in ACTUATORS:
            err(at, f'"{key}" is not one of the ten hardware actuators.')
        targets = binding.get("parameters") or []
        if not targets:
            warn(at, "This binding has no targets; unused actuators are left out entirely.")
        for target in targets:
            if target.get("row") is None or target.get("block") is None or not target.get("symbol"):
                err(at, "Every binding target needs row, block and symbol.")
                continue
            row = (chains.get(str(target["row"])) or {}).get("blocks") or {}
            block = row.get(str(target["block"]))
            if not block:
                err(at, f"Target row {target['row']} / slot {target['block']} holds no block.")
                continue
            symbol = target["symbol"]
            if not symbol.startswith(":"):
                stored = {p["symbol"] for p in (block.get("parameters") or {}).values() if "symbol" in p}
                known = _known_symbols(block.get("uri", ""), blocks)
                if symbol not in stored and known and symbol not in known:
                    err(at, f'The target plugin has no parameter "{symbol}".')
            has_min, has_max = isinstance(target.get("min"), (int, float)), isinstance(target.get("max"), (int, float))
            if has_min != has_max:
                err(at, "min and max must both be present or both absent.")
        if len(targets) > 1 and not isinstance(binding.get("value"), (int, float)):
            warn(at, "A macro binding should carry a normalised value between 0 and 1.")
        if key in FOOTSWITCHES:
            warn(at, "Footswitch bindings only act in Stomp mode; in Scene mode the "
                     "footswitches select scenes.")

    return out


def summarise(issues: Iterable[Issue]) -> str:
    issues = list(issues)
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    if not issues:
        return "No problems found."
    lines = [f"{len(errors)} error(s), {len(warnings)} warning(s)"]
    lines += [f"  {i}" for i in errors + warnings]
    return "\n".join(lines)
