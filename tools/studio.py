"""
Tone studio: a local web page where the player and the assistant work on a tone
together.

The page measures, records and reamps through the pedal, and plots the results.
The assistant works on the same material from the command line. Neither talks to
the other directly - they share a folder:

    studio/
      measurements/<id>.json   every `measure`, from the page or the CLI
      takes/<id>.json          every capture or reamp, with -dry.wav / -wet.wav
      targets/<name>.json      curves the assistant wants the result compared to
      messages.jsonl           the conversation, one message per line
      .claude-read             how far the assistant has read

So whatever either side does shows up for the other, the page needs no API key,
and any agent that can run a shell command can take part.

    python3 tools/cli.py studio            # then open http://localhost:8765

Standard library only, apart from the measuring code it calls.
"""

from __future__ import annotations

import json
import math
import mimetypes
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent / "studio"
PAGE = HERE / "studio.html"


# --- shared storage, used by the page's server and the CLI alike --------------

def _dir(name: str) -> Path:
    path = ROOT / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def new_id(label: str = "") -> str:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    slug = "".join(c if c.isalnum() else "-" for c in label.lower()).strip("-")[:24]
    return f"{stamp}-{slug or uuid.uuid4().hex[:4]}"


def save_measurement(report: dict, label: str, slot: str | None = None, by: str = "claude") -> str:
    ident = new_id(label)
    meta = {"id": ident, "label": label or ident, "slot": slot, "by": by, "created": time.time()}
    (_dir("measurements") / f"{ident}.json").write_text(json.dumps({**meta, "report": report}))
    return ident


def save_take(analysis: dict, label: str, dry=None, wet=None, slot: str | None = None,
              source: str | None = None, by: str = "claude") -> str:
    ident = new_id(label)
    folder = _dir("takes")
    files = {}
    if dry is not None or wet is not None:
        import numpy as np
        from scipy.io import wavfile
        for kind, data in (("dry", dry), ("wet", wet)):
            if data is not None:
                name = f"{ident}-{kind}.wav"
                wavfile.write(folder / name, 48000, np.asarray(data, dtype="float32"))
                files[kind] = f"takes/{name}"
    if source and "dry" not in files:
        files["dry"] = source
    meta = {"id": ident, "label": label or ident, "slot": slot, "by": by,
            "created": time.time(), "files": files, "analysis": analysis}
    (folder / f"{ident}.json").write_text(json.dumps(meta))
    return ident


def save_target(name: str, points: dict[float, float], note: str = "") -> str:
    """A target curve from a few (Hz, dB) points, spread across the report bands
    by interpolating on a log-frequency axis."""
    from measure import BANDS_HZ
    xs = sorted(points)
    gains = {}
    for f in BANDS_HZ:
        if f <= xs[0]:
            g = points[xs[0]]
        elif f >= xs[-1]:
            g = points[xs[-1]]
        else:
            hi = next(i for i, x in enumerate(xs) if x >= f)
            lo = hi - 1
            t = (math.log(f) - math.log(xs[lo])) / (math.log(xs[hi]) - math.log(xs[lo]))
            g = points[xs[lo]] + t * (points[xs[hi]] - points[xs[lo]])
        gains[str(f)] = round(g, 2)
    slug = "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-") or "target"
    (_dir("targets") / f"{slug}.json").write_text(json.dumps(
        {"id": slug, "name": name, "note": note, "gainDb": gains,
         "points": {str(k): v for k, v in points.items()}, "created": time.time()}))
    return slug


def post_message(text: str, sender: str) -> dict:
    message = {"id": uuid.uuid4().hex[:10], "from": sender, "text": text.strip(), "ts": time.time()}
    with (ROOT / "messages.jsonl").open("a") as fh:
        fh.write(json.dumps(message, ensure_ascii=False) + "\n")
    return message


def messages() -> list[dict]:
    path = ROOT / "messages.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def unread_for_claude(mark_read: bool = True) -> list[dict]:
    """The player's messages the assistant has not seen yet."""
    marker = ROOT / ".claude-read"
    seen = float(marker.read_text()) if marker.exists() else 0.0
    fresh = [m for m in messages() if m["from"] == "user" and m["ts"] > seen]
    if mark_read and fresh:
        _dir(".")
        marker.write_text(str(max(m["ts"] for m in fresh)))
    return fresh


def _load_all(name: str) -> list[dict]:
    folder = ROOT / name
    if not folder.exists():
        return []
    items = []
    for path in folder.glob("*.json"):
        try:
            items.append(json.loads(path.read_text()))
        except (OSError, ValueError):
            continue
    return sorted(items, key=lambda x: x.get("created", 0))


# --- the page's server --------------------------------------------------------

class Studio:
    """One audio job at a time; the page polls for progress."""

    def __init__(self):
        self.lock = threading.Lock()
        self.job: dict | None = None
        self.live = {"peakDb": -120.0, "rmsDb": -120.0}
        self.rig = None
        self.audio_lock = threading.Lock()

    def _refresh_audio(self) -> None:
        """Re-read the system's audio devices.

        PortAudio lists devices once, when it starts, and keeps the CoreAudio
        object it found. A long-running server outlives that: when macOS
        re-enumerates the pedal - replugged, woken, reconfigured - the old object
        is gone and opening a stream fails with '!obj'. A one-shot CLI process
        never notices; this server has to refresh before every job."""
        import sounddevice as sd
        sd._terminate()
        sd._initialize()
        self.rig = None

    def _rig(self):
        if self.rig is None:
            import measure
            self.rig = measure.Rig()
        return self.rig

    def device(self) -> dict:
        try:
            import measure
            if not self.lock.locked() and self.audio_lock.acquire(blocking=False):
                try:
                    self._refresh_audio()
                finally:
                    self.audio_lock.release()
            measure.find_device()
            return {"audio": True}
        except Exception as exc:  # noqa: BLE001
            return {"audio": False, "error": str(exc)}

    def start(self, kind: str, label: str, seconds: float, work) -> dict:
        if not self.lock.acquire(blocking=False):
            return {"error": f"busy: {self.job['kind'] if self.job else 'working'}"}
        self.job = {"kind": kind, "label": label, "started": time.time(), "expect": seconds}

        def run():
            try:
                self._refresh_audio()
                self.job["result"] = work()
            except Exception as exc:  # noqa: BLE001
                self.job["error"] = f"{type(exc).__name__}: {exc}"
                post_message(f"{kind} failed - {self.job['error']}", "system")
            finally:
                self.job["done"] = time.time()
                self.lock.release()

        threading.Thread(target=run, daemon=True).start()
        return {"ok": True}

    def goto(self, slot: str | None):
        if not slot:
            return
        from anagram import slot_filename
        from midi import AnagramMidi
        number = int(slot_filename(slot).split(".")[0])
        with AnagramMidi() as m:
            m.goto_slot(number)
        time.sleep(1.5)

    # jobs ----------------------------------------------------------------
    def measure(self, label: str, quick: bool, slot: str | None) -> dict:
        def work():
            import measure
            self.goto(slot)
            report = measure.measure_all(self._rig(), quick=quick,
                                         notify=lambda text: post_message(text, "system"))
            return save_measurement(report, label, slot, by="user")
        return self.start("measure", label, 14 if quick else 85, work)

    def capture(self, label: str, seconds: float) -> dict:
        def work():
            import numpy as np
            import sounddevice as sd
            import measure
            rig = self._rig()
            blocks = []

            def callback(indata, frames, t, status):  # noqa: ARG001
                blocks.append(indata.copy())
                dry = indata[:, measure.DRY_IN - 1]
                peak = float(np.max(np.abs(dry))) if len(dry) else 0.0
                self.live = {"peakDb": round(measure.db(peak), 1),
                             "rmsDb": round(measure.db(measure.rms(dry)), 1)}

            with sd.InputStream(device=rig.device, channels=3, samplerate=measure.FS,
                                blocksize=2048, callback=callback):
                time.sleep(seconds)
            rec = np.concatenate(blocks) if blocks else np.zeros((0, 3), "float32")
            dry, wet = rec[:, measure.DRY_IN - 1], rec[:, :2].mean(axis=1)
            analysis = measure.analyze_performance(dry, wet)
            return save_take(analysis, label, dry=dry, wet=wet, by="user")
        return self.start("capture", label, seconds, work)

    def reamp(self, take_id: str, label: str, slot: str | None) -> dict:
        def work():
            import numpy as np
            from scipy.io import wavfile
            import measure
            take = json.loads((ROOT / "takes" / f"{take_id}.json").read_text())
            source = take["files"]["dry"]
            _, dry = wavfile.read(ROOT / source)
            dry = np.asarray(dry, dtype="float32")
            self.goto(slot)
            wet = measure.reamp(dry, self._rig())
            analysis = measure.analyze_performance(dry, wet)
            return save_take(analysis, label, wet=wet, slot=slot, source=source, by="user")
        take_path = ROOT / "takes" / f"{take_id}.json"
        if not take_path.exists():
            return {"error": "no such take"}
        seconds = json.loads(take_path.read_text())["analysis"].get("seconds", 20) + 4
        return self.start("reamp", label, seconds, work)

    def state(self) -> dict:
        job = None
        if self.job:
            job = {k: v for k, v in self.job.items() if k != "result"}
            job["result"] = self.job.get("result")
            if job.get("done") and time.time() - job["done"] > 8:
                job = None
        return {
            "device": self.device(),
            "job": job,
            "live": self.live if job and job["kind"] == "capture" and not job.get("done") else None,
            "measurements": _load_all("measurements"),
            "takes": _load_all("takes"),
            "targets": _load_all("targets"),
            "messages": messages()[-200:],
        }


def make_handler(studio: Studio):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):  # keep the terminal quiet
            pass

        def _send(self, code: int, body: bytes, kind: str):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, data, code: int = 200):
            self._send(code, json.dumps(data, ensure_ascii=False).encode(), "application/json")

        def do_GET(self):  # noqa: N802
            path = urlparse(self.path).path
            if path in ("/", "/index.html"):
                return self._send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
            if path == "/api/state":
                return self._json(studio.state())
            if path.startswith("/files/"):
                target = (ROOT / unquote(path[len("/files/"):])).resolve()
                if ROOT.resolve() not in target.parents or not target.is_file():
                    return self._json({"error": "not found"}, 404)
                kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                return self._send(200, target.read_bytes(), kind)
            return self._json({"error": "not found"}, 404)

        def do_POST(self):  # noqa: N802
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                return self._json({"error": "bad json"}, 400)
            slot = (body.get("slot") or "").strip() or None
            label = (body.get("label") or "").strip()
            if path == "/api/measure":
                return self._json(studio.measure(label or (slot or "current"), bool(body.get("quick")), slot))
            if path == "/api/capture":
                seconds = max(2.0, min(float(body.get("seconds") or 20), 120.0))
                return self._json(studio.capture(label or "take", seconds))
            if path == "/api/reamp":
                return self._json(studio.reamp(body.get("take", ""), label or (slot or "reamp"), slot))
            if path == "/api/goto":
                try:
                    studio.goto(slot)
                    return self._json({"ok": True})
                except Exception as exc:  # noqa: BLE001
                    return self._json({"error": str(exc)}, 500)
            if path == "/api/message":
                text = (body.get("text") or "").strip()
                if not text:
                    return self._json({"error": "empty"}, 400)
                return self._json(post_message(text, "user"))
            if path == "/api/delete":
                kind, ident = body.get("kind"), body.get("id", "")
                if kind not in ("measurements", "takes", "targets") or "/" in ident or not ident:
                    return self._json({"error": "bad request"}, 400)
                for item in (ROOT / kind).glob(f"{ident}*"):
                    item.unlink()
                return self._json({"ok": True})
            return self._json({"error": "not found"}, 404)

    return Handler


def serve(port: int = 8765) -> None:
    _dir(".")
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(Studio()))
    print(f"Tone studio on http://localhost:{port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
