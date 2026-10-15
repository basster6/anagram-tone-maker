#!/usr/bin/env python3
"""
Command line front end for the Anagram tone maker skill.

    python3 tools/cli.py info
    python3 tools/cli.py blocks [category-substring]
    python3 tools/cli.py block urn:darkglass:B3K
    python3 tools/cli.py presets
    python3 tools/cli.py get 13.json
    python3 tools/cli.py validate tone.json
    python3 tools/cli.py audition tone.json
    python3 tools/cli.py save 17A tone.json [--force]
    python3 tools/cli.py goto 17A
    python3 tools/cli.py mode scene|stomp|preset
    python3 tools/cli.py scene 2|next|prev|default
    python3 tools/cli.py tuner | tap
    python3 tools/cli.py delete 41A --yes
    python3 tools/cli.py setup [--force]
    python3 tools/cli.py analyze [dump.json]
    python3 tools/cli.py market [search-term]
    python3 tools/cli.py refresh-blocks

`setup` is the first-run helper: it infers what it can about the rig from the
presets already on the pedal and writes a draft `rig.yaml`, leaving the questions
only a human can answer marked ASK. See `reference/onboarding.md`.

`info`, `presets`, `get`, `audition`, `save`, `delete` and `refresh-blocks` need the
pedal plugged in and Darkglass Suite closed. The MIDI commands - `goto`, `mode`,
`scene`, `tuner`, `tap` - ride a separate USB interface and work alongside them,
but need USB MIDI switched on in the pedal's own settings. `blocks`, `block` and `validate` read the bundled
reference and work with nothing attached.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from validate import load_blocks, summarise, validate  # noqa: E402

REFERENCE_DIR = HERE.parent / "reference"


def _device():
    """An unopened connection; `with` opens it and closes it again."""
    from anagram import Anagram
    return Anagram()


def cmd_info() -> int:
    with _device() as dev:
        fw = dev.firmware()
        print(f"firmware     {fw['version'].strip()}")
        print(f"edition      {fw.get('edition') or '-'}")
        print(f"capabilities {', '.join(fw.get('capabilities', []))}")
        print(f"plugins      {len(dev.plugins('ALL'))} "
              f"({len(dev.plugins('FACTORY'))} factory, {len(dev.plugins('USER'))} user)")
        slots = dev.preset_slots()
        print(f"presets      {len(slots)} stored")
    return 0


def cmd_blocks(needle: str | None) -> int:
    blocks = load_blocks()
    groups: dict[str, list] = {}
    for uri, spec in blocks.items():
        groups.setdefault(spec["category"], []).append((uri, spec))
    for category in sorted(groups):
        if needle and needle.lower() not in category.lower():
            continue
        items = sorted(groups[category], key=lambda kv: kv[1]["name"])
        print(f"\n{category}  ({len(items)})")
        for uri, spec in items:
            print(f"  {spec['abbr']:>5}  {spec['name']:<30} {len(spec['params']):>2}p  {uri}")
    return 0


def cmd_block(uri: str) -> int:
    blocks = load_blocks()
    spec = blocks.get(uri) or blocks.get(uri.split("#")[0])
    if not spec:
        matches = [u for u, s in blocks.items() if uri.lower() in (u + s["name"]).lower()]
        print(f'No block "{uri}".' + (f" Did you mean:\n  " + "\n  ".join(matches[:8]) if matches else ""))
        return 1
    print(f"{spec['name']}  [{spec['abbr']}]  {spec['category']}\n{uri}")
    try:
        from market import describe
        shop = describe(uri)
    except Exception:
        shop = None
    if shop:
        print(f"\n{shop['title']} - {shop['vendor']}  ({shop['productType']})")
        if shop.get("tags"):
            print("tags: " + ", ".join(shop["tags"]))
        if shop.get("description"):
            print("\n" + shop["description"].strip())
    print()
    for p in spec["params"]:
        if p.get("toggle"):
            rng = "on/off"
        elif p.get("options"):
            rng = " | ".join(p["options"])
        else:
            rng = f"{p['min']:g} .. {p['max']:g}" + (" (log)" if p.get("log") else "")
        extra = "  ".join(filter(None, [
            f"default {p['def']:g}", p.get("unit", ""), p.get("role", ""),
        ]))
        print(f"  {p['symbol']:<18} {rng:<42} {extra}")
    return 0


def cmd_presets() -> int:
    from anagram import slot_label
    with _device() as dev:
        slots = dev.preset_slots()
    for slot in sorted(slots, key=lambda s: int(s["filename"].split(".")[0])):
        print(f"  {slot_label(slot['filename'])}  {slot['filename']:<10} {slot['name']}")
    return 0


def cmd_get(filename: str) -> int:
    with _device() as dev:
        doc = dev.get_preset(filename)
    if doc is None:
        print(f"{filename} is empty.")
        return 1
    print(json.dumps(doc, indent=1, ensure_ascii=False))
    return 0


def _read_document(path: str) -> dict:
    return json.loads(Path(path).read_text())


def cmd_validate(path: str) -> int:
    issues = validate(_read_document(path))
    print(summarise(issues))
    return 1 if any(i.severity == "error" for i in issues) else 0


def cmd_audition(path: str) -> int:
    doc = _read_document(path)
    issues = [i for i in validate(doc) if i.severity == "error"]
    if issues:
        print("Not sending it - fix these first:")
        print(summarise(issues))
        return 1
    with _device() as dev:
        dev.audition(doc)
    name = doc.get("preset", {}).get("name") or path
    print(f'The pedal is playing "{name}". Nothing was saved; pick a preset on the '
          f"pedal to go back.")
    return 0


def cmd_save(target: str, path: str, force: bool) -> int:
    from anagram import slot_filename, slot_label
    filename = target if target.endswith(".json") else slot_filename(target)
    doc = _read_document(path)
    issues = [i for i in validate(doc) if i.severity == "error"]
    if issues:
        print("Not saving it - fix these first:")
        print(summarise(issues))
        return 1
    with _device() as dev:
        existing = dev.get_preset(filename)
        if existing and not force:
            held = existing.get("preset", {}).get("name") or filename
            print(f'{slot_label(filename)} ({filename}) already holds "{held}". '
                  f"Pass --force to replace it.")
            return 1
        dev.save_preset(filename, doc)
        back = dev.get_preset(filename)
    name = (back or {}).get("preset", {}).get("name")
    if name is None:
        print(f"Wrote {filename}, but reading it back returned nothing.")
        return 1
    print(f'Saved "{name}" to {slot_label(filename)} ({filename}).')
    return 0


def _midi():
    from midi import AnagramMidi
    return AnagramMidi()


def cmd_goto(target: str) -> int:
    from anagram import slot_filename, slot_label
    filename = target if target.endswith(".json") else slot_filename(target)
    number = int(filename.split(".")[0])
    with _midi() as m:
        m.goto_slot(number)
    print(f"Pedal jumped to {slot_label(filename)} (program {number}).")
    return 0


def cmd_mode(mode: str) -> int:
    with _midi() as m:
        m.set_mode(mode)
    does = {"preset": "select presets", "stomp": "toggle their bound blocks",
            "scene": "select scenes 1-3"}[mode]
    print(f"Pedal is in {mode} mode; the footswitches now {does}.")
    return 0


def cmd_scene(which: str) -> int:
    with _midi() as m:
        m.set_scene(which if which in ("next", "prev", "default") else int(which))
    print(f"Scene {which}. This only acts while the pedal is in scene mode.")
    return 0


def cmd_midi_simple(what: str) -> int:
    with _midi() as m:
        getattr(m, what)()
    print(f"Sent {what}.")
    return 0


def cmd_delete(target: str, yes: bool) -> int:
    from anagram import slot_filename, slot_label
    filename = target if target.endswith(".json") else slot_filename(target)
    with _device() as dev:
        existing = dev.get_preset(filename)
        if not existing:
            print(f"{slot_label(filename)} ({filename}) is already empty.")
            return 0
        held = existing.get("preset", {}).get("name") or filename
        if not yes:
            print(f'{slot_label(filename)} holds "{held}". Pass --yes to delete it.')
            return 1
        dev.delete_preset(filename)
        gone = dev.get_preset(filename) is None
    print(f'Deleted "{held}" from {slot_label(filename)} ({filename}).'
          if gone else f"Asked to delete {filename}, but it is still there.")
    return 0 if gone else 1


def cmd_setup(force: bool) -> int:
    """First run: infer the rig from stored presets, draft rig.yaml, list the rest."""
    from setup_rig import detect, draft, report

    # A first-time user may not have plugged in yet, and the first command of the
    # onboarding flow must not dead-end on that. Draft from nothing instead.
    presets: list[dict] = []
    try:
        with _device() as dev:
            presets = [
                {"filename": slot["filename"], "document": dev.get_preset(slot["filename"])}
                for slot in dev.preset_slots()
            ]
    except Exception as exc:
        print(f"Could not read the pedal ({exc})")
        print("Drafting from nothing - every field is left for you to answer.\n")

    found = detect(presets)
    print(report(found))

    target = HERE.parent / "rig.yaml"
    if target.exists() and not force:
        print(f"\n{target.name} already exists - left alone. Pass --force to redraft it.")
        return 0
    target.write_text(draft(found))
    print(f"\nWrote a draft {target.name}. Ask the questions above, then fill in the ASK lines.")
    return 0


def cmd_analyze(dump: str | None) -> int:
    """Profile what this player owns and how they actually use it."""
    from analyze import collect, to_markdown

    if dump:
        raw = json.loads(Path(dump).read_text())
        presets = [{"filename": p["name"], "document": p["content"]} for p in raw["presets"]]
        firmware = (raw.get("device", {}).get("firmware", {}) or {}).get("version", "").strip()
    else:
        with _device() as dev:
            firmware = dev.firmware()["version"].strip()
            presets = [
                {"filename": slot["filename"], "document": dev.get_preset(slot["filename"])}
                for slot in dev.preset_slots()
            ]
        presets = [p for p in presets if p["document"]]

    profile = collect(presets, REFERENCE_DIR)
    out = REFERENCE_DIR / "rig-profile.md"
    out.write_text(to_markdown(profile, firmware))
    print(f"Profiled {profile['presetCount']} presets -> reference/rig-profile.md")
    if profile["unusedPaid"]:
        print(f"  {len(profile['unusedPaid'])} installed blocks are never used in any preset")
    return 0


def cmd_market(term: str | None) -> int:
    """What the marketplace says about blocks, which is the only place that says."""
    from market import catalogue
    index = catalogue()
    blocks = load_blocks()
    rows = []
    for uri, shop in index.items():
        if uri not in blocks and uri.split("#")[0] not in blocks:
            continue
        if term and term.lower() not in json.dumps(shop).lower():
            continue
        rows.append((shop["productType"], shop["title"], shop["vendor"], uri))
    for product_type, title, vendor, uri in sorted(rows):
        print(f"  {product_type:<26} {title:<34} {vendor:<24} {uri}")
    print(f"\n{len(rows)} of your installed blocks are in the shop "
          f"(factory blocks are not sold, so they never appear).")
    return 0


def cmd_refresh_blocks() -> int:
    """Re-read every block's metadata from the device into the reference."""
    from build_reference import build
    with _device() as dev:
        counts = build(dev, REFERENCE_DIR)
    for tier, n in counts.items():
        print(f"  {tier:8} {n:3} blocks -> reference/blocks-{tier}.json (+ catalog)")
    return 0


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__.strip())
        return 0
    cmd, rest = argv[0], argv[1:]
    try:
        if cmd == "info":            return cmd_info()
        if cmd == "blocks":          return cmd_blocks(rest[0] if rest else None)
        if cmd == "block":           return cmd_block(rest[0])
        if cmd == "presets":         return cmd_presets()
        if cmd == "get":             return cmd_get(rest[0])
        if cmd == "validate":        return cmd_validate(rest[0])
        if cmd == "audition":        return cmd_audition(rest[0])
        if cmd == "save":
            force = "--force" in rest
            args = [a for a in rest if a != "--force"]
            return cmd_save(args[0], args[1], force)
        if cmd == "goto":            return cmd_goto(rest[0])
        if cmd == "mode":            return cmd_mode(rest[0])
        if cmd == "scene":           return cmd_scene(rest[0])
        if cmd in ("tuner", "tap"):  return cmd_midi_simple(cmd)
        if cmd == "delete":
            return cmd_delete([a for a in rest if a != "--yes"][0], "--yes" in rest)
        if cmd == "setup":           return cmd_setup("--force" in rest)
        if cmd == "analyze":         return cmd_analyze(rest[0] if rest else None)
        if cmd == "market":          return cmd_market(rest[0] if rest else None)
        if cmd == "refresh-blocks":  return cmd_refresh_blocks()
    except IndexError:
        print(f'"{cmd}" needs an argument. See --help.')
        return 2
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}")
        return 1
    print(f'Unknown command "{cmd}". See --help.')
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
