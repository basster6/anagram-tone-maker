"""
Measure what a preset actually does to the signal, using the Anagram as its own
audio interface.

The pedal is a 3-in / 9-out USB audio device, and output 9 is a reamp input: audio
sent there runs through the live effects chain and comes back on inputs 1 and 2.
That makes the whole chain measurable with known test signals, no cables needed:

    exponential sine sweep  -> frequency response, latency, reverb decay
    single sine tones       -> harmonic distortion, per order and per level
    a ladder of tone levels -> the static dynamics curve (compression, gating)
    a level step            -> how fast the dynamics react
    silence                 -> the noise floor

Distortion is measured with single tones rather than separated out of the sweep:
a reverb tail smears the sweep's harmonic responses into each other, while a
steady tone's harmonics sit in exact FFT bins and need no interpretation.

Requires: pip install numpy scipy sounddevice
"""

from __future__ import annotations

import math
import time

try:
    import numpy as np
    import sounddevice as sd
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Measuring needs: pip install numpy scipy sounddevice") from exc

FS = 48000
DEVICE_NAME = "Anagram"
OUT_CHANNELS = 9
REAMP_OUT = 9            # 1-based. Host output that feeds the effects chain.
WET_IN = (1, 2)          # 1-based. The chain's output, left and right.
DRY_IN = 3               # 1-based. The instrument jack, before the chain.

# Where to report the frequency response. Dense where bass and guitar tone lives.
BANDS_HZ = [30, 40, 60, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
            1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
            12500, 16000]
DIST_FREQS_HZ = [55, 110, 220, 440, 1000]   # low A on a bass, up through the guitar range
SWEEP_LEVELS_DBFS = [-24, -12]
TONE_LEVELS_DBFS = [-24, -12, -6]
LADDER_DBFS = list(range(-60, 1, 4))


def db(x: float) -> float:
    return 20 * math.log10(max(float(x), 1e-12))


def rms(x) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def find_device() -> int:
    for index, device in enumerate(sd.query_devices()):
        if DEVICE_NAME.lower() in device["name"].lower() and device["max_output_channels"] >= OUT_CHANNELS:
            return index
    raise RuntimeError(
        "No Anagram audio device. Plug it in over USB; Darkglass Suite can stay open, "
        "audio is a separate interface from the control one."
    )


class Rig:
    """Plays into the reamp input and records the chain's output."""

    def __init__(self, device: int | None = None):
        self.device = find_device() if device is None else device
        self.latency: int | None = None   # samples, host buffers and pedal together

    def wait_for_quiet(self, threshold_dbfs: float = -45, hold: float = 1.0,
                       timeout: float = 90, notify=None) -> None:
        """Wait until nobody is playing. The instrument jack feeds the same chain
        as the reamp input, so a note played during a measurement lands in it."""
        started, quiet_since, warned = time.time(), None, False
        while True:
            rec = sd.rec(int(FS * 0.25), samplerate=FS, device=self.device,
                         channels=3, blocking=True)
            loud = db(np.max(np.abs(rec[:, DRY_IN - 1]))) > threshold_dbfs
            now = time.time()
            if not loud:
                quiet_since = quiet_since or now
                if now - quiet_since >= hold:
                    return
            else:
                quiet_since = None
                if not warned and notify:
                    notify("Waiting for you to stop playing - the instrument goes into the same chain.")
                    warned = True
            if now - started > timeout:
                raise RuntimeError("The instrument input never went quiet. Mute the bass and try again.")

    def calibrate(self) -> int:
        """Time the round trip with a short sweep. It is a few hundred milliseconds,
        mostly the computer's audio buffers, and every timed measurement depends
        on subtracting it."""
        played = sweep(100, 10000, 0.5, -24)
        wet, _ = self.run(played, tail=0.6, align=False)
        ir = impulse_response(played, wet)
        self.latency = int(np.argmax(np.abs(ir[: FS])))
        return self.latency

    def run(self, signal, tail: float = 0.3, align: bool = True):
        """Play a mono signal through the chain. Returns (wet, dry) arrays.

        With `align`, the recording is shifted by the round trip so that sample 0
        of the result is where sample 0 of the signal came back."""
        signal = np.asarray(signal, dtype="float32")
        shift = 0
        if align:
            shift = self.latency if self.latency is not None else self.calibrate()
            tail += shift / FS
        pad = np.zeros(int(FS * tail), dtype="float32")
        mono = np.concatenate([signal, pad])
        out = np.zeros((len(mono), OUT_CHANNELS), dtype="float32")
        out[:, REAMP_OUT - 1] = mono
        rec = sd.playrec(out, FS, device=self.device,
                         input_mapping=[*WET_IN, DRY_IN], blocking=True)
        wet = rec[shift:, :2].mean(axis=1)
        return wet, rec[shift:, 2]


# --- signals ---------------------------------------------------------------

def sweep(f1: float, f2: float, seconds: float, level_dbfs: float):
    """Exponential sine sweep with short fades so its ends do not click."""
    t = np.arange(int(FS * seconds)) / FS
    k = math.log(f2 / f1)
    x = np.sin(2 * math.pi * f1 * seconds / k * (np.exp(t * k / seconds) - 1))
    fade = int(FS * 0.02)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, fade))
    x[:fade] *= ramp
    x[-fade:] *= ramp[::-1]
    return (10 ** (level_dbfs / 20) * x).astype("float32")


def tone(freq: float, seconds: float, level_dbfs: float):
    """A sine landing on an exact FFT bin of the analysis window, with soft edges."""
    n = int(FS * seconds)
    t = np.arange(n) / FS
    x = np.sin(2 * math.pi * freq * t)
    fade = int(FS * 0.01)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, fade))
    x[:fade] *= ramp
    x[-fade:] *= ramp[::-1]
    return (10 ** (level_dbfs / 20) * x).astype("float32")


# --- analysis ----------------------------------------------------------------

def impulse_response(played, recorded):
    """Deconvolve by spectral division, regularised outside the swept band."""
    n = 1 << int(math.ceil(math.log2(len(recorded) + len(played))))
    X = np.fft.rfft(played, n)
    Y = np.fft.rfft(recorded, n)
    power = np.abs(X) ** 2
    eps = power.max() * 1e-6
    return np.fft.irfft(Y * np.conj(X) / (power + eps), n)


def smooth_octave(freqs, mags_db, fraction: int = 6):
    """Fractional-octave smoothing on a power basis."""
    power = 10 ** (mags_db / 10)
    out = np.empty_like(mags_db)
    half = 2 ** (1 / (2 * fraction))
    for i, f in enumerate(freqs):
        sel = (freqs >= f / half) & (freqs <= f * half)
        out[i] = 10 * np.log10(power[sel].mean()) if sel.any() else mags_db[i]
    return out


def schroeder_rt60(ir) -> float | None:
    """RT60 from the T20 slope of the backward-integrated energy decay, if any."""
    energy = np.cumsum(ir[::-1] ** 2)[::-1]
    if energy[0] <= 0:
        return None
    edc = 10 * np.log10(energy / energy[0] + 1e-20)
    try:
        start = np.where(edc <= -5)[0][0]
        stop = np.where(edc <= -25)[0][0]
    except IndexError:
        return None
    seconds = (stop - start) / FS
    return round(seconds * 3, 3) if seconds > 0 else None


def measure_response(rig: Rig, level_dbfs: float) -> dict:
    played = sweep(20, 20000, 6.0, level_dbfs)
    wet, _ = rig.run(played, tail=3.0, align=False)
    ir = impulse_response(played, wet)

    peak = int(np.argmax(np.abs(ir[: FS * 2])))
    latency_ms = round(peak / FS * 1000, 2)

    # A 250 ms window holds the speaker, the EQ and early reflections; longer
    # reverb belongs to the decay figure, not the tonal balance.
    start = max(peak - int(FS * 0.005), 0)
    length = int(FS * 0.25)
    segment = ir[start : start + length].copy()
    fade = int(FS * 0.05)
    segment[-fade:] *= np.linspace(1, 0, fade)
    n = 1 << 16
    spectrum = np.abs(np.fft.rfft(segment, n))
    freqs = np.fft.rfftfreq(n, 1 / FS)
    mags = 20 * np.log10(spectrum + 1e-12)
    smoothed = smooth_octave(freqs[1:], mags[1:])
    bands = {str(f): round(float(np.interp(f, freqs[1:], smoothed)), 2) for f in BANDS_HZ}

    tail = ir[peak : peak + FS * 4]
    return {
        "levelDbfs": level_dbfs,
        "roundTripMs": latency_ms,
        "gainDb": bands,
        "rt60s": schroeder_rt60(tail),
    }


def harmonics(signal, freq: float, orders: int = 7) -> dict:
    window = np.hanning(len(signal))
    spectrum = np.abs(np.fft.rfft(signal * window))
    bin_hz = FS / len(signal)

    def level(f):
        k = int(round(f / bin_hz))
        return spectrum[max(k - 2, 0) : k + 3].max() if f < FS / 2 else 0.0

    fundamental = level(freq)
    out = {"fundamentalDbfs": round(db(fundamental * 2 / window.sum()), 2)}
    parts = {}
    for n in range(2, orders + 1):
        parts[n] = level(freq * n)
        out[f"h{n}Db"] = round(db(parts[n] / (fundamental + 1e-20)), 1)
    total = math.sqrt(sum(v ** 2 for v in parts.values()))
    even = math.sqrt(sum(v ** 2 for k, v in parts.items() if k % 2 == 0))
    odd = math.sqrt(sum(v ** 2 for k, v in parts.items() if k % 2 == 1))
    out["thdPct"] = round(100 * total / (fundamental + 1e-20), 2)
    out["evenOddDb"] = round(db(even / (odd + 1e-20)), 1)
    return out


def measure_distortion(rig: Rig) -> list[dict]:
    results = []
    for level in TONE_LEVELS_DBFS:
        for freq in DIST_FREQS_HZ:
            # Long enough for a compressor to settle before the window opens.
            wet, _ = rig.run(tone(freq, 0.9, level), tail=0.05)
            steady = wet[int(FS * 0.5) : int(FS * 0.5) + FS // 4]
            results.append({"freqHz": freq, "levelDbfs": level, **harmonics(steady, freq)})
    return results


def measure_dynamics(rig: Rig, freq: float = 110) -> dict:
    """Output level against input level, then the reaction to a sudden jump."""
    curve = []
    for level in LADDER_DBFS:
        wet, _ = rig.run(tone(freq, 0.8, level), tail=0.02)
        curve.append({"inDbfs": level, "outDbfs": round(db(rms(wet[int(FS * 0.5) : int(FS * 0.75)]) * math.sqrt(2)), 2)})

    # Quiet, loud, quiet, as one unbroken sine whose amplitude steps - separate
    # tones would each fade in and out and leave a hole at every step.
    quiet, loud = -30, -10
    seconds = [0.6, 0.6, 1.0]
    levels = [quiet, loud, quiet]
    amp = np.concatenate([np.full(int(FS * t), 10 ** (lv / 20)) for t, lv in zip(seconds, levels)])
    ramp = int(FS * 0.001)
    amp = np.convolve(amp, np.ones(ramp) / ramp, mode="same")
    t = np.arange(len(amp)) / FS
    wet, _ = rig.run((amp * np.sin(2 * math.pi * freq * t)).astype("float32"), tail=0.05)

    hop, win = int(FS * 0.001), int(FS * 0.004)
    env = np.array([db(rms(wet[i : i + win]) * math.sqrt(2)) for i in range(0, len(wet) - win, hop)])

    # Find the steps in the recording itself rather than trusting the schedule:
    # the round-trip estimate is good to a few milliseconds, and attack times
    # are measured in milliseconds.
    lead = 400
    quiet_gain = float(np.median(env[lead - 300 : lead])) - quiet
    try:
        onset = int(np.where(env[lead:] > quiet + quiet_gain + 10)[0][0]) + lead
        loud_gain = float(np.median(env[onset + 400 : onset + 580])) - loud
        offset = int(np.where(env[onset + 100 :] < loud + loud_gain - 10)[0][0]) + onset + 100
    except IndexError:
        return {"staticCurve": curve, "probeHz": freq, "error": "the level step never came back"}

    up = env[onset : offset] - loud
    down = env[offset : offset + 900] - quiet
    skip = 3                                   # the analysis window straddling the step
    instant = float(np.median(up[skip : skip + 5]))

    def settle(gain, start, final):
        """Milliseconds for the gain to cover 63 % of the way from start to final."""
        if abs(start - final) < 0.5:
            return None
        target = start + 0.63 * (final - start)
        hit = np.where((gain[skip:] - target) * np.sign(final - start) >= 0)[0]
        return float(hit[0] + skip) if len(hit) else None

    after_drop = float(np.median(down[skip : skip + 5]))
    return {
        "staticCurve": curve,
        "probeHz": freq,
        # Gain lost the instant the level jumps: clipping and saturation, which
        # have no attack or release of their own.
        "saturationDb": round(quiet_gain - instant, 1),
        # Gain lost after that, over time: an actual compressor working.
        "compressionDb": round(instant - loud_gain, 1),
        # Below a few dB of compression the settling time drowns in the
        # envelope's own ripple, and two runs disagree by an order of magnitude.
        "attackMs": settle(up, instant, loud_gain) if instant - loud_gain >= 3 else None,
        "releaseMs": settle(down, after_drop, quiet_gain) if instant - loud_gain >= 3 else None,
    }


def measure_noise(rig: Rig) -> dict:
    wet, dry = rig.run(np.zeros(FS, dtype="float32"), tail=0, align=False)
    return {
        "wetDbfs": round(db(rms(wet[FS // 4 :])), 1),
        "dryDbfs": round(db(rms(dry[FS // 4 :])), 1),
    }


def measure_all(rig: Rig | None = None, quick: bool = False, notify=print) -> dict:
    rig = rig or Rig()
    rig.wait_for_quiet(notify=notify)
    started = time.time()
    report = {
        "noise": measure_noise(rig),
        "response": [measure_response(rig, lv) for lv in (SWEEP_LEVELS_DBFS[:1] if quick else SWEEP_LEVELS_DBFS)],
    }
    if not quick:
        report["distortion"] = measure_distortion(rig)
        report["dynamics"] = measure_dynamics(rig)
    report["seconds"] = round(time.time() - started, 1)
    return report


# --- reading the result ------------------------------------------------------

def _ref(gains: dict) -> float:
    """Reference level: the average across 200 Hz - 2 kHz, where the body sits."""
    keys = [k for k in gains if 200 <= int(k) <= 2000]
    return sum(gains[k] for k in keys) / len(keys)


def summary(report: dict) -> str:
    lines = []
    for resp in report["response"]:
        gains = resp["gainDb"]
        ref = _ref(gains)
        lines.append(f"Frequency response @ {resp['levelDbfs']} dBFS in "
                     f"(round trip {resp['roundTripMs']} ms incl. host buffers"
                     + (f", RT60 {resp['rt60s']} s" if resp["rt60s"] else "") + ")")
        lines.append(f"  overall gain {ref:+.1f} dB (200 Hz - 2 kHz average); bands relative to that:")
        row = []
        for f in BANDS_HZ:
            label = f"{f // 1000}k" if f >= 1000 and f % 1000 == 0 else (f"{f / 1000:g}k" if f >= 1000 else str(f))
            row.append(f"{label:>5} {gains[str(f)] - ref:+5.1f}")
        for i in range(0, len(row), 7):
            lines.append("   " + "  ".join(row[i : i + 7]))

    if "distortion" in report:
        lines.append("")
        lines.append("Distortion (THD %, H2 / H3 dB below the fundamental, even-vs-odd balance)")
        for level in TONE_LEVELS_DBFS:
            cells = [d for d in report["distortion"] if d["levelDbfs"] == level]
            text = "  ".join(f"{d['freqHz']}Hz {d['thdPct']:.1f}% ({d['h2Db']:+.0f}/{d['h3Db']:+.0f})" for d in cells)
            lines.append(f"  in {level:>3} dBFS: {text}")
        loud = [d for d in report["distortion"] if d["levelDbfs"] == TONE_LEVELS_DBFS[-1]]
        balance = sum(d["evenOddDb"] for d in loud) / len(loud)
        lean = "even-order (warm, tube-like)" if balance > 3 else "odd-order (hard, fuzz/clip-like)" if balance < -3 else "mixed"
        lines.append(f"  harmonic character when driven: {lean}, even-odd {balance:+.1f} dB")
        lines.append("  (measured at the chain output, so EQ after the drive stage tilts these:")
        lines.append("   a boosted 2 kHz inflates the H2 of a 1 kHz tone)")

    if "dynamics" in report:
        dyn = report["dynamics"]
        curve = dyn["staticCurve"]
        lines.append("")
        lines.append(f"Dynamics @ {dyn['probeHz']} Hz (in -> out dBFS)")
        lines.append("  " + "  ".join(f"{c['inDbfs']}->{c['outDbfs']:.0f}" for c in curve))
        top = [c for c in curve if c["inDbfs"] >= -24]
        if len(top) >= 2:
            d_in = top[-1]["inDbfs"] - top[0]["inDbfs"]
            d_out = top[-1]["outDbfs"] - top[0]["outDbfs"]
            ratio = d_in / d_out if d_out > 0.1 else float("inf")
            lines.append(f"  effective ratio above -24 dBFS: {ratio:.1f}:1  (1:1 = no compression; includes any clipping)")
        if "error" in dyn:
            lines.append(f"  step test failed: {dyn['error']}")
        else:
            lines.append(f"  a 20 dB jump: {dyn['saturationDb']} dB lost instantly (saturation/clipping), "
                         f"{dyn['compressionDb']} dB more over time (compression)")
            if dyn["attackMs"] is None:
                lines.append("  too little compression to time its attack and release reliably")
            else:
                lines.append(f"  compressor attack ~{dyn['attackMs']} ms, release ~{dyn['releaseMs']} ms (63 % settling)")

    noise = report["noise"]
    lines.append("")
    lines.append(f"Noise floor: chain output {noise['wetDbfs']} dBFS, instrument input {noise['dryDbfs']} dBFS")
    lines.append(f"({report['seconds']} s to measure)")
    return "\n".join(lines)


def compare(a: dict, b: dict) -> str:
    """What changed between two measurements, band by band."""
    lines = ["Frequency response change (B - A, each relative to its own 200 Hz - 2 kHz level)"]
    for ra, rb in zip(a["response"], b["response"]):
        ga, gb = ra["gainDb"], rb["gainDb"]
        refa, refb = _ref(ga), _ref(gb)
        lines.append(f"  @ {ra['levelDbfs']} dBFS: overall level {refb - refa:+.1f} dB")
        changed = [(f, (gb[str(f)] - refb) - (ga[str(f)] - refa)) for f in BANDS_HZ]
        notable = [(f, d) for f, d in changed if abs(d) >= 0.5]
        if notable:
            lines.append("   " + "  ".join(f"{f}Hz {d:+.1f}" for f, d in notable))
        else:
            lines.append("   no band moved by 0.5 dB or more")
    if "distortion" in a and "distortion" in b:
        lines.append("Distortion change (THD %)")
        for da, dbb in zip(a["distortion"], b["distortion"]):
            if abs(dbb["thdPct"] - da["thdPct"]) >= 0.5:
                lines.append(f"  {da['freqHz']} Hz @ {da['levelDbfs']} dBFS: {da['thdPct']}% -> {dbb['thdPct']}%")
    return "\n".join(lines)


# --- real playing: capture once, reamp through any preset --------------------
#
# Test signals cannot show what an effect does over time. A tremolo, a chorus,
# an octaver or a synth reacts to a musical input, and a delay or reverb is
# heard in what is left after the notes stop. So record the player once on the
# dry instrument input, then send that same take through any preset: the
# comparison is fair because the performance is identical, and dry-vs-wet over
# time shows what the steady-state tests cannot.

def capture(seconds: float, rig: Rig | None = None):
    """Record the player. Returns (dry, wet): the instrument jack and the chain output."""
    rig = rig or Rig()
    rec = sd.rec(int(FS * seconds), samplerate=FS, device=rig.device,
                 channels=3, blocking=True)
    return rec[:, DRY_IN - 1].copy(), rec[:, :2].mean(axis=1)


def reamp(dry, rig: Rig | None = None, tail: float = 3.0):
    """Send a recorded dry take through the current preset. Returns the wet take,
    trimmed so it lines up with the dry one."""
    rig = rig or Rig()
    rig.wait_for_quiet(notify=print)
    wet, _ = rig.run(dry, tail=tail, align=False)
    # Align on the cross-correlation peak, found on a decimated envelope so a
    # few minutes of audio stays cheap.
    step = 48
    a = np.abs(dry[: len(dry) // step * step]).reshape(-1, step).mean(axis=1)
    b = np.abs(wet[: len(wet) // step * step]).reshape(-1, step).mean(axis=1)
    corr = np.correlate(b, a[: min(len(a), len(b))], mode="valid") if len(b) >= len(a) else np.array([0])
    lag = int(np.argmax(corr)) * step
    return wet[lag:]


def _frames(x, size, hop):
    count = max((len(x) - size) // hop, 0)
    return np.stack([x[i * hop : i * hop + size] for i in range(count)]) if count else np.zeros((0, size))


def _f0(frame) -> float | None:
    """Fundamental of one frame by autocorrelation, limited to 30-700 Hz."""
    frame = frame - frame.mean()
    if rms(frame) < 1e-4:
        return None
    corr = np.correlate(frame, frame, mode="full")[len(frame) - 1 :]
    lo, hi = int(FS / 700), int(FS / 30)
    if hi >= len(corr):
        return None
    k = lo + int(np.argmax(corr[lo:hi]))
    return FS / k if corr[k] > 0.3 * corr[0] else None


def analyze_performance(dry, wet) -> dict:
    n = min(len(dry), len(wet))
    dry, wet_aligned = dry[:n], wet[:n]

    # Input level: how hard this player actually hits the pedal. It decides which
    # of the test levels above describe their real playing.
    peak = float(np.max(np.abs(dry))) if n else 0.0
    report = {
        "seconds": round(n / FS, 1),
        "dryPeakDbfs": round(db(peak), 1),
        "dryRmsDbfs": round(db(rms(dry)), 1),
        "dryCrestDb": round(db(peak) - db(rms(dry)), 1),
        "wetCrestDb": round(db(np.max(np.abs(wet_aligned))) - db(rms(wet_aligned)), 1),
    }

    # Average tonal balance of the actual playing, wet relative to dry.
    size = 1 << 15
    def ltas(x):
        frames = _frames(x, size, size // 2)
        if not len(frames):
            return None
        return (np.abs(np.fft.rfft(frames * np.hanning(size), axis=1)) ** 2).mean(axis=0)
    pd, pw = ltas(dry), ltas(wet_aligned)
    if pd is not None:
        freqs = np.fft.rfftfreq(size, 1 / FS)
        def band(p, f):
            sel = (freqs >= f / 2 ** (1 / 6)) & (freqs <= f * 2 ** (1 / 6))
            return 10 * np.log10(p[sel].mean() + 1e-20)
        # A band the dry take barely reaches says nothing about EQ: whatever comes
        # out there was made by distortion, and dividing by near-silence is noise.
        dry_levels = {f: band(pd, f) for f in BANDS_HZ}
        loudest = max(dry_levels.values())
        diff = {f: band(pw, f) - dry_levels[f] for f in BANDS_HZ if dry_levels[f] > loudest - 65}
        mids = [v for f, v in diff.items() if 200 <= f <= 2000]
        ref = sum(mids) / len(mids) if mids else 0.0
        report["playedGainDb"] = {str(f): (round(diff[f] - ref, 1) if f in diff else None) for f in BANDS_HZ}

    # Level modulation: the wet envelope divided by the dry one, so the player's
    # own dynamics cancel and what is left is the effect moving the level.
    hop = int(FS * 0.005)
    env_d = np.sqrt(np.convolve(dry ** 2, np.ones(hop * 4) / (hop * 4), "same"))[::hop]
    env_w = np.sqrt(np.convolve(wet_aligned ** 2, np.ones(hop * 4) / (hop * 4), "same"))[::hop]
    live = env_d > peak * 10 ** (-30 / 20)
    if live.sum() > 400:
        gain = 20 * np.log10((env_w[live] + 1e-9) / (env_d[live] + 1e-9))
        # Gain that follows the input level is dynamics - a gate, a compressor, a
        # drive stage - and repeats at the rhythm of the playing. Fit it against
        # the input level and keep only what the level does not explain.
        level = 20 * np.log10(env_d[live] + 1e-9)
        fit = np.polyval(np.polyfit(level, gain, 3), level)
        residual = gain - fit
        # Put the residual back on the real time axis, zero between notes. Dropping
        # the gaps instead would squeeze time together and read every rate fast.
        gain = np.zeros(len(env_d))
        gain[live] = residual
        residual_spread = residual
        nfft = 1 << int(math.ceil(math.log2(len(gain) * 8)))
        spec = np.abs(np.fft.rfft(gain * np.hanning(len(gain)), nfft))
        rates = np.fft.rfftfreq(nfft, hop / FS)
        sel = (rates >= 0.5) & (rates <= 20)
        k = int(np.argmax(spec[sel]))
        # Parabolic interpolation between bins for the rate itself.
        idx = np.where(sel)[0][k]
        a, b, c = np.log(spec[idx - 1 : idx + 2] + 1e-12)
        shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
        rate = float(rates[idx] + shift * (rates[1] - rates[0]))
        depth = float(np.percentile(residual_spread, 95) - np.percentile(residual_spread, 5))
        # A few dB of wobble is what any irregular effect leaves behind - an
        # octaver's tracking, a drive reacting to the pick. Call it modulation
        # only when it is deep and has a clear rate.
        strong = spec[sel][k] > 4 * np.median(spec[sel]) and depth >= 4 and 0 < k < sel.sum() - 1
        report["levelModulation"] = {"rateHz": round(rate, 2) if strong else None,
                                     "depthDb": round(depth, 1)}

    # Pitch: how much of the wet signal sits an octave below what was played.
    # Telling a 27.5 Hz sub from a 55 Hz note needs bins a few hertz apart, so the
    # frames are long and zero-padded further; a short frame reads both as one.
    size, hop2, nfft = 8192, 4096, 32768
    fd, fw = _frames(dry, size, hop2), _frames(wet_aligned, size, hop2)
    below, at, dry_below, dry_at = [], [], [], []
    win = np.hanning(size)
    freqs = np.fft.rfftfreq(nfft, 1 / FS)
    for a, b in zip(fd, fw):
        f0 = _f0(a)
        if not f0 or f0 / 2 < 25:
            continue
        def near(spec, f):
            sel = (freqs >= f * 0.95) & (freqs <= f * 1.05)
            return spec[sel].max() if sel.any() else 0.0
        wet_spec = np.abs(np.fft.rfft(b * win, nfft))
        dry_spec = np.abs(np.fft.rfft(a * win, nfft))
        below.append(near(wet_spec, f0 / 2))
        at.append(near(wet_spec, f0))
        dry_below.append(near(dry_spec, f0 / 2))
        dry_at.append(near(dry_spec, f0))
    if len(at) > 5:
        wet_ratio = db(np.median(below) / (np.median(at) + 1e-20))
        # Autocorrelation sometimes locks onto the octave above the real note,
        # and then the real note reads as "an octave below". The dry signal
        # makes the same mistake, so only what the preset adds counts.
        dry_ratio = db(np.median(dry_below) / (np.median(dry_at) + 1e-20))
        report["octaveDownDb"] = round(wet_ratio, 1)
        report["octaveDownAddedDb"] = round(wet_ratio - dry_ratio, 1)

    # What is left after the playing stops: delay and reverb tails.
    quiet_dry = env_d < peak * 10 ** (-50 / 20)
    if quiet_dry.any() and (~quiet_dry).any():
        last_note = int(np.where(~quiet_dry)[0][-1])
        tail = env_w[last_note:]
        floor = np.median(env_w[-40:]) if len(env_w) > 40 else 0
        above = np.where(tail > max(floor * 4, np.max(np.abs(wet_aligned)) * 10 ** (-60 / 20)))[0]
        report["tailMs"] = int(above[-1] * 5) if len(above) else 0
    return report


def performance_summary(report: dict) -> str:
    lines = [
        f"Playing level: peaks {report['dryPeakDbfs']} dBFS, average {report['dryRmsDbfs']} dBFS "
        f"at the instrument input",
        f"Peak-to-average: dry {report['dryCrestDb']} dB -> wet {report['wetCrestDb']} dB "
        f"({report['dryCrestDb'] - report['wetCrestDb']:+.1f} dB of transient squashed)",
    ]
    if "playedGainDb" in report:
        g = report["playedGainDb"]
        lines.append("Tonal balance of the actual playing, wet vs dry (relative to 200 Hz - 2 kHz;")
        lines.append("  '-' = the take has too little there to judge):")
        row = [f"{f}:{g[str(f)]:+.1f}" if g[str(f)] is not None else f"{f}:  -  " for f in BANDS_HZ]
        for i in range(0, len(row), 9):
            lines.append("   " + "  ".join(row[i : i + 9]))
    if "levelModulation" in report:
        mod = report["levelModulation"]
        if mod["rateHz"]:
            lines.append(f"Level moves at {mod['rateHz']} Hz by {mod['depthDb']} dB - a tremolo or similar")
        else:
            lines.append(f"No periodic level movement (spread {mod['depthDb']} dB, which is the dynamics)")
    if "octaveDownDb" in report:
        octave = report["octaveDownDb"]
        if octave <= -30 or report.get("octaveDownAddedDb", 99) < 10:
            lines.append("Nothing an octave below the played note - no octaver or sub synth")
        else:
            lines.append(f"An octave below the played note sits {octave:+.1f} dB relative to the note "
                         "- an octaver or sub synth")
    if "tailMs" in report:
        tail = report["tailMs"]
        kind = "a delay or reverb tail" if tail > 250 else "just the cab and gate letting go, no delay or reverb"
        lines.append(f"Sound continues {tail} ms after the last note - {kind}")
    return "\n".join(lines)
