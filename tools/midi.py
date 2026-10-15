"""
Drive the Anagram over USB MIDI.

MIDI rides its own USB interface, so this works alongside the HID control link -
no need to close one to use the other. The pedal needs USB MIDI switched on in
its own MIDI settings.

Every number here was confirmed against a real pedal, or read from Darkglass's
own anagram-midi-control source.

Requires: pip install python-rtmidi
"""

from __future__ import annotations

import time

try:
    import rtmidi
except ImportError as exc:  # pragma: no cover
    raise SystemExit("MIDI needs python-rtmidi: pip install python-rtmidi") from exc

CHANNEL = 0  # MIDI channel 1

# Reserved controllers. Anything not listed is free for your own bindings.
CC_AREA = 0               # area select (bank select MSB)
CC_VOLUME = 7             # master volume
CC_FOOT = (17, 18, 19)    # foot A / B / C
CC_POT = (20, 21, 22, 23, 24, 25)
CC_SUBAREA = 32           # sub-area select (bank select LSB)
CC_MODE = 85              # 1 preset, 2 stomp, 3 scene
CC_TUNER = 86
CC_TAP = 87
CC_EXPRESSION = 89
CC_BANK, CC_BANK_NEXT, CC_BANK_PREV = 102, 103, 104
CC_PRESET_NEXT, CC_PRESET_PREV = 105, 106
CC_SCENE, CC_SCENE_NEXT, CC_SCENE_PREV = 107, 108, 109
CC_LOOPER = {
    "enter": 110, "play": 111, "rec": 112, "clear": 113,
    "undo": 114, "redo": 115, "slot": 116, "next": 117, "prev": 118,
}

MODES = {"preset": 1, "stomp": 2, "scene": 3}
SCENE_DEFAULT = 127


class MidiError(RuntimeError):
    pass


class AnagramMidi:
    """A MIDI output aimed at the Anagram."""

    def __init__(self, port_hint: str = "Anagram"):
        self.port_hint = port_hint
        self._out: "rtmidi.MidiOut | None" = None

    def open(self) -> "AnagramMidi":
        if self._out is not None:
            return self
        out = rtmidi.MidiOut()
        ports = out.get_ports()
        for index, name in enumerate(ports):
            if self.port_hint.lower() in name.lower():
                out.open_port(index)
                self._out = out
                return self
        raise MidiError(
            f'No MIDI output matching "{self.port_hint}". '
            "Plug the pedal in and switch USB MIDI on in its MIDI settings.\n  "
            "Ports seen: " + (", ".join(ports) or "none")
        )

    def close(self) -> None:
        if self._out is not None:
            self._out.close_port()
            self._out = None

    def __enter__(self) -> "AnagramMidi":
        return self.open()

    def __exit__(self, *_exc) -> None:
        self.close()

    # -- raw ----------------------------------------------------------
    def send(self, message: list[int]) -> None:
        if self._out is None:
            raise MidiError("Not connected - call open() first.")
        self._out.send_message(message)
        time.sleep(0.01)

    def cc(self, controller: int, value: int = 1) -> None:
        self.send([0xB0 | CHANNEL, controller & 0x7F, value & 0x7F])

    def program(self, number: int) -> None:
        self.send([0xC0 | CHANNEL, number & 0x7F])

    # -- the useful bits ----------------------------------------------
    def goto_slot(self, slot_number: int) -> None:
        """
        Jump to a preset. The program number is the slot number itself,
        counting from 1, so 17A - the 49th slot - is program 49.
        """
        if not 1 <= slot_number <= 126:
            raise MidiError(f"A program change only reaches slots 1-126, not {slot_number}.")
        self.program(slot_number)

    def set_mode(self, mode: str) -> None:
        """mode: preset | stomp | scene. Decides what the three footswitches do."""
        if mode not in MODES:
            raise MidiError(f"Mode must be one of {', '.join(MODES)}.")
        self.cc(CC_MODE, MODES[mode])

    def set_scene(self, scene: int | str) -> None:
        """A scene number 1-3, "default", or "next"/"prev". Only acts in scene mode."""
        if scene == "next":
            self.cc(CC_SCENE_NEXT)
        elif scene == "prev":
            self.cc(CC_SCENE_PREV)
        elif scene == "default":
            self.cc(CC_SCENE, SCENE_DEFAULT)
        else:
            self.cc(CC_SCENE, int(scene))

    def tuner(self) -> None:
        self.cc(CC_TUNER)

    def tap(self) -> None:
        self.cc(CC_TAP)

    def looper(self, what: str) -> None:
        if what not in CC_LOOPER:
            raise MidiError(f"Looper action must be one of {', '.join(CC_LOOPER)}.")
        self.cc(CC_LOOPER[what])
