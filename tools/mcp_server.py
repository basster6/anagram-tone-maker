#!/usr/bin/env python3
"""
MCP server for the Anagram tone maker: the same commands as tools/cli.py, as
tools any MCP client can call (Claude Desktop, Claude Code, Codex and others).

    python tools/mcp_server.py        # stdio; normally started by the client

Each tool runs the matching cli.py command and returns what it prints, which is
written for an assistant to read. The pedal is opened per call and released
again, so Darkglass Suite can be used between calls.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import re
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
os.chdir(ROOT)

from mcp.server.mcpserver import MCPServer  # noqa: E402
from mcp.types import ToolAnnotations  # noqa: E402

import cli  # noqa: E402

MEASUREMENTS = ROOT / "measurements"
GUIDES = {
    "skill": ROOT / "SKILL.md",
    **{p.stem: p for p in sorted((ROOT / "reference").glob("*.md"))},
}
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$")

INSTRUCTIONS = """\
Designs, auditions, saves and measures tones on a Darkglass Anagram pedal over USB.

Before designing or changing any tone, call read_guide("skill") and follow it: it
says what to read next (rig-profile, what-blocks-model, choosing-blocks,
preset-format) and how to work. It describes the work in terms of
`python3 tools/cli.py <command>`; with this server, call the matching tool:

  doctor -> doctor            info -> device_info
  blocks -> list_blocks        block -> get_block
  presets -> list_presets      get -> get_preset
  validate -> validate_preset  audition -> audition_preset
  save -> save_preset          delete -> delete_preset
  measure -> measure           compare -> compare_measurements
  capture -> capture           reamp -> reamp
  setup -> setup_rig           market -> market
  goto/scene/mode -> goto_preset / set_scene / set_mode

Files the guide writes to disk (a.json, take.wav) are names here: measure, capture,
compare and reamp take a short name and keep the files in the measurements folder.
Measuring and capturing make sound on the pedal's outputs: tell the player to turn
monitors down and keep hands off the strings first. Save or delete only when the
player asked for it and named the slot.
"""

mcp = MCPServer("anagram-tone-maker", instructions=INSTRUCTIONS)
_lock = threading.Lock()

READ = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)
PLAY = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)
WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)


def _cli(*argv: str) -> str:
    """Run one cli.py command and return what it printed."""
    out = io.StringIO()
    with _lock, contextlib.redirect_stdout(out):
        try:
            code = cli.main(list(argv))
        except SystemExit as exc:                 # missing packages exit with a message
            code = exc.code if isinstance(exc.code, int) else 1
            if not isinstance(exc.code, int) and exc.code:
                print(exc.code)
    text = out.getvalue().rstrip()
    return text + (f"\n(exit code {code})" if code else "") if text else f"(no output, exit code {code})"


def _document(document: dict | str) -> str:
    """Write a preset document to a temporary file for the cli commands."""
    doc = json.loads(document) if isinstance(document, str) else document
    fd, path = tempfile.mkstemp(prefix="anagram-", suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(doc, f, ensure_ascii=False)
    return path


def _named(name: str, suffix: str) -> str:
    if not NAME.match(name):
        raise ValueError(f'"{name}" is not a plain file name (letters, digits, - _ .).')
    MEASUREMENTS.mkdir(exist_ok=True)
    return str(MEASUREMENTS / (name if name.endswith(suffix) else name + suffix))


def _slot_file(slot: str) -> str:
    from anagram import slot_filename
    return slot if slot.endswith(".json") else slot_filename(slot)


@mcp.tool(annotations=READ)
def read_guide(name: str = "skill") -> str:
    """Read the skill guide or a reference document. Start with "skill". Names:
    skill, rig-profile, what-blocks-model, choosing-blocks, preset-format,
    measuring-tone, onboarding, blocks-factory-catalog, blocks-user-catalog."""
    path = GUIDES.get(name)
    if path is None or not path.exists():
        return f'No guide "{name}". Available: {", ".join(n for n, p in GUIDES.items() if p.exists())}.'
    return path.read_text()


@mcp.tool(annotations=READ)
def doctor() -> str:
    """Check Python, packages, the pedal's control and audio interfaces and the skill files."""
    return _cli("doctor")


@mcp.tool(annotations=READ)
def device_info() -> str:
    """Firmware, plugin counts and preset count of the connected pedal."""
    return _cli("info")


@mcp.tool(annotations=READ)
def list_blocks(category: str = "") -> str:
    """List blocks, optionally only those whose category contains the given text."""
    return _cli("blocks", *([category] if category else []))


@mcp.tool(annotations=READ)
def get_block(uri: str) -> str:
    """One block's full parameter list, plus what the marketplace says it is."""
    return _cli("block", uri)


@mcp.tool(annotations=READ)
def list_presets() -> str:
    """Every preset stored on the pedal, by slot (01A ... 42C)."""
    return _cli("presets")


@mcp.tool(annotations=READ)
def get_preset(slot: str) -> str:
    """The preset document stored in a slot, such as 17A."""
    return _cli("get", _slot_file(slot))


@mcp.tool(annotations=READ)
def validate_preset(document: dict) -> str:
    """Check a preset document against the format and the block catalogue."""
    return _cli("validate", _document(document))


@mcp.tool(annotations=PLAY)
def audition_preset(document: dict) -> str:
    """Play a preset document on the pedal without saving it anywhere."""
    return _cli("audition", _document(document))


@mcp.tool(annotations=WRITE)
def save_preset(slot: str, document: dict, replace: bool = False) -> str:
    """Save a preset document to a slot such as 17A. An occupied slot is replaced only
    with replace=true; its previous contents are backed up first."""
    return _cli("save", slot, _document(document), *(["--force"] if replace else []))


@mcp.tool(annotations=WRITE)
def delete_preset(slot: str) -> str:
    """Delete the preset in a slot, after backing it up."""
    return _cli("delete", slot, "--yes")


@mcp.tool(annotations=PLAY)
def goto_preset(slot: str) -> str:
    """Switch the pedal to a stored preset over USB MIDI."""
    return _cli("goto", slot)


@mcp.tool(annotations=PLAY)
def set_scene(scene: str) -> str:
    """Switch scene: a number from 1, or next, prev or default."""
    return _cli("scene", scene)


@mcp.tool(annotations=PLAY)
def set_mode(mode: str) -> str:
    """Switch the pedal between scene, stomp and preset mode."""
    return _cli("mode", mode)


@mcp.tool(annotations=PLAY)
def measure(name: str = "", quick: bool = True, slot: str = "") -> str:
    """Measure the tone playing now (or a stored slot) with test signals: frequency
    response, distortion, dynamics, noise. Makes sound. quick takes about 15 s, a full
    run about a minute. Give a name to keep the result for compare_measurements."""
    args = ["measure", *(["--quick"] if quick else []), *(["--slot", slot] if slot else [])]
    if name:
        args += ["--save", _named(name, ".json"), "--label", name]
    return _cli(*args)


@mcp.tool(annotations=READ)
def compare_measurements(before: str, after: str) -> str:
    """What changed between two measurements saved by measure."""
    return _cli("compare", _named(before, ".json"), _named(after, ".json"))


@mcp.tool(annotations=PLAY)
def capture(name: str, seconds: int = 20) -> str:
    """Record the player for the given seconds, dry and wet, and keep the dry take
    under the name for reamp. The player plays while it runs."""
    return _cli("capture", str(seconds), "--save", _named(name, ".wav"))


@mcp.tool(annotations=PLAY)
def reamp(take: str, slot: str = "", name: str = "") -> str:
    """Send a captured dry take through the tone playing now (or a stored slot) and
    analyse the result. Makes sound."""
    args = ["reamp", _named(take, ".wav"), *(["--slot", slot] if slot else [])]
    if name:
        args += ["--save", _named(name, ".wav")]
    return _cli(*args)


@mcp.tool(annotations=PLAY)
def setup_rig(replace: bool = False) -> str:
    """First run: infer the rig from the presets on the pedal and draft rig.yaml."""
    return _cli("setup", *(["--force"] if replace else []))


@mcp.tool(annotations=ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=True))
def market(search: str = "", whole_shop: bool = False) -> str:
    """What the Anagram marketplace says about installed blocks, or the whole shop."""
    return _cli("market", *(["--all"] if whole_shop else []), *([search] if search else []))


if __name__ == "__main__":
    mcp.run()
