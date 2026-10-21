#!/usr/bin/env python3
"""
Build fixtures for dsp.test.mjs: synthetic "pedals" run through the original
analysis in tools/measure.py, so the JavaScript port can be checked against it.

    python3 web/test/dsp_reference.py

No hardware is involved: a fake rig stands in for the pedal, and sounddevice is
replaced with an object that raises on any use.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from scipy import signal as sps
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import measure  # noqa: E402


class _NoDevice:
    def __getattr__(self, name):
        raise RuntimeError(f"sounddevice.{name} touched while building fixtures")


measure.sd = _NoDevice()

FS = measure.FS
DELAY = 12000
OUT = Path(__file__).resolve().parent / "fixtures"
OUT.mkdir(exist_ok=True)
(OUT / ".gitignore").write_text("*\n")

arrays: dict[str, dict] = {}
expected: dict = {}


def save(name: str, x) -> str:
    x = np.ascontiguousarray(x)
    kind = "f64" if x.dtype == np.float64 else "f32"
    x.astype("<f8" if kind == "f64" else "<f4").tofile(OUT / f"{name}.bin")
    arrays[name] = {"type": kind, "length": int(len(x))}
    return name


# --- the fake pedal --------------------------------------------------------

def peaking(f0, gain_db, q):
    """RBJ peaking biquad as one sos row."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / FS
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w), 1 - alpha * a]
    den = [1 + alpha / a, -2 * np.cos(w), 1 - alpha / a]
    return np.array([[*(v / den[0] for v in b), *(v / den[0] for v in den)]])


SOS_EQ = np.vstack([
    sps.butter(2, 40, "highpass", fs=FS, output="sos"),
    peaking(800, 6, 1.0),
    sps.butter(2, 5000, "lowpass", fs=FS, output="sos"),
])


def eq(x):
    return sps.sosfilt(SOS_EQ, x)


def saturate(x, drive):
    return np.tanh(drive * x) / drive


def make_reverb(rt60, mix, seed):
    rng = np.random.default_rng(seed)
    t = np.arange(int(FS * rt60 * 1.5)) / FS
    ir = rng.normal(size=len(t)) * np.exp(-6.91 * t / rt60)
    ir[: int(FS * 0.01)] = 0  # pre-delay
    ir *= mix / np.sqrt(np.sum(ir ** 2))
    return lambda x: x + sps.fftconvolve(x, ir)[: len(x)]


def compressor(threshold_dbfs=-30, ratio=4, attack=0.008, release=0.12, makeup_db=6):
    """Feed-forward RMS compressor with smoothed gain, one sample at a time."""
    det = np.exp(-1 / (0.005 * FS))
    att, rel = np.exp(-1 / (attack * FS)), np.exp(-1 / (release * FS))

    def process(x):
        y = np.empty_like(x)
        power, gr = 0.0, 0.0
        for i, v in enumerate(x):
            power = det * power + (1 - det) * v * v
            over = 10 * math.log10(power + 1e-20) + 3.01 - threshold_dbfs
            target = over * (1 - 1 / ratio) if over > 0 else 0.0
            coef = att if target > gr else rel
            gr = coef * gr + (1 - coef) * target
            y[i] = v * 10 ** ((makeup_db - gr) / 20)
        return y
    return process


class FakeRig:
    """Duck-types measure.Rig: run() delays and processes instead of playing."""

    def __init__(self, process, noise=1e-5, latency=None):
        self.process, self.noise, self.latency = process, noise, latency
        self.log = []

    def wait_for_quiet(self, **_):
        pass

    def run(self, signal, tail=0.3, align=True):
        signal = np.asarray(signal, dtype="float32")
        shift = 0
        if align:
            shift = self.latency if self.latency is not None else measure.Rig.calibrate(self)
            tail += shift / FS
        pad = np.zeros(int(FS * tail), dtype="float32")
        mono = np.concatenate([signal, pad])
        y = np.concatenate([np.zeros(DELAY), self.process(mono.astype(np.float64))])[: len(mono)]
        y = y + np.random.default_rng(len(self.log) + 1).normal(0, self.noise, len(y))
        wet = y.astype("float32")[shift:]
        self.log.append((signal, wet))
        return wet, np.zeros(len(wet), dtype="float32")


def jsonable(x):
    if isinstance(x, dict):
        return {str(k): jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    if isinstance(x, np.bool_):
        return bool(x)
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.floating):
        return float(x)
    return x


# --- test signals and the measurement suite ----------------------------------

def build_signals():
    expected["signals"] = {
        "sweepCal": save("sig_sweep_cal", measure.sweep(100, 10000, 0.5, -24)),
        "sweep24": save("sig_sweep24", measure.sweep(20, 20000, 6.0, -24)),
        "tone110": save("sig_tone110", measure.tone(110, 0.9, -12)),
        "tone55": save("sig_tone55", measure.tone(55, 0.8, -60)),
    }


def build_suite(tag, rig, rig_dyn):
    rig.latency = None
    latency = measure.Rig.calibrate(rig)
    played, wet = rig.log[-1]
    calib = {"played": save(f"{tag}_cal_played", played), "recorded": save(f"{tag}_cal_wet", wet),
             "latency": int(latency)}

    responses = []
    for level in measure.SWEEP_LEVELS_DBFS:
        result = measure.measure_response(rig, level)
        played, wet = rig.log[-1]
        responses.append({"played": save(f"{tag}_resp{-level}_played", played),
                          "recorded": save(f"{tag}_resp{-level}_wet", wet),
                          "level": level, "expected": result})
        if level == measure.SWEEP_LEVELS_DBFS[0]:
            ir = measure.impulse_response(played, wet)
            calib["ir"] = save(f"{tag}_ir", ir[: FS * 2])
            calib["irPlayed"], calib["irRecorded"] = responses[-1]["played"], responses[-1]["recorded"]

    start = len(rig.log)
    distortion = measure.measure_distortion(rig)
    dist_cases = []
    for i, (res, (_, wet)) in enumerate(zip(distortion, rig.log[start:])):
        dist_cases.append({"wet": save(f"{tag}_dist{i}", wet), "freq": res["freqHz"],
                           "level": res["levelDbfs"], "expected": res})

    noise = measure.measure_noise(rig)
    noise_case = {"wet": save(f"{tag}_noise", rig.log[-1][1]), "expected": noise}

    start = len(rig_dyn.log)
    dyn = measure.measure_dynamics(rig_dyn)
    runs = rig_dyn.log[start:]
    ladder = [{"wet": save(f"{tag}_ladder{i}", wet), "level": lv, "expected": point}
              for i, (lv, (_, wet), point) in enumerate(zip(measure.LADDER_DBFS, runs, dyn["staticCurve"]))]
    step_signal, step_wet = runs[-1]
    step = {"signal": save(f"{tag}_step_signal", step_signal), "wet": save(f"{tag}_step_wet", step_wet),
            "expected": dyn}

    report = {"noise": noise, "response": [r["expected"] for r in responses],
              "distortion": distortion, "dynamics": dyn, "seconds": 151.3}
    return {"calibration": calib, "response": responses, "distortion": dist_cases,
            "noise": noise_case, "ladder": ladder, "step": step}, report


# --- a played take -----------------------------------------------------------

def synth_take(seconds=20.0, seed=7):
    """Plucked bass-like notes with gaps, varying velocity, then silence.
    Returns the take and a matching sub-octave voice for the octaver pedal."""
    rng = np.random.default_rng(seed)
    n = int(FS * seconds)
    x, sub = np.zeros(n), np.zeros(n)
    notes = [55.0, 61.74, 73.42, 82.41, 98.0, 110.0, 146.83, 196.0]
    t0 = 0.3
    while t0 < seconds - 3.0:
        f0, dur, amp = rng.choice(notes), rng.uniform(0.4, 1.2), rng.uniform(0.06, 0.4)
        i0, m = int(FS * t0), int(FS * dur)
        t = np.arange(m) / FS
        shape = (1 - np.exp(-t / 0.002)) * np.minimum(1, (m - np.arange(m)) / (FS * 0.03))
        note = sum(amp / h ** 1.1 * np.exp(-t * (1.0 + 0.6 * h)) * np.sin(2 * np.pi * h * f0 * t + rng.uniform(0, 6.28))
                   for h in range(1, 11))
        x[i0 : i0 + m] += note * shape
        sub[i0 : i0 + m] += amp * 0.9 * np.exp(-t * 1.0) * np.sin(2 * np.pi * f0 / 2 * t) * shape
        t0 += dur + rng.uniform(0.0, 0.3)
    scale = 0.6 / np.max(np.abs(x))
    return x * scale + rng.normal(0, 3e-5, n), sub * scale


def build_takes():
    dry64, sub = synth_take()
    dry = dry64.astype("float32")
    expected["takeDry"] = save("take_dry", dry)
    rev = make_reverb(1.5, 0.5, seed=3)

    def tremolo(x):
        t = np.arange(len(x)) / FS
        return eq(x) * 10 ** (-9 / 20 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.0 * t)))

    octave_wet = eq(dry64 + sub)

    def octaver(x):
        return np.concatenate([octave_wet, np.zeros(max(len(x) - len(octave_wet), 0))])[: len(x)]

    pedals = {
        "clean": lambda x: 0.7 * x,
        "reverb": lambda x: rev(eq(x)),
        "tremolo": tremolo,
        "octave": octaver,
    }
    takes = {}
    for name, process in pedals.items():
        rig = FakeRig(process, noise=2e-5, latency=DELAY)
        trimmed = measure.reamp(dry, rig=rig)
        wet = rig.log[-1][1]
        analysis = measure.analyze_performance(dry, trimmed)
        takes[name] = {"wet": save(f"take_{name}_wet", wet), "lag": int(len(wet) - len(trimmed)),
                       "expected": jsonable(analysis), "summary": measure.performance_summary(analysis)}
    expected["takes"] = takes


# --- numpy semantics the port depends on -----------------------------------

def build_numpy():
    rng = np.random.default_rng(11)
    a = rng.normal(size=3001)
    b = rng.normal(size=1000)
    xs = np.sort(rng.uniform(-60, 0, 500))
    ys = 0.002 * xs ** 3 + 0.1 * xs ** 2 - xs + 3 + rng.normal(size=500)
    rf = rng.normal(size=4096)
    spec = np.fft.rfft(rf)
    spec_pad = np.fft.rfft(rf[:3000], 8192)
    freqs = np.fft.rfftfreq(1 << 16, 1 / FS)[1:]
    mags = 20 * np.log10(np.abs(np.sin(freqs / 900)) + 0.05) + rng.normal(size=len(freqs)) * 3
    round_cases = [0.0025, 2.675, 0.125, -0.125, 0.25, -0.05, 1.005, 12.25, -2.5, 3.5, 0.285,
                   -0.04, 7.45, 99.995, 1e-5, 123.456789, -0.0]
    fmt_cases = [0.25, -0.05, 2.675, 0.125, -0.04, -0.0, 12.5, -12.5, 3.14159, 1e-5, -6.95]
    repr_cases = [250.0, 0.002, 12.0, -63.4, 1e-5, 0.0001, 123456789.0, 1e16, 0.1 + 0.2, -0.0]
    expected["numpy"] = {
        "a": save("np_a", a), "b": save("np_b", b),
        "convSame": {m: save(f"np_conv{m}", np.convolve(a, np.ones(m) / m, "same")) for m in (5, 48, 960)},
        "convSameStep": save("np_conv960_240", np.convolve(a, np.ones(960) / 960, "same")[::240]),
        "percentile": {str(q): [float(np.percentile(a, q)), float(np.percentile(b, q))] for q in (5, 50, 95, 37.3)},
        "median": [float(np.median(a)), float(np.median(b))],
        "polyX": save("np_polyx", xs), "polyY": save("np_polyy", ys),
        "polyfit": np.polyfit(xs, ys, 3).tolist(),
        "polyval": save("np_polyval", np.polyval(np.polyfit(xs, ys, 3), xs)),
        "hanning7": np.hanning(7).tolist(), "hanning12000Sum": float(np.hanning(12000).sum()),
        "interp": [float(np.interp(v, xs, ys)) for v in (-55.5, xs[10], -1e-3, -70, 5)],
        "interpAt": [-55.5, float(xs[10]), -1e-3, -70, 5],
        "rfftIn": save("np_rfft_in", rf), "rfftRe": save("np_rfft_re", spec.real), "rfftIm": save("np_rfft_im", spec.imag),
        "rfftPadRe": save("np_rfftpad_re", spec_pad.real), "rfftPadIm": save("np_rfftpad_im", spec_pad.imag),
        "smoothFreqs": save("np_smooth_f", freqs), "smoothMags": save("np_smooth_m", mags),
        "smoothOut": save("np_smooth_out", measure.smooth_octave(freqs, mags)),
        "round": [[v, nd, round(v, nd), float(np.round(np.float64(v), nd))] for v in round_cases for nd in (0, 1, 2, 3)],
        "format": [[v, spec_, format(v, spec_)] for v in fmt_cases for spec_ in ("+.1f", ".1f", "+.0f", ".0f", "+5.1f")],
        "repr": [[v, str(v)] for v in repr_cases],
        "pow": {"2^(1/12)": 2 ** (1 / 12), "2^(1/6)": 2 ** (1 / 6), "10^-1.5": 10 ** (-30 / 20),
                "10^-2.5": 10 ** (-50 / 20), "10^-3": 10 ** (-60 / 20)},
    }


# --- WAV files -----------------------------------------------------------------

def _riff(fmt_chunk: bytes, data: bytes, extra: bytes = b"") -> bytes:
    body = b"WAVE" + fmt_chunk + extra + b"data" + struct.pack("<I", len(data)) + data
    if len(data) % 2:
        body += b"\x00"
    return b"RIFF" + struct.pack("<I", len(body)) + body


def build_wavs():
    rng = np.random.default_rng(5)
    stereo = np.clip(rng.normal(0, 0.3, (999, 2)), -1, 1 - 2 ** -23)
    cases = []

    def add(name, path, channels):
        cases.append({"file": path.name, "rate": FS if name != "rate44" else 44100,
                      "channels": [save(f"wav_{name}_ch{c}", np.asarray(ch, dtype="float32")) for c, ch in enumerate(channels)]})

    i16 = np.round(stereo * 32767).astype("<i2")
    wavfile.write(OUT / "w_int16.wav", FS, i16)
    add("int16", OUT / "w_int16.wav", [i16[:, c] / 32768 for c in range(2)])

    i32 = np.round(stereo[:, 0] * 2 ** 31 * 0.999).astype("<i4")
    wavfile.write(OUT / "w_int32.wav", 44100, i32)
    add("rate44", OUT / "w_int32.wav", [i32 / 2 ** 31])

    f32 = stereo.astype("<f4")
    wavfile.write(OUT / "w_float32.wav", FS, f32)
    add("float32", OUT / "w_float32.wav", [f32[:, 0], f32[:, 1]])

    f64 = stereo[:, 1].copy()
    wavfile.write(OUT / "w_float64.wav", FS, f64)
    add("float64", OUT / "w_float64.wav", [f64])

    # 24-bit PCM written by hand, with an odd-sized chunk before the data.
    i24 = np.round(stereo * (2 ** 23 - 1)).astype(np.int32)
    raw = b"".join(int(v & 0xFFFFFF).to_bytes(3, "little") for v in i24.reshape(-1))
    fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, FS, FS * 6, 6, 24)
    odd = b"LIST" + struct.pack("<I", 5) + b"abcde" + b"\x00"
    (OUT / "w_int24.wav").write_bytes(_riff(fmt, raw, odd))
    add("int24", OUT / "w_int24.wav", [i24[:, c] / 2 ** 23 for c in range(2)])

    # WAVE_FORMAT_EXTENSIBLE: 24-bit PCM mono, and 32-bit float stereo.
    def ext(channels, bits, sub):
        guid = struct.pack("<H", sub) + b"\x00\x00\x00\x00\x10\x00\x80\x00\x00\xaa\x00\x38\x9b\x71"
        block = channels * bits // 8
        return b"fmt " + struct.pack("<IHHIIHHHHI", 40, 0xFFFE, channels, FS, FS * block, block, bits, 22, bits, 0) + guid

    raw = b"".join(int(v & 0xFFFFFF).to_bytes(3, "little") for v in i24[:, 0])
    (OUT / "w_ext24.wav").write_bytes(_riff(ext(1, 24, 1), raw))
    add("ext24", OUT / "w_ext24.wav", [i24[:, 0] / 2 ** 23])
    (OUT / "w_extf32.wav").write_bytes(_riff(ext(2, 32, 3), f32.tobytes()))
    add("extf32", OUT / "w_extf32.wav", [f32[:, 0], f32[:, 1]])
    expected["wav"] = cases


def main():
    build_signals()
    build_numpy()
    build_wavs()

    room = make_reverb(0.9, 0.3, seed=1)
    rig_a = FakeRig(lambda x: room(saturate(eq(x), 3.0)))
    rig_b = FakeRig(eq)
    rig_comp = FakeRig(compressor(), latency=DELAY)
    rig_sat = FakeRig(lambda x: saturate(x, 6.0), latency=DELAY)
    rig_dead = FakeRig(lambda x: 0 * x, latency=DELAY)

    suite_a, report_a = build_suite("a", rig_a, rig_comp)
    suite_b, report_b = build_suite("b", rig_b, rig_sat)
    dead = measure.measure_dynamics(rig_dead)
    expected["suites"] = {"a": suite_a, "b": suite_b}
    expected["deadStep"] = {"wet": save("dead_step_wet", rig_dead.log[-1][1]), "expected": dead}

    report_q = {"noise": report_a["noise"], "response": report_a["response"][:1], "seconds": 20.4}
    report_e = dict(report_b, dynamics=dead)
    reports = {"a": report_a, "b": report_b, "q": report_q, "e": report_e}
    reports = json.loads(json.dumps(jsonable(reports)))  # what the JSON on disk holds
    expected["reports"] = reports
    expected["summaries"] = {k: measure.summary(r) for k, r in reports.items()}
    expected["compares"] = {f"{x}{y}": measure.compare(reports[x], reports[y])
                            for x, y in (("a", "b"), ("b", "a"), ("q", "a"), ("a", "a"))}

    build_takes()

    expected["arrays"] = arrays
    (OUT / "expected.json").write_text(json.dumps(jsonable(expected), indent=1))
    print(f"{len(arrays)} arrays written to {OUT}")


if __name__ == "__main__":
    main()
