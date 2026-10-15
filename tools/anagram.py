"""
Talk to a Darkglass Anagram over USB.

The device exposes a vendor HID interface (usage page 0xFF00, 64-byte reports).
Requests and replies are JSON wrapped in DSTART/DEND and split across reports:

    report = [0x01] + 63 payload bytes, zero padded
    frame  = "DSTART" + {"action": ..., "payload": ...} + "DEND"

One extra all-padding report is sent after the last chunk, and replies are
reassembled by stripping 0x00/0x01 bytes and parsing between the markers.

Requires: pip install hidapi   (the `hid` package works too)
"""

from __future__ import annotations

import json
import time
import uuid as _uuid
from typing import Any

try:
    import hid
except ImportError as exc:  # pragma: no cover
    raise SystemExit("This needs the hidapi package: pip install hidapi") from exc

VENDOR_ID = 0x2FA6
PRODUCT_ID = 0x2500
REPORT_SIZE = 64
TAG_BYTE = 0x01
CHUNK = REPORT_SIZE - 1
START, END = b"DSTART", b"DEND"

# Device limits, from mod-connector's build config for this model.
MAX_ROWS = 2
MAX_SLOTS = 12
SCENES = (1, 2, 3)
PRESETS_PER_BANK = 3
MAX_PRESET_SLOT = 126  # 42 banks x 3


def slot_label(filename: str | int) -> str:
    """"49.json" -> "17A". Banks hold three presets and the file name is the slot."""
    n = int(str(filename).split(".")[0])
    return f"{(n - 1) // PRESETS_PER_BANK + 1:02d}{'ABC'[(n - 1) % PRESETS_PER_BANK]}"


def slot_filename(label: str) -> str:
    """"17A" -> "49.json". The inverse of slot_label()."""
    label = label.strip().upper()
    bank, letter = int(label[:-1]), label[-1]
    if letter not in "ABC" or not 1 <= bank <= MAX_PRESET_SLOT // PRESETS_PER_BANK:
        raise ValueError(f'"{label}" is not a slot like 17A.')
    return f"{(bank - 1) * PRESETS_PER_BANK + 'ABC'.index(letter) + 1}.json"


class AnagramError(RuntimeError):
    """The device refused a request, or did not answer."""


def new_uuid() -> str:
    """A fresh preset id in the device's own shape: 56 hex digits, 16-8-8-24."""
    raw = (_uuid.uuid4().hex + _uuid.uuid4().hex)[:56]
    return f"{raw[:16]}-{raw[16:24]}-{raw[24:32]}-{raw[32:]}"


class Anagram:
    """A live connection to the Anagram's control interface."""

    def __init__(self, timeout: float = 20.0, open_timeout: float = 10.0):
        self.timeout = timeout
        self.open_timeout = open_timeout
        self._dev: Any = None

    # -- connection ---------------------------------------------------
    @staticmethod
    def _open_path(path: bytes):
        """Open a HID path under either of the two rival python hid packages."""
        if hasattr(hid, "device"):          # the `hidapi` package
            dev = hid.device()
            dev.open_path(path)
            dev.set_nonblocking(0)
            return dev
        return hid.Device(path=path)        # the `hid` package

    def open(self) -> "Anagram":
        if self._dev is not None:
            return self                       # already ours; opening twice fails
        found = list(hid.enumerate(VENDOR_ID, PRODUCT_ID))
        if not found:
            raise AnagramError("No Anagram is plugged in.")
        # the control interface is the vendor-defined one; fall back to any
        candidates = [i for i in found if i.get("usage_page") in (0xFF, 0xFF00)] or found
        failures = []
        # Other HID clients on the machine (vendor control panels, Logitech
        # Options and friends) poll devices and hold them briefly, so opening is
        # a race worth retrying rather than a verdict.
        deadline = time.monotonic() + self.open_timeout
        delay = 0.15
        while True:
            for info in candidates:
                try:
                    self._dev = self._open_path(info["path"])
                    return self
                except Exception as exc:                  # noqa: BLE001 - report it
                    last = f"{info['path']!r}: {type(exc).__name__}: {exc}"
            if time.monotonic() >= deadline:
                failures.append(last)
                break
            time.sleep(delay)
            delay = min(delay * 1.6, 1.0)
        raise AnagramError(
            "The Anagram is plugged in but its control interface would not open. "
            "Quit Darkglass Suite and close any browser tab connected to the pedal - "
            "they hold it exclusively.\n  " + "\n  ".join(failures)
        )

    def close(self) -> None:
        if self._dev is not None:
            self._dev.close()
            self._dev = None

    def __enter__(self) -> "Anagram":
        return self.open()

    def __exit__(self, *_exc) -> None:
        self.close()

    # -- transport ----------------------------------------------------
    def call(self, action: str, payload: dict | None = None, timeout: float | None = None) -> dict:
        """Send one action and return the decoded reply payload."""
        if self._dev is None:
            raise AnagramError("Not connected - call open() first.")
        limit = self.timeout if timeout is None else timeout
        frame = START + json.dumps({"action": action, "payload": payload or {}}).encode() + END

        # drain anything the device left over from a previous exchange
        while self._read(1):
            pass

        reports = (len(frame) + CHUNK - 1) // CHUNK + 1  # the last one is a flush frame
        for i in range(reports):
            buf = bytearray(REPORT_SIZE)
            buf[0] = TAG_BYTE
            piece = frame[i * CHUNK : (i + 1) * CHUNK]
            buf[1 : 1 + len(piece)] = piece
            self._dev.write(bytes(buf))
            time.sleep(0.01)

        acc = bytearray()
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            chunk = self._read(200)
            if not chunk:
                continue
            acc.extend(b for b in chunk if b not in (0x00, TAG_BYTE))
            text = bytes(acc)
            start, stop = text.find(START), text.rfind(END)
            if start != -1 and stop > start:
                body = text[start + len(START) : stop].decode("utf-8", "replace")
                try:
                    reply = json.loads(body)
                except json.JSONDecodeError as exc:
                    raise AnagramError(f"Device sent malformed JSON: {exc}") from exc
                return reply.get("payload", {})
        raise AnagramError(
            f'No reply to "{action}" within {limit:g}s. '
            "A wrong payload shape makes the device answer nothing at all."
        )

    def _read(self, timeout_ms: int) -> bytes:
        try:
            return bytes(self._dev.read(REPORT_SIZE, timeout_ms))
        except TypeError:                   # the `hid` package names it differently
            return bytes(self._dev.read(REPORT_SIZE, timeout=timeout_ms))

    # -- reads --------------------------------------------------------
    def firmware(self) -> dict:
        return self.call("fetch_firmware_version")["data"]

    def plugins(self, which: str = "ALL") -> list[dict]:
        """which: ALL | FACTORY | USER. Returns [{uri, version, type}]."""
        return self.call("read_all_plugins", {"filterOption": which})["data"]

    def block_info(self, uri: str) -> dict:
        """Full metadata for one block: name, abbreviation, category, ports."""
        return self.call("get_plugin_info", {"uri": uri})["data"]

    def preset_slots(self) -> list[dict]:
        """Every stored preset in the order the pedal shows them: {filename, id, name}."""
        return self.call("get_anagram_preset_positions")["data"]["files"]

    def preset_count(self) -> int:
        return self.call("get_anagram_presets_info")["data"]["length"]

    def get_preset(self, filename: str) -> dict | None:
        """One preset document, or None when that slot is empty."""
        data = self.call("fetch_anagram_preset", {"filename": filename})
        content = (data.get("data") or {}).get("presetFile") or {}
        return content.get("content") or None

    def get_presets(self, start: int = 0, count: int = 7) -> list[dict]:
        """A page of presets by position: [{name, content}]."""
        return self.call("fetch_anagram_presets", {"from": start, "amount": count})["data"]["presets"]

    def user_files(self, directory: str, page: int = 1) -> list[dict]:
        """directory: cabinets | neural-models | presets | ... (page starts at 1)."""
        return self.call("find_user_files", {"pageNum": page, "selectedDir": directory})["data"]

    def logs(self) -> str:
        """The device journal since boot - every request it received is in here."""
        return self.call("export_anagram_logs", {}, timeout=45)["message"]

    # -- writes -------------------------------------------------------
    def save_preset(self, filename: str, document: dict) -> dict:
        """
        Write a preset into a slot, replacing whatever is there.

        `filename` is the slot's file name, e.g. "49.json" for 17A - see
        slot_filename(). The device writes it to /data/user-files/presets/ and
        keeps the uuid the document carries, so give a new preset a fresh one.
        """
        return self.call(
            "edit_anagram_presets",
            {"presets": [{"name": filename, "content": document}]},
            timeout=30,
        )

    def delete_preset(self, filename: str) -> dict:
        """Remove a preset from its slot for good."""
        return self.call("delete_anagram_preset", {"filename": filename}, timeout=25)

    def audition(self, document: dict) -> dict:
        """
        Load a preset into the live chain without saving it.

        `document` is a whole preset file: {"preset": {...}, "type": "preset", "version": 1}.
        The pedal plays it until someone selects a preset again.
        """
        return self.call("try_anagram_preset", {"presetData": document, "type": 0}, timeout=25)
