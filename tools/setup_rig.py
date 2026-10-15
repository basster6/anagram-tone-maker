"""
Work out as much of rig.yaml as the device itself can answer.

The pedal knows things about the rig that the player should not have to be asked:
which output jacks their presets actually use, whether anything is wired into the
FX loop and how, whether an expression pedal has ever been bound. Detecting those
leaves a short list of genuinely human questions - what instrument, what gear sits
before and after, what they like - which the assistant asks in conversation.

Nothing here prompts on stdin. It reports, and writes a draft rig.yaml with the
detected parts filled in and the rest marked for the assistant to ask about.
"""

from __future__ import annotations

from pathlib import Path

# Output-block symbols, in the order the pedal's own screen lists them.
JACK_SYMBOLS = ["xlrL", "xlrR", "jackL", "jackR", "headphones"]

CAB_URIS = {
    "urn:darkglass-anagram:cabinet-bass",
    "urn:darkglass-anagram:cabinet-guitar",
    "urn:darkglass-anagram:cabinet-artists",
    "urn:darkglass-anagram:cabinet-user",
    "urn:darkglass-anagram:cabinet-tone3000#stereo",
}
LOOP_URIS = {
    "urn:darkglass-anagram:fxloop": "fxloop",
    "urn:darkglass-anagram:send": "send",
    "urn:darkglass-anagram:return": "return",
}
# urn:darkglass-anagram:fxloop, FXloopIOconfig enumeration.
LOOP_IO_NAMES = {0: "Send only", 1: "Return only", 2: "Loop", 3: "Insert (expression)"}


def _blocks(document: dict):
    """Every block in a preset document, regardless of row or slot."""
    preset = document.get("preset", document)
    for row in preset.get("chains", {}).values():
        for block in row.get("blocks", {}).values():
            if isinstance(block, dict) and block.get("uri"):
                yield block


def _params(block: dict) -> dict:
    """A block's parameters as {symbol: value}, flattening the 1..N key form."""
    out = {}
    for entry in (block.get("parameters") or {}).values():
        if isinstance(entry, dict) and "symbol" in entry:
            out[entry["symbol"]] = entry.get("value")
    return out


def detect(presets: list[dict]) -> dict:
    """Infer rig facts from stored presets. Every finding carries its evidence."""
    documents = [p["document"] for p in presets if p.get("document")]
    total = len(documents)

    jack_use = {s: 0 for s in JACK_SYMBOLS}
    output_presets = 0
    cab_presets = 0
    loop_kinds: dict[str, int] = {}
    loop_io: dict[str, int] = {}
    exp_bound = 0

    for document in documents:
        preset = document.get("preset", document)
        has_cab = False
        for block in _blocks(document):
            uri = block["uri"]
            if uri in CAB_URIS:
                has_cab = True
            if uri == "urn:darkglass-anagram:output":
                output_presets += 1
                values = _params(block)
                for symbol in JACK_SYMBOLS:
                    if float(values.get(symbol) or 0) > 0:
                        jack_use[symbol] += 1
            if uri in LOOP_URIS:
                kind = LOOP_URIS[uri]
                loop_kinds[kind] = loop_kinds.get(kind, 0) + 1
                config = _params(block).get("FXloopIOconfig")
                if config is not None:
                    name = LOOP_IO_NAMES.get(int(config), f"config {int(config)}")
                    loop_io[name] = loop_io.get(name, 0) + 1
        if has_cab:
            cab_presets += 1
        if "exp.pedal" in (preset.get("bindings") or {}):
            exp_bound += 1

    # A cab block in most presets means the pedal is expected to do the speaker,
    # so there is no real cabinet after it. No cab block anywhere points the
    # other way - but quietly, so it is offered as a question, not a conclusion.
    cab_ratio = (cab_presets / total) if total else 0.0

    return {
        "presetCount": total,
        "jackUse": jack_use,
        "outputPresets": output_presets,
        "cabPresets": cab_presets,
        "cabRatio": cab_ratio,
        "loopKinds": loop_kinds,
        "loopIO": loop_io,
        "expBound": exp_bound,
    }


def _jack_line(found: dict) -> list[str]:
    """Only presets carrying an output block say anything about the outputs."""
    scoped = found["outputPresets"]
    if not scoped:
        return [
            "    outputs     no preset sets them explicitly, so the pedal is on",
            "                its default - ask which outputs are actually wired",
        ]
    lines = []
    for symbol in JACK_SYMBOLS:
        count = found["jackUse"][symbol]
        if count:
            lines.append(f"    {symbol:12} on in {count}/{scoped} presets that set outputs")
    if not lines:
        lines.append(f"    outputs     all off in the {scoped} preset(s) that set them")
    elif scoped < found["presetCount"] / 2:
        lines.append(
            f"                only {scoped}/{found['presetCount']} presets set outputs at all,"
            " so this is a weak signal"
        )
    return lines


def report(found: dict) -> str:
    """What the device settled, and what is left for the assistant to ask."""
    total = found["presetCount"]
    if not total:
        return "Nothing to infer from, so ask the player everything below.\n"
    out = [f"Read {total} presets off the pedal.", ""]

    out.append("  Detected")
    jacks = _jack_line(found)
    out += jacks or ["    no output block found in any preset"]

    if found["cabPresets"]:
        out.append(
            f"    cab sim     used in {found['cabPresets']}/{total} presets"
            " -> the pedal is doing the speaker"
        )
    else:
        out.append("    cab sim     never used -> a real cabinet may follow the pedal")

    if found["loopKinds"]:
        kinds = ", ".join(f"{k} x{v}" for k, v in sorted(found["loopKinds"].items()))
        out.append(f"    FX loop     {kinds}")
        for name, count in sorted(found["loopIO"].items(), key=lambda kv: -kv[1]):
            out.append(f"                wired as {name} in {count} preset(s)")
    else:
        out.append("    FX loop     no send, return or fxloop block in any preset")

    if found["expBound"]:
        out.append(f"    exp. pedal  bound in {found['expBound']} preset(s), so one exists -")
        out.append("                but a binding cannot say whether it is plugged in now. Ask.")
    else:
        out.append("    exp. pedal  never bound in any preset")

    out += [
        "",
        "  Ask the player (the device cannot know these)",
        "    1. instrument      which bass or guitar, and passive or active",
        "    2. tuning          standard, drop D, BEAD, something else",
        "    3. before         pedals in front, and which are always on",
        "    4. after          amp, cab, desk or interface the outputs feed",
        "    5. fx_loop        what is actually in the loop, if anything",
        "    6. exp. pedal     whether they own one, and whether it is plugged in",
        "    7. preferences    genres, reference tones, things they dislike",
        "",
        "Confirm the detected values too - they are inferred from old presets and",
        "a rig changes. Then write rig.yaml.",
    ]
    return "\n".join(out)


def _yes_no(flag: bool) -> str:
    return "true" if flag else "false"


def _exp_note(found: dict) -> str:
    if found["expBound"]:
        return (
            f"{found['expBound']} preset(s) bind it, so one exists - but that cannot "
            "say whether it is plugged in."
        )
    return "No preset binds it."


def _cab_note(found: dict) -> str:
    total, cabs = found["presetCount"], found["cabPresets"]
    if not total:
        return "ASK - no presets to infer from"
    if cabs:
        return f"cab sim used in {cabs}/{total} presets, so the pedal does the speaker"
    return f"ASK - no preset uses cab sim, which hints at a real cab. Confirm"


def _out_note(found: dict, flag: bool, trustworthy: bool) -> str:
    scoped, total = found["outputPresets"], found["presetCount"]
    if not scoped:
        return "ASK - no preset sets the outputs"
    if not trustworthy:
        return f"ASK - only {scoped}/{total} presets set outputs, too few to infer from"
    return "detected in use" if flag else "detected: not used"


def draft(found: dict) -> str:
    """A rig.yaml with the detected parts filled in and the rest marked ASK."""
    scoped = found["outputPresets"]
    jack_use = found["jackUse"]

    # Most presets carry no output block, in which case the pedal is on its
    # default and the few that do set it say little. Only fill the outputs in
    # when enough presets set them to mean something.
    trustworthy = scoped >= max(3, found["presetCount"] / 2)

    def used(*symbols: str) -> bool:
        if not trustworthy:
            return False
        return any(jack_use[s] > scoped / 2 for s in symbols)

    xlr, jack, phones = used("xlrL", "xlrR"), used("jackL", "jackR"), used("headphones")
    loop_used = bool(found["loopKinds"])
    loop_note = ""
    if found["loopIO"]:
        loop_note = max(found["loopIO"].items(), key=lambda kv: kv[1])[0]

    return f"""# Your rig, as the assistant should understand it.
#
# Lines marked ASK are for the assistant to fill in by asking you. The rest was
# detected from the presets already on the pedal - correct anything that has
# changed since you saved them.

instrument:
  description: ""        # ASK - e.g. "Fender Jazz Bass, passive, flatwound"
  pickups: ""            # ASK - passive | active | piezo
  tuning: ""             # ASK - e.g. "standard 4-string" / "BEAD" / "drop D"

# What the signal hits BEFORE the Anagram's input.
before: []               # ASK - each entry: {{ name, role, always_on }}

# What the signal hits AFTER the Anagram's outputs.
after: []                # ASK - each entry: {{ name, role, notes }}

# The Anagram's SEND / RETURN loop. Put a `urn:darkglass-anagram:fxloop` block
# where this gear belongs rather than duplicating it with an internal block.
fx_loop:
  used: {_yes_no(loop_used)}{f"      # detected: wired as {loop_note}" if loop_note else "       # detected from your presets"}
  devices: []            # ASK - each entry: {{ name, role, notes }}

# Where the sound ends up. The `urn:darkglass-anagram:output` block switches
# these per preset: xlrL, xlrR, jackL, jackR, headphones.
outputs:
  xlr: "{'in use' if xlr else ''}"           # {_out_note(found, xlr, trustworthy)}
  jack: "{'in use' if jack else ''}"          # {_out_note(found, jack, trustworthy)}
  headphones: "{'in use' if phones else ''}"    # {_out_note(found, phones, trustworthy)}
  # ASK to confirm: is there a real cabinet after the jack output?
  real_cab_after_jack: {_yes_no(found['presetCount'] and found['cabPresets'] == 0)}   # {_cab_note(found)}

# Which of the pedal's ten actuators are usable. The six pots and three
# footswitches are built in; the expression pedal is a jack you may or may not
# have something plugged into.
actuators:
  # true = plugged in | false = do not own one | ask = own one, usually unplugged
  expression_pedal: {"ask" if found["expBound"] else "false"}  # ASK to confirm. {_exp_note(found)}

preferences:
  style: ""              # ASK - genres, reference tones, how they like to work
  headroom: ""           # ASK - e.g. "keep it clean, drive comes from the amp"
  avoid: []              # ASK - e.g. ["heavy compression", "synth octave"]
"""
