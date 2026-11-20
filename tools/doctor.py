"""
Check that this machine is ready: Python, packages, the pedal's control and audio
interfaces, and the files the skill expects. Nothing is written to the pedal.

    python tools/cli.py doctor
"""
from __future__ import annotations

import importlib
import importlib.metadata
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WINDOWS = sys.platform == "win32"
PIP = "python -m pip install" if WINDOWS else "python3 -m pip install"


class Report:
    def __init__(self) -> None:
        self.failed = 0

    def line(self, status: str, what: str, detail: str = "", fix: str = "") -> None:
        if status == "FAIL":
            self.failed += 1
        print(f"  [{status:<4}] {what}" + (f": {detail}" if detail else ""))
        if fix:
            print(f"         -> {fix}")

    def section(self, title: str) -> None:
        print(f"\n{title}")


def check_python(r: Report) -> None:
    r.section("Python")
    v = sys.version_info
    ok = v >= (3, 9)
    r.line("OK" if ok else "FAIL", "version", f"{platform.python_version()} ({sys.executable})",
           "" if ok else "Install Python 3.9 or newer.")
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    r.line("OK" if in_venv else "WARN", "virtual environment", "active" if in_venv else "not active",
           "" if in_venv else "Optional, but keeps the packages apart: see the install guide.")


def check_packages(r: Report) -> None:
    r.section("Packages")
    hid_names = (["hidraw"] if sys.platform.startswith("linux") else []) + ["hid"]
    for label, modules, needed, fix in (
        ("hidapi", hid_names, "pedal control", f"{PIP} hidapi"),
        ("numpy", ["numpy"], "measuring", f"{PIP} numpy"),
        ("scipy", ["scipy"], "measuring", f"{PIP} scipy"),
        ("sounddevice", ["sounddevice"], "measuring", f"{PIP} sounddevice"),
        ("python-rtmidi", ["rtmidi"], "switching presets over MIDI (optional)", f"{PIP} python-rtmidi"),
        ("mcp", ["mcp"], "the MCP server for desktop apps (optional)", f"{PIP} mcp"),
    ):
        for name in modules:
            try:
                mod = importlib.import_module(name)
            except Exception as exc:              # noqa: BLE001 - a broken install reports here too
                error = f"{type(exc).__name__}: {exc}"
                continue
            version = getattr(mod, "__version__", "") or getattr(mod, "version", "")
            if not isinstance(version, str) or not version:
                try:
                    version = importlib.metadata.version(label)
                except importlib.metadata.PackageNotFoundError:
                    version = ""
            r.line("OK", label, f"{name} {version}".strip())
            break
        else:
            status = "WARN" if "optional" in needed or label in ("numpy", "scipy", "sounddevice") else "FAIL"
            r.line(status, label, f"missing, needed for {needed} ({error})", fix)


def suite_running() -> bool | None:
    try:
        if WINDOWS:
            out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Darkglass Suite.exe"],
                                 capture_output=True, text=True, timeout=10).stdout
            return "Darkglass Suite.exe" in out
        out = subprocess.run(["pgrep", "-f", "Darkglass Suite"], capture_output=True, text=True, timeout=10)
        return out.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return None


def check_pedal(r: Report) -> None:
    r.section("Pedal control (USB HID)")
    sys.path.insert(0, str(ROOT / "tools"))
    try:
        import anagram
    except SystemExit as exc:                     # anagram.py exits when hidapi is missing
        r.line("FAIL", "control library", str(exc))
        return
    running = suite_running()
    if running:
        r.line("WARN", "Darkglass Suite", "running", "Quit it while using these tools; it holds the pedal.")
    elif running is False:
        r.line("OK", "Darkglass Suite", "not running")
    found = list(anagram.hid.enumerate(anagram.VENDOR_ID, anagram.PRODUCT_ID))
    if not found:
        r.line("FAIL", "pedal", "not found on USB",
               "Plug it in with a data cable, switch it on and wait until it has booted.")
        return
    r.line("OK", "pedal", f"{len(found)} HID interface(s)")
    try:
        with anagram.Anagram() as dev:
            version = str(dev.firmware()["version"]).strip()
            presets = dev.preset_count()
    except Exception as exc:                      # noqa: BLE001
        r.line("FAIL", "control interface", str(exc).splitlines()[0],
               "Quit Darkglass Suite and close any browser tab connected to the pedal, then retry.")
        return
    line = tuple(int(x) for x in version.lstrip("v").split(".")[:2] if x.isdigit())
    tested = " or ".join(".".join(map(str, t)) for t in anagram.TESTED_FIRMWARE)
    if line in anagram.TESTED_FIRMWARE:
        r.line("OK", "firmware", f"{version}, {presets} presets stored")
    else:
        r.line("WARN", "firmware", f"{version}: reading and auditioning work, saving is refused",
               f"Saving is tested on {tested}.")


def check_audio(r: Report) -> None:
    r.section("Pedal audio (measuring)")
    try:
        import sounddevice as sd
        sys.path.insert(0, str(ROOT / "tools"))
        from measure import DEVICE_NAME, DRY_IN, OUT_CHANNELS
    except Exception as exc:                      # noqa: BLE001 - missing package or PortAudio
        r.line("WARN", "audio", f"skipped ({type(exc).__name__}: {exc})", "Install the measuring packages first.")
        return
    apis = sd.query_hostapis()
    seen = [(i, d) for i, d in enumerate(sd.query_devices()) if DEVICE_NAME.lower() in d["name"].lower()]
    if not seen:
        r.line("FAIL", "audio device", "no Anagram among the audio devices",
               "Check the USB cable; on Windows also that the pedal shows up under Sound settings.")
        return
    usable = None
    for i, d in seen:
        api = apis[d["hostapi"]]["name"]
        ok = d["max_output_channels"] >= OUT_CHANNELS and d["max_input_channels"] >= DRY_IN
        usable = usable if usable is not None or not ok else (i, api)
        r.line("OK" if ok else "INFO", f"#{i} {d['name']}",
               f"{api}, {d['max_input_channels']} in / {d['max_output_channels']} out")
    if usable is None:
        fix = ("Windows' default drivers often show only 2 channels. Look for the same device under "
               "another host API above; the pedal needs 9 outputs (output 9 feeds the chain) and 3 inputs."
               if WINDOWS else f"The pedal needs {OUT_CHANNELS} outputs and {DRY_IN} inputs.")
        r.line("FAIL", "measuring", "no Anagram device with enough channels", fix)
    else:
        r.line("OK", "measuring", f"will use #{usable[0]} ({usable[1]})")


def check_files(r: Report) -> None:
    r.section("Skill files")
    for path, what in ((".claude/skills/anagram-tone-maker/SKILL.md", "Claude Code entry"),
                       (".agents/skills/anagram-tone-maker/SKILL.md", "Codex entry")):
        r.line("OK" if (ROOT / path).exists() else "WARN", what, path)
    if (ROOT / "rig.yaml").exists():
        r.line("OK", "rig.yaml", "present")
    else:
        r.line("INFO", "rig.yaml", "not yet written", "Ask the assistant for a tone; the first run sets it up.")


def run() -> int:
    print(f"anagram-tone-maker doctor - {platform.system()} {platform.release()}, {platform.machine()}")
    r = Report()
    check_python(r)
    check_packages(r)
    check_pedal(r)
    check_audio(r)
    check_files(r)
    print("\n" + ("All checks passed." if not r.failed else f"{r.failed} check(s) failed; see the arrows above."))
    return 1 if r.failed else 0
