/*
 * Analysis half of tools/measure.py, for the browser. Pure computation: the page
 * plays and records, this turns recordings into the same reports the Python
 * tool writes, key for key and rounding for rounding.
 *
 * Classic script so it loads from a file:// page; Node tests import it for the
 * side effect and use globalThis.AT.dsp.
 */
(function (root) {
  "use strict";
  const AT = (root.AT = root.AT || {});

  const FS = 48000;
  const BANDS_HZ = [30, 40, 60, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
    12500, 16000];
  const DIST_FREQS_HZ = [55, 110, 220, 440, 1000];
  const SWEEP_LEVELS_DBFS = [-24, -12];
  const TONE_LEVELS_DBFS = [-24, -12, -6];
  const LADDER_DBFS = [];
  for (let v = -60; v <= 0; v += 4) LADDER_DBFS.push(v);

  // --- Python and numpy semantics ---------------------------------------------

  // Python's round(): the exact binary value decides, exact ties go to even.
  function pyRound(x, nd = 0) {
    if (x === null || x === undefined || !isFinite(x)) return x;
    const t = x * 2 ** (nd + 1);
    if (Number.isInteger(t) && t % 2 !== 0) {
      const lo = Math.floor((t * 5 ** nd) / 2);
      return (lo % 2 === 0 ? lo : lo + 1) / 10 ** nd;
    }
    return Number(x.toFixed(nd));
  }

  function rint(v) {
    const r = Math.round(v);
    return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
  }

  // round() of a numpy scalar is np.round: scale, round half to even, unscale.
  function npRound(x, nd = 0) {
    if (x === null || x === undefined || !isFinite(x)) return x;
    const f = 10 ** nd;
    return rint(x * f) / f;
  }

  // format(x, "[+][width].{nd}f")
  function pyFixed(x, nd, sign = false, width = 0) {
    let s;
    if (x === Infinity) s = "inf";
    else if (x === -Infinity) s = "-inf";
    else if (Number.isNaN(x)) s = "nan";
    else {
      const t = x * 2 ** (nd + 1);
      if (Number.isInteger(t) && t % 2 !== 0) x = pyRound(x, nd) || (x < 0 ? -0 : 0);
      s = Math.abs(x).toFixed(nd);
      if (x < 0 || Object.is(x, -0)) s = "-" + s;
    }
    if (sign && s[0] !== "-") s = "+" + s;
    return s.padStart(width);
  }

  // str() of a Python float.
  function pyRepr(x) {
    if (x === null || x === undefined) return "None";
    if (x === Infinity) return "inf";
    if (x === -Infinity) return "-inf";
    if (Number.isNaN(x)) return "nan";
    const ax = Math.abs(x);
    if (ax !== 0 && (ax < 1e-4 || ax >= 1e16)) {
      const [m, e] = x.toExponential().split("e");
      const exp = Number(e);
      return `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
    }
    if (Number.isInteger(x)) return (Object.is(x, -0) ? "-0" : String(x)) + ".0";
    return String(x);
  }

  function sortedCopy(x) {
    return Float64Array.from(x).sort();
  }

  function median(x) {
    const n = x.length;
    if (!n) return NaN;
    const s = sortedCopy(x);
    const h = n >> 1;
    return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  }

  // np.percentile, method "linear", including numpy's two-sided lerp.
  function percentile(x, q, sorted = null) {
    const s = sorted || sortedCopy(x);
    const n = s.length;
    const v = (n - 1) * (q / 100);
    const lo = Math.min(Math.max(Math.floor(v), 0), n - 1);
    const hi = Math.min(lo + 1, n - 1);
    const g = v - lo;
    const a = s[lo], b = s[hi], d = b - a;
    return g >= 0.5 ? b - d * (1 - g) : a + d * g;
  }

  // np.hanning(m)
  const hannCache = new Map();
  function hanning(m) {
    let w = hannCache.get(m);
    if (w) return w;
    w = new Float64Array(m);
    if (m === 1) w[0] = 1;
    else for (let i = 0; i < m; i++) w[i] = 0.5 + 0.5 * Math.cos((Math.PI * (1 - m + 2 * i)) / (m - 1));
    if (m >= 1024) hannCache.set(m, w);
    return w;
  }

  // np.linspace(start, stop, num)
  function linspace(start, stop, num) {
    const y = new Float64Array(num);
    const step = (stop - start) / (num - 1);
    for (let i = 0; i < num; i++) y[i] = i * step + start;
    if (num > 1) y[num - 1] = stop;
    return y;
  }

  // np.interp(x, xp, fp) for one x, xp ascending.
  function interp(x, xp, fp) {
    const n = xp.length;
    if (x <= xp[0]) return fp[0];
    if (x >= xp[n - 1]) return fp[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xp[mid] <= x) lo = mid;
      else hi = mid;
    }
    if (xp[lo] === x) return fp[lo];
    const slope = (fp[lo + 1] - fp[lo]) / (xp[lo + 1] - xp[lo]);
    return slope * (x - xp[lo]) + fp[lo];
  }

  // np.convolve(x, np.ones(m) / m, "same")[::step], as direct sums only where kept.
  function movingAverageSame(x, m, step = 1) {
    const n = x.length;
    const left = m >> 1, v = 1 / m;
    const out = new Float64Array(Math.ceil(n / step));
    for (let o = 0, i = 0; i < n; o++, i += step) {
      const a = Math.max(i - left, 0), b = Math.min(i - left + m, n);
      let s = 0;
      for (let q = a; q < b; q++) s += x[q] * v;
      out[o] = s;
    }
    return out;
  }

  // np.polyfit(x, y, deg): least squares on the column-scaled Vandermonde, by Householder QR.
  function polyfit(x, y, deg) {
    const n = x.length, k = deg + 1;
    const cols = [];
    for (let j = 0; j < k; j++) {
      const c = new Float64Array(n);
      const p = deg - j;
      for (let i = 0; i < n; i++) c[i] = x[i] ** p;
      cols.push(c);
    }
    const scale = cols.map((c) => Math.sqrt(c.reduce((s, v) => s + v * v, 0)));
    cols.forEach((c, j) => { for (let i = 0; i < n; i++) c[i] /= scale[j]; });
    const b = Float64Array.from(y);
    for (let j = 0; j < k; j++) {
      const c = cols[j];
      let norm = 0;
      for (let i = j; i < n; i++) norm += c[i] * c[i];
      norm = Math.sqrt(norm);
      const alpha = c[j] > 0 ? -norm : norm;
      const v = new Float64Array(n);
      for (let i = j; i < n; i++) v[i] = c[i];
      v[j] -= alpha;
      let vv = 0;
      for (let i = j; i < n; i++) vv += v[i] * v[i];
      if (vv === 0) continue;
      const reflect = (z) => {
        let d = 0;
        for (let i = j; i < n; i++) d += v[i] * z[i];
        d = (2 * d) / vv;
        for (let i = j; i < n; i++) z[i] -= d * v[i];
      };
      for (let jj = j; jj < k; jj++) reflect(cols[jj]);
      reflect(b);
    }
    const coef = new Array(k).fill(0);
    for (let j = k - 1; j >= 0; j--) {
      let s = b[j];
      for (let jj = j + 1; jj < k; jj++) s -= cols[jj][j] * coef[jj];
      coef[j] = s / cols[j][j];
    }
    return coef.map((c, j) => c / scale[j]);
  }

  function polyval(p, x) {
    const out = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) {
      let y = 0;
      for (const c of p) y = y * x[i] + c;
      out[i] = y;
    }
    return out;
  }

  // freqs[k] = k * val (np.fft.rfftfreq); [lo, hi) of the bins with fLo <= freqs[k] <= fHi.
  function binRange(val, fLo, fHi, bins) {
    let lo = Math.max(Math.ceil(fLo / val) - 1, 0);
    while (lo < bins && lo * val < fLo) lo++;
    let hi = Math.max(Math.floor(fHi / val) - 1, lo);
    while (hi < bins && hi * val <= fHi) hi++;
    return [lo, Math.min(hi, bins)];
  }

  function rfftVal(n, d) {
    return 1.0 / (n * d);
  }

  // --- FFT -----------------------------------------------------------------------

  const plans = new Map();
  function plan(n) {
    let p = plans.get(n);
    if (p) return p;
    let bits = 0;
    while (1 << bits < n) bits++;
    if (1 << bits !== n) throw new Error(`FFT size ${n} is not a power of two`);
    const rev = new Uint32Array(n);
    for (let i = 1; i < n; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (bits - 1));
    const half = n >> 1;
    const cos = new Float64Array(half), sin = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      cos[k] = Math.cos((2 * Math.PI * k) / n);
      sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
    p = { rev, cos, sin };
    plans.set(n, p);
    return p;
  }

  // In-place complex FFT, forward e^{-i...}; inverse is unscaled.
  function fft(re, im, inverse = false) {
    const n = re.length;
    if (n <= 1) return;
    const { rev, cos, sin } = plan(n);
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let a = 0; a < n; a += 2) {
      const tr = re[a + 1], ti = im[a + 1];
      re[a + 1] = re[a] - tr; im[a + 1] = im[a] - ti;
      re[a] += tr; im[a] += ti;
    }
    const sgn = inverse ? 1 : -1;
    // Blocks outer, twiddles inner: sequential memory access, several times faster at 2^19.
    for (let size = 4; size <= n; size <<= 1) {
      const half = size >> 1, stride = n / size;
      for (let a0 = 0; a0 < n; a0 += size) {
        for (let j = 0, k = 0; j < half; j++, k += stride) {
          const wr = cos[k], wi = sgn * sin[k];
          const a = a0 + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  // np.fft.rfft(x, n) for power-of-two n: x is cut or zero-padded to n.
  function rfft(x, n = x.length) {
    const m = n >> 1;
    const zr = new Float64Array(m), zi = new Float64Array(m);
    const len = Math.min(x.length, n);
    for (let i = 0; i + 1 < len; i += 2) { zr[i >> 1] = x[i]; zi[i >> 1] = x[i + 1]; }
    if (len % 2) zr[len >> 1] = x[len - 1];
    fft(zr, zi);
    const re = new Float64Array(m + 1), im = new Float64Array(m + 1);
    re[0] = zr[0] + zi[0];
    re[m] = zr[0] - zi[0];
    const { cos, sin } = plan(n);
    for (let k = 1; k < m; k++) {
      const ar = zr[k], ai = zi[k], br = zr[m - k], bi = -zi[m - k];
      const er = (ar + br) / 2, ei = (ai + bi) / 2;
      const dr = ar - br, di = ai - bi;
      const c = cos[k], s = sin[k];
      re[k] = er + (c * di - s * dr) / 2;
      im[k] = ei - (c * dr + s * di) / 2;
    }
    return { re, im };
  }

  // np.fft.irfft(X, n): X holds n/2 + 1 bins; imaginary parts of DC and Nyquist are ignored.
  function irfft(re, im, n = 2 * (re.length - 1)) {
    const m = n >> 1;
    const zr = new Float64Array(m), zi = new Float64Array(m);
    const R = (k) => (k < re.length ? re[k] : 0), I = (k) => (k < im.length ? im[k] : 0);
    zr[0] = (R(0) + R(m)) / 2;
    zi[0] = (R(0) - R(m)) / 2;
    const { cos, sin } = plan(n);
    for (let k = 1; k < m; k++) {
      const ar = R(k), ai = I(k), br = R(m - k), bi = -I(m - k);
      const er = (ar + br) / 2, ei = (ai + bi) / 2;
      // (a - b) / 2 * e^{+i 2 pi k / n}
      const dr = (ar - br) / 2, di = (ai - bi) / 2;
      const c = cos[k], s = sin[k];
      const or = dr * c - di * s, oi = dr * s + di * c;
      zr[k] = er - oi;
      zi[k] = ei + or;
    }
    fft(zr, zi, true);
    const out = new Float64Array(n);
    for (let k = 0; k < m; k++) { out[2 * k] = zr[k] / m; out[2 * k + 1] = zi[k] / m; }
    return out;
  }

  function nextPow2(v) {
    let n = 1;
    while (n < v) n *= 2;
    return n;
  }

  function magnitude({ re, im }) {
    const out = new Float64Array(re.length);
    for (let k = 0; k < re.length; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    return out;
  }

  // --- basics ----------------------------------------------------------------

  function db(x) {
    return 20 * Math.log10(Math.max(Number(x), 1e-12));
  }

  function rms(x, start = 0, end = x.length) {
    if (end <= start) return 0;
    let s = 0;
    for (let i = start; i < end; i++) s += x[i] * x[i];
    return Math.sqrt(s / (end - start));
  }

  function maxAbs(x, start = 0, end = x.length) {
    let m = 0;
    for (let i = start; i < end; i++) { const v = Math.abs(x[i]); if (v > m) m = v; }
    return m;
  }

  function argmaxAbs(x, start, end) {
    let best = -1, k = start;
    for (let i = start; i < end; i++) { const v = Math.abs(x[i]); if (v > best) { best = v; k = i; } }
    return k;
  }

  function argmax(x, start = 0, end = x.length) {
    let best = -Infinity, k = start;
    for (let i = start; i < end; i++) if (x[i] > best) { best = x[i]; k = i; }
    return k;
  }

  // --- signals -----------------------------------------------------------------

  function raisedRamp(fade) {
    const lin = linspace(0, Math.PI, fade);
    return lin.map((v) => 0.5 - 0.5 * Math.cos(v));
  }

  function applyFades(x, fade) {
    const ramp = raisedRamp(fade), n = x.length;
    for (let i = 0; i < fade; i++) x[i] *= ramp[i];
    for (let j = 0; j < fade; j++) x[n - fade + j] *= ramp[fade - 1 - j];
  }

  /** Exponential sine sweep with short fades so its ends do not click. */
  function sweep(f1, f2, seconds, levelDbfs) {
    const n = Math.trunc(FS * seconds);
    const k = Math.log(f2 / f1);
    const c = (2 * Math.PI * f1 * seconds) / k;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(c * (Math.exp(((i / FS) * k) / seconds) - 1));
    applyFades(x, Math.trunc(FS * 0.02));
    const g = 10 ** (levelDbfs / 20);
    return Float32Array.from(x, (v) => g * v);
  }

  /** A sine landing on an exact FFT bin of the analysis window, with soft edges. */
  function tone(freq, seconds, levelDbfs) {
    const n = Math.trunc(FS * seconds);
    const w = 2 * Math.PI * freq;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin(w * (i / FS));
    applyFades(x, Math.trunc(FS * 0.01));
    const g = 10 ** (levelDbfs / 20);
    return Float32Array.from(x, (v) => g * v);
  }

  /** Quiet, loud, quiet as one unbroken sine whose amplitude steps. */
  function stepSignal(freq = 110) {
    const seconds = [0.6, 0.6, 1.0], levels = [-30, -10, -30];
    const parts = seconds.map((t) => Math.trunc(FS * t));
    const amp = new Float64Array(parts.reduce((a, b) => a + b, 0));
    let o = 0;
    parts.forEach((len, j) => { amp.fill(10 ** (levels[j] / 20), o, o + len); o += len; });
    const smooth = movingAverageSame(amp, Math.trunc(FS * 0.001));
    const w = 2 * Math.PI * freq;
    return Float32Array.from(smooth, (a, i) => a * Math.sin(w * (i / FS)));
  }

  // --- frequency response ---------------------------------------------------------

  /** Deconvolve by spectral division, regularised outside the swept band. */
  function impulseResponse(played, recorded) {
    const n = nextPow2(recorded.length + played.length);
    const X = rfft(played, n), Y = rfft(recorded, n);
    const bins = X.re.length;
    const power = new Float64Array(bins);
    let top = 0;
    for (let k = 0; k < bins; k++) {
      power[k] = X.re[k] * X.re[k] + X.im[k] * X.im[k];
      if (power[k] > top) top = power[k];
    }
    const eps = top * 1e-6;
    const re = new Float64Array(bins), im = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      const d = power[k] + eps;
      re[k] = (Y.re[k] * X.re[k] + Y.im[k] * X.im[k]) / d;
      im[k] = (Y.im[k] * X.re[k] - Y.re[k] * X.im[k]) / d;
    }
    return irfft(re, im, n);
  }

  /** Fractional-octave smoothing on a power basis; freqs ascending. Windows sum
   *  through prefix sums, falling back to a direct sum where cancellation would
   *  eat the window. */
  function smoothOctave(freqs, magsDb, fraction = 6) {
    const n = freqs.length;
    const power = new Float64Array(n), prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      power[i] = 10 ** (magsDb[i] / 10);
      prefix[i + 1] = prefix[i] + power[i];
    }
    const half = 2 ** (1 / (2 * fraction));
    const out = new Float64Array(n);
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      const f = freqs[i];
      const fl = f / half, fh = f * half;
      while (lo < n && freqs[lo] < fl) lo++;
      if (hi < lo) hi = lo;
      while (hi < n && freqs[hi] <= fh) hi++;
      if (hi <= lo) { out[i] = magsDb[i]; continue; }
      let s = prefix[hi] - prefix[lo];
      if (!(s > prefix[hi] * 1e-9)) {
        s = 0;
        for (let j = lo; j < hi; j++) s += power[j];
      }
      out[i] = 10 * Math.log10(s / (hi - lo));
    }
    return out;
  }

  /** RT60 from the T20 slope of the backward-integrated energy decay, if any. */
  function schroederRt60(ir) {
    const n = ir.length;
    if (!n) return null;
    const energy = new Float64Array(n);
    let acc = 0;
    for (let i = n - 1; i >= 0; i--) { acc += ir[i] * ir[i]; energy[i] = acc; }
    if (energy[0] <= 0) return null;
    let start = -1, stop = -1;
    for (let i = 0; i < n; i++) {
      const edc = 10 * Math.log10(energy[i] / energy[0] + 1e-20);
      if (start < 0 && edc <= -5) start = i;
      if (edc <= -25) { stop = i; break; }
    }
    if (start < 0 || stop < 0) return null;
    const seconds = (stop - start) / FS;
    return seconds > 0 ? npRound(seconds * 3, 3) : null;
  }

  /** Round trip in samples: what Rig.calibrate stores as the latency. */
  function latencySamples(played, recorded) {
    const ir = impulseResponse(played, recorded);
    return argmaxAbs(ir, 0, Math.min(FS, ir.length));
  }

  /** measure_response after the recording: recorded is the unaligned take of
   *  played followed by its tail. */
  function analyzeResponse(played, recorded, levelDbfs) {
    const ir = impulseResponse(played, recorded);
    const peak = argmaxAbs(ir, 0, Math.min(FS * 2, ir.length));
    const latencyMs = pyRound((peak / FS) * 1000, 2);

    // A 250 ms window holds the speaker, the EQ and early reflections; longer
    // reverb belongs to the decay figure, not the tonal balance.
    const start = Math.max(peak - Math.trunc(FS * 0.005), 0);
    const segment = ir.slice(start, start + Math.trunc(FS * 0.25));
    const fade = Math.trunc(FS * 0.05);
    const lin = linspace(1, 0, fade);
    const from = Math.max(segment.length - fade, 0);
    for (let i = from; i < segment.length; i++) segment[i] *= lin[i - segment.length + fade];
    const nfft = 1 << 16;
    const spectrum = magnitude(rfft(segment, nfft));
    const val = rfftVal(nfft, 1 / FS);
    const bins = spectrum.length - 1;
    const freqs = new Float64Array(bins), mags = new Float64Array(bins);
    for (let k = 1; k <= bins; k++) {
      freqs[k - 1] = k * val;
      mags[k - 1] = 20 * Math.log10(spectrum[k] + 1e-12);
    }
    const smoothed = smoothOctave(freqs, mags);
    const gainDb = {};
    for (const f of BANDS_HZ) gainDb[String(f)] = pyRound(interp(f, freqs, smoothed), 2);

    return {
      levelDbfs,
      roundTripMs: latencyMs,
      gainDb,
      rt60s: schroederRt60(ir.subarray(peak, peak + FS * 4)),
    };
  }

  // --- distortion and dynamics ------------------------------------------------------

  // |rfft(x)| at chosen bins, as direct sums: a few bins of a non-power-of-two frame.
  function dftBins(x, bins) {
    const n = x.length;
    const cos = new Float64Array(n), sin = new Float64Array(n);
    for (let i = 0; i < n; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
    const out = new Map();
    for (const k of bins) {
      if (out.has(k)) continue;
      let re = 0, im = 0;
      for (let t = 0, p = 0; t < n; t++) {
        re += x[t] * cos[p]; im -= x[t] * sin[p];
        p += k; if (p >= n) p -= n;
      }
      out.set(k, Math.hypot(re, im));
    }
    return out;
  }

  function harmonics(signal, freq, orders = 7) {
    const n = signal.length;
    const window = hanning(n);
    const x = Float64Array.from(signal, (v, i) => v * window[i]);
    const binHz = FS / n, top = n >> 1;
    const binsOf = (f) => {
      if (!(f < FS / 2)) return null;
      const k = pyRound(f / binHz), bins = [];
      for (let b = Math.max(k - 2, 0); b < Math.min(k + 3, top + 1); b++) bins.push(b);
      return bins;
    };
    const wanted = [];
    for (let h = 1; h <= orders; h++) wanted.push(binsOf(freq * h));
    const spectrum = dftBins(x, wanted.flat().filter((b) => b !== null));
    const level = (h) => (wanted[h - 1] ? Math.max(...wanted[h - 1].map((b) => spectrum.get(b))) : 0.0);
    let wsum = 0;
    for (let i = 0; i < n; i++) wsum += window[i];

    const fundamental = level(1);
    const out = { fundamentalDbfs: pyRound(db((fundamental * 2) / wsum), 2) };
    const parts = {};
    for (let h = 2; h <= orders; h++) {
      parts[h] = level(h);
      out[`h${h}Db`] = pyRound(db(parts[h] / (fundamental + 1e-20)), 1);
    }
    const sq = (pick) => Math.sqrt(Object.entries(parts).filter(([h]) => pick(Number(h))).reduce((s, [, v]) => s + v * v, 0));
    const total = sq(() => true), even = sq((h) => h % 2 === 0), odd = sq((h) => h % 2 === 1);
    out.thdPct = npRound((100 * total) / (fundamental + 1e-20), 2);
    out.evenOddDb = pyRound(db(even / (odd + 1e-20)), 1);
    return out;
  }

  /** wetAligned: the aligned recording of tone(freq, 0.9, levelDbfs). */
  function distortionPoint(wetAligned, freq, levelDbfs) {
    const a = Math.trunc(FS * 0.5);
    return { freqHz: freq, levelDbfs, ...harmonics(wetAligned.subarray(a, a + Math.floor(FS / 4)), freq) };
  }

  /** wetAligned: the aligned recording of tone(110, 0.8, levelDbfs). */
  function ladderPoint(wetAligned, levelDbfs) {
    const a = Math.trunc(FS * 0.5), b = Math.min(Math.trunc(FS * 0.75), wetAligned.length);
    return { inDbfs: levelDbfs, outDbfs: pyRound(db(rms(wetAligned, a, Math.max(a, b)) * Math.SQRT2), 2) };
  }

  /** measure_dynamics after the step recording; wetAligned is the aligned take of stepSignal(freq). */
  function analyzeStep(wetAligned, freq, staticCurve) {
    const quiet = -30, loud = -10;
    const hop = Math.trunc(FS * 0.001), win = Math.trunc(FS * 0.004);
    const env = [];
    for (let i = 0; i < wetAligned.length - win; i += hop) env.push(db(rms(wetAligned, i, i + win) * Math.SQRT2));
    const slice = (a, b) => env.slice(Math.max(a, 0), Math.max(b, 0));
    const firstFrom = (from, test) => {
      for (let i = Math.max(from, 0); i < env.length; i++) if (test(env[i])) return i;
      return -1;
    };

    // Find the steps in the recording itself rather than trusting the schedule.
    const lead = 400;
    const quietGain = median(slice(lead - 300, lead)) - quiet;
    const fail = { staticCurve, probeHz: freq, error: "the level step never came back" };
    const onset = firstFrom(lead, (v) => v > quiet + quietGain + 10);
    if (onset < 0) return fail;
    const loudGain = median(slice(onset + 400, onset + 580)) - loud;
    const offset = firstFrom(onset + 100, (v) => v < loud + loudGain - 10);
    if (offset < 0) return fail;

    const up = slice(onset, offset).map((v) => v - loud);
    const down = slice(offset, offset + 900).map((v) => v - quiet);
    const skip = 3;
    const instant = median(up.slice(skip, skip + 5));
    const settle = (gain, start, final) => {
      if (Math.abs(start - final) < 0.5) return null;
      const target = start + 0.63 * (final - start), sign = Math.sign(final - start);
      for (let i = skip; i < gain.length; i++) if ((gain[i] - target) * sign >= 0) return i;
      return null;
    };
    const afterDrop = median(down.slice(skip, skip + 5));
    const compressing = instant - loudGain >= 3;
    return {
      staticCurve,
      probeHz: freq,
      saturationDb: pyRound(quietGain - instant, 1),
      compressionDb: pyRound(instant - loudGain, 1),
      attackMs: compressing ? settle(up, instant, loudGain) : null,
      releaseMs: compressing ? settle(down, afterDrop, quietGain) : null,
    };
  }

  /** wet: one second of the unaligned chain output with nothing played. */
  function noise(wet) {
    return { wetDbfs: pyRound(db(rms(wet, Math.floor(FS / 4))), 1), dryDbfs: null };
  }

  // --- real playing ------------------------------------------------------------------

  function blockMeans(x, step) {
    const out = new Float64Array(Math.floor(x.length / step));
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (let j = i * step; j < i * step + step; j++) s += Math.abs(x[j]);
      out[i] = s / step;
    }
    return out;
  }

  /** reamp()'s alignment: wet trimmed so it lines up with dry (a view into wet). */
  function alignTake(dry, wet) {
    const step = 48;
    const a = blockMeans(dry, step), b = blockMeans(wet, step);
    if (b.length < a.length || !a.length) return wet.subarray(0);
    const n = nextPow2(b.length);
    const A = rfft(a, n), B = rfft(b, n);
    const re = new Float64Array(A.re.length), im = new Float64Array(A.re.length);
    for (let k = 0; k < re.length; k++) {
      re[k] = B.re[k] * A.re[k] + B.im[k] * A.im[k];
      im[k] = B.im[k] * A.re[k] - B.re[k] * A.im[k];
    }
    const corr = irfft(re, im, n);
    return wet.subarray(argmax(corr, 0, b.length - a.length + 1) * step);
  }

  function frameCount(len, size, hop) {
    return Math.max(Math.floor((len - size) / hop), 0);
  }

  /** Fundamental of one frame by autocorrelation, limited to 30-700 Hz. */
  function frameF0(x, start, size) {
    let mean = 0;
    for (let i = 0; i < size; i++) mean += x[start + i];
    mean /= size;
    const frame = new Float64Array(size);
    for (let i = 0; i < size; i++) frame[i] = x[start + i] - mean;
    if (rms(frame) < 1e-4) return null;
    const lo = Math.trunc(FS / 700), hi = Math.trunc(FS / 30);
    if (hi >= size) return null;
    const n = nextPow2(2 * size - 1);
    const F = rfft(frame, n);
    const re = new Float64Array(F.re.length), im = new Float64Array(F.re.length);
    for (let k = 0; k < re.length; k++) re[k] = F.re[k] * F.re[k] + F.im[k] * F.im[k];
    const corr = irfft(re, im, n);
    const k = argmax(corr, lo, hi);
    return corr[k] > 0.3 * corr[0] ? FS / k : null;
  }

  function analyzePerformance(dry, wet) {
    const n = Math.min(dry.length, wet.length);
    dry = dry.subarray(0, n);
    const w = wet.subarray(0, n);

    // Input level: how hard this player actually hits the pedal.
    const peak = n ? maxAbs(dry) : 0;
    const rd = rms(dry), rw = rms(w);
    const report = {
      seconds: pyRound(n / FS, 1),
      dryPeakDbfs: pyRound(db(peak), 1),
      dryRmsDbfs: pyRound(db(rd), 1),
      dryCrestDb: pyRound(db(peak) - db(rd), 1),
      wetCrestDb: pyRound(db(maxAbs(w)) - db(rw), 1),
    };

    // Average tonal balance of the actual playing, wet relative to dry.
    const size = 1 << 15;
    const ltas = (x) => {
      const count = frameCount(x.length, size, size / 2);
      if (!count) return null;
      const win = hanning(size);
      const acc = new Float64Array(size / 2 + 1);
      const frame = new Float64Array(size);
      for (let f = 0; f < count; f++) {
        for (let i = 0; i < size; i++) frame[i] = x[f * (size / 2) + i] * win[i];
        const { re, im } = rfft(frame, size);
        for (let k = 0; k < acc.length; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
      }
      return acc.map((v) => v / count);
    };
    const pd = ltas(dry), pw = ltas(w);
    if (pd !== null) {
      const val = rfftVal(size, 1 / FS), r6 = 2 ** (1 / 6);
      const band = (p, f) => {
        const [lo, hi] = binRange(val, f / r6, f * r6, p.length);
        let s = 0;
        for (let k = lo; k < hi; k++) s += p[k];
        return 10 * Math.log10(s / (hi - lo) + 1e-20);
      };
      // A band the dry take barely reaches says nothing about EQ.
      const dryLevels = new Map(BANDS_HZ.map((f) => [f, band(pd, f)]));
      const loudest = Math.max(...dryLevels.values());
      const diff = new Map();
      for (const f of BANDS_HZ) if (dryLevels.get(f) > loudest - 65) diff.set(f, band(pw, f) - dryLevels.get(f));
      const mids = [...diff].filter(([f]) => f >= 200 && f <= 2000).map(([, v]) => v);
      const ref = mids.length ? mids.reduce((s, v) => s + v, 0) / mids.length : 0.0;
      report.playedGainDb = {};
      for (const f of BANDS_HZ) report.playedGainDb[String(f)] = diff.has(f) ? npRound(diff.get(f) - ref, 1) : null;
    }

    // Level modulation: the wet envelope divided by the dry one.
    const hop = Math.trunc(FS * 0.005);
    const sq = (x) => {
      const out = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) out[i] = x[i] * x[i];
      return out;
    };
    const envD = movingAverageSame(sq(dry), hop * 4, hop).map(Math.sqrt);
    const envW = movingAverageSame(sq(w), hop * 4, hop).map(Math.sqrt);
    const liveThreshold = peak * 10 ** (-30 / 20);
    const liveIdx = [];
    for (let i = 0; i < envD.length; i++) if (envD[i] > liveThreshold) liveIdx.push(i);
    if (liveIdx.length > 400) {
      const level = liveIdx.map((i) => 20 * Math.log10(envD[i] + 1e-9));
      const gainLive = liveIdx.map((i) => 20 * Math.log10((envW[i] + 1e-9) / (envD[i] + 1e-9)));
      // Keep only what the input level does not explain.
      const fit = polyval(polyfit(level, gainLive, 3), level);
      const residual = Float64Array.from(gainLive, (g, j) => g - fit[j]);
      const gain = new Float64Array(envD.length);
      liveIdx.forEach((i, j) => { gain[i] = residual[j]; });
      const nfft = nextPow2(gain.length * 8);
      const win = hanning(gain.length);
      const spec = magnitude(rfft(gain.map((v, i) => v * win[i]), nfft));
      const val = rfftVal(nfft, hop / FS);
      const [s0, s1] = binRange(val, 0.5, 20, spec.length);
      const k = argmax(spec, s0, s1) - s0;
      const idx = s0 + k;
      const [a, b, c] = [idx - 1, idx, idx + 1].map((i) => Math.log(spec[i] + 1e-12));
      const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0.0;
      const rate = idx * val + shift * val;
      const sorted = sortedCopy(residual);
      const depth = percentile(null, 95, sorted) - percentile(null, 5, sorted);
      // Call it modulation only when it is deep and has a clear rate.
      const strong = spec[idx] > 4 * median(spec.subarray(s0, s1)) && depth >= 4 && k > 0 && k < s1 - s0 - 1;
      report.levelModulation = { rateHz: strong ? pyRound(rate, 2) : null, depthDb: pyRound(depth, 1) };
    }

    // Pitch: how much of the wet signal sits an octave below what was played.
    const fsize = 8192, fhop = 4096, pfft = 32768;
    const frames = frameCount(n, fsize, fhop);
    const win = hanning(fsize);
    const pval = rfftVal(pfft, 1 / FS);
    const below = [], at = [], dryBelow = [], dryAt = [];
    const buf = new Float64Array(fsize);
    const spectrumOf = (x, start) => {
      for (let i = 0; i < fsize; i++) buf[i] = x[start + i] * win[i];
      return rfft(buf, pfft);
    };
    const near = ({ re, im }, f) => {
      const [lo, hi] = binRange(pval, f * 0.95, f * 1.05, re.length);
      let m = -Infinity;
      for (let k = lo; k < hi; k++) m = Math.max(m, Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      return hi > lo ? m : 0.0;
    };
    for (let fr = 0; fr < frames; fr++) {
      const start = fr * fhop;
      const f0 = frameF0(dry, start, fsize);
      if (!f0 || f0 / 2 < 25) continue;
      const wetSpec = spectrumOf(w, start), drySpec = spectrumOf(dry, start);
      below.push(near(wetSpec, f0 / 2));
      at.push(near(wetSpec, f0));
      dryBelow.push(near(drySpec, f0 / 2));
      dryAt.push(near(drySpec, f0));
    }
    if (at.length > 5) {
      const wetRatio = db(median(below) / (median(at) + 1e-20));
      // Only what the preset adds counts: the dry signal shares the octave errors.
      const dryRatio = db(median(dryBelow) / (median(dryAt) + 1e-20));
      report.octaveDownDb = pyRound(wetRatio, 1);
      report.octaveDownAddedDb = pyRound(wetRatio - dryRatio, 1);
    }

    // What is left after the playing stops: delay and reverb tails.
    const quietThreshold = peak * 10 ** (-50 / 20);
    let lastNote = -1, anyQuiet = false;
    for (let i = 0; i < envD.length; i++) {
      if (envD[i] < quietThreshold) anyQuiet = true;
      else lastNote = i;
    }
    if (anyQuiet && lastNote >= 0) {
      const floor = envW.length > 40 ? median(envW.subarray(envW.length - 40)) : 0;
      const threshold = Math.max(floor * 4, maxAbs(w) * 10 ** (-60 / 20));
      let last = -1;
      for (let i = lastNote; i < envW.length; i++) if (envW[i] > threshold) last = i - lastNote;
      report.tailMs = last >= 0 ? Math.trunc(last * 5) : 0;
    }
    return report;
  }

  // --- reading the result ------------------------------------------------------------

  function ref(gains) {
    const keys = Object.keys(gains).filter((k) => Number(k) >= 200 && Number(k) <= 2000);
    return keys.reduce((s, k) => s + gains[k], 0) / keys.length;
  }

  function bandLabel(f) {
    if (f >= 1000 && f % 1000 === 0) return `${Math.floor(f / 1000)}k`;
    return f >= 1000 ? `${f / 1000}k` : String(f);
  }

  function summary(report) {
    const lines = [];
    for (const resp of report.response) {
      const gains = resp.gainDb, r = ref(gains);
      lines.push(`Frequency response @ ${resp.levelDbfs} dBFS in ` +
        `(round trip ${pyRepr(resp.roundTripMs)} ms incl. host buffers` +
        (resp.rt60s ? `, RT60 ${pyRepr(resp.rt60s)} s` : "") + ")");
      lines.push(`  overall gain ${pyFixed(r, 1, true)} dB (200 Hz - 2 kHz average); bands relative to that:`);
      const row = BANDS_HZ.map((f) => `${bandLabel(f).padStart(5)} ${pyFixed(gains[String(f)] - r, 1, true, 5)}`);
      for (let i = 0; i < row.length; i += 7) lines.push("   " + row.slice(i, i + 7).join("  "));
    }

    if (report.distortion) {
      lines.push("");
      lines.push("Distortion (THD %, H2 / H3 dB below the fundamental, even-vs-odd balance)");
      for (const level of TONE_LEVELS_DBFS) {
        const cells = report.distortion.filter((d) => d.levelDbfs === level);
        const text = cells.map((d) => `${d.freqHz}Hz ${pyFixed(d.thdPct, 1)}% (${pyFixed(d.h2Db, 0, true)}/${pyFixed(d.h3Db, 0, true)})`).join("  ");
        lines.push(`  in ${String(level).padStart(3)} dBFS: ${text}`);
      }
      const loud = report.distortion.filter((d) => d.levelDbfs === TONE_LEVELS_DBFS[TONE_LEVELS_DBFS.length - 1]);
      const balance = loud.reduce((s, d) => s + d.evenOddDb, 0) / loud.length;
      const lean = balance > 3 ? "even-order (warm, tube-like)" : balance < -3 ? "odd-order (hard, fuzz/clip-like)" : "mixed";
      lines.push(`  harmonic character when driven: ${lean}, even-odd ${pyFixed(balance, 1, true)} dB`);
      lines.push("  (measured at the chain output, so EQ after the drive stage tilts these:");
      lines.push("   a boosted 2 kHz inflates the H2 of a 1 kHz tone)");
    }

    if (report.dynamics) {
      const dyn = report.dynamics, curve = dyn.staticCurve;
      lines.push("");
      lines.push(`Dynamics @ ${dyn.probeHz} Hz (in -> out dBFS)`);
      lines.push("  " + curve.map((c) => `${c.inDbfs}->${pyFixed(c.outDbfs, 0)}`).join("  "));
      const top = curve.filter((c) => c.inDbfs >= -24);
      if (top.length >= 2) {
        const dIn = top[top.length - 1].inDbfs - top[0].inDbfs;
        const dOut = top[top.length - 1].outDbfs - top[0].outDbfs;
        const ratio = dOut > 0.1 ? dIn / dOut : Infinity;
        lines.push(`  effective ratio above -24 dBFS: ${pyFixed(ratio, 1)}:1  (1:1 = no compression; includes any clipping)`);
      }
      if ("error" in dyn) {
        lines.push(`  step test failed: ${dyn.error}`);
      } else {
        lines.push(`  a 20 dB jump: ${pyRepr(dyn.saturationDb)} dB lost instantly (saturation/clipping), ` +
          `${pyRepr(dyn.compressionDb)} dB more over time (compression)`);
        if (dyn.attackMs === null) lines.push("  too little compression to time its attack and release reliably");
        else lines.push(`  compressor attack ~${pyRepr(dyn.attackMs)} ms, release ~${pyRepr(dyn.releaseMs)} ms (63 % settling)`);
      }
    }

    const nz = report.noise;
    lines.push("");
    // The browser cannot record the instrument jack, so dryDbfs may be null.
    lines.push(`Noise floor: chain output ${pyRepr(nz.wetDbfs)} dBFS` +
      (nz.dryDbfs === null || nz.dryDbfs === undefined ? "" : `, instrument input ${pyRepr(nz.dryDbfs)} dBFS`));
    lines.push(`(${pyRepr(report.seconds)} s to measure)`);
    return lines.join("\n");
  }

  /** What changed between two measurements, band by band. */
  function compare(a, b) {
    const lines = ["Frequency response change (B - A, each relative to its own 200 Hz - 2 kHz level)"];
    const count = Math.min(a.response.length, b.response.length);
    for (let i = 0; i < count; i++) {
      const ra = a.response[i], rb = b.response[i];
      const ga = ra.gainDb, gb = rb.gainDb, refa = ref(ga), refb = ref(gb);
      lines.push(`  @ ${ra.levelDbfs} dBFS: overall level ${pyFixed(refb - refa, 1, true)} dB`);
      const notable = BANDS_HZ.map((f) => [f, (gb[String(f)] - refb) - (ga[String(f)] - refa)]).filter(([, d]) => Math.abs(d) >= 0.5);
      if (notable.length) lines.push("   " + notable.map(([f, d]) => `${f}Hz ${pyFixed(d, 1, true)}`).join("  "));
      else lines.push("   no band moved by 0.5 dB or more");
    }
    if (a.distortion && b.distortion) {
      lines.push("Distortion change (THD %)");
      const m = Math.min(a.distortion.length, b.distortion.length);
      for (let i = 0; i < m; i++) {
        const da = a.distortion[i], dbb = b.distortion[i];
        if (Math.abs(dbb.thdPct - da.thdPct) >= 0.5) {
          lines.push(`  ${da.freqHz} Hz @ ${da.levelDbfs} dBFS: ${pyRepr(da.thdPct)}% -> ${pyRepr(dbb.thdPct)}%`);
        }
      }
    }
    return lines.join("\n");
  }

  function performanceSummary(report) {
    const lines = [
      `Playing level: peaks ${pyRepr(report.dryPeakDbfs)} dBFS, average ${pyRepr(report.dryRmsDbfs)} dBFS ` +
        "at the instrument input",
      `Peak-to-average: dry ${pyRepr(report.dryCrestDb)} dB -> wet ${pyRepr(report.wetCrestDb)} dB ` +
        `(${pyFixed(report.dryCrestDb - report.wetCrestDb, 1, true)} dB of transient squashed)`,
    ];
    if (report.playedGainDb) {
      const g = report.playedGainDb;
      lines.push("Tonal balance of the actual playing, wet vs dry (relative to 200 Hz - 2 kHz;");
      lines.push("  '-' = the take has too little there to judge):");
      const row = BANDS_HZ.map((f) => (g[String(f)] !== null ? `${f}:${pyFixed(g[String(f)], 1, true)}` : `${f}:  -  `));
      for (let i = 0; i < row.length; i += 9) lines.push("   " + row.slice(i, i + 9).join("  "));
    }
    if (report.levelModulation) {
      const mod = report.levelModulation;
      if (mod.rateHz) lines.push(`Level moves at ${pyRepr(mod.rateHz)} Hz by ${pyRepr(mod.depthDb)} dB - a tremolo or similar`);
      else lines.push(`No periodic level movement (spread ${pyRepr(mod.depthDb)} dB, which is the dynamics)`);
    }
    if ("octaveDownDb" in report) {
      const octave = report.octaveDownDb;
      const added = "octaveDownAddedDb" in report ? report.octaveDownAddedDb : 99;
      if (octave <= -30 || added < 10) lines.push("Nothing an octave below the played note - no octaver or sub synth");
      else lines.push(`An octave below the played note sits ${pyFixed(octave, 1, true)} dB relative to the note ` +
        "- an octaver or sub synth");
    }
    if ("tailMs" in report) {
      const tail = report.tailMs;
      const kind = tail > 250 ? "a delay or reverb tail" : "just the cab and gate letting go, no delay or reverb";
      lines.push(`Sound continues ${tail} ms after the last note - ${kind}`);
    }
    return lines.join("\n");
  }

  // --- WAV -------------------------------------------------------------------------

  /** PCM 16/24/32-bit int and 32/64-bit float, plain or WAVE_FORMAT_EXTENSIBLE. */
  function parseWav(buffer) {
    const view = new DataView(buffer);
    const tag = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    if (buffer.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a RIFF/WAVE file");
    let fmt = null, data = null;
    for (let o = 12; o + 8 <= buffer.byteLength;) {
      const id = tag(o), size = view.getUint32(o + 4, true), body = o + 8;
      if (id === "fmt ") {
        let format = view.getUint16(body, true);
        const bits = view.getUint16(body + 14, true);
        if (format === 0xfffe && size >= 40) format = view.getUint16(body + 24, true);
        fmt = { format, channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true),
          block: view.getUint16(body + 12, true), bits };
      } else if (id === "data") {
        data = { offset: body, size: Math.min(size, buffer.byteLength - body) };
        if (fmt) break;
      }
      o = body + size + (size % 2);
    }
    if (!fmt || !data) throw new Error("WAV file without fmt or data chunk");
    const { format, channels, rate, bits } = fmt;
    const width = bits / 8, block = fmt.block || channels * width;
    const read = {
      "1:16": (o) => view.getInt16(o, true) / 32768,
      "1:24": (o) => ((view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getInt8(o + 2) << 16))) / 8388608,
      "1:32": (o) => view.getInt32(o, true) / 2147483648,
      "3:32": (o) => view.getFloat32(o, true),
      "3:64": (o) => view.getFloat64(o, true),
    }[`${format}:${bits}`];
    if (!read) throw new Error(`Unsupported WAV encoding: format ${format}, ${bits} bit`);
    const frames = Math.floor(data.size / block);
    const out = [];
    for (let c = 0; c < channels; c++) {
      const ch = new Float32Array(frames);
      for (let i = 0; i < frames; i++) ch[i] = read(data.offset + i * block + c * width);
      out.push(ch);
    }
    return { rate, channels: out };
  }

  /** 32-bit float mono WAV, laid out as scipy.io.wavfile writes it. */
  function encodeWav(samples, rate = FS) {
    const bytes = samples.length * 4;
    const buffer = new ArrayBuffer(58 + bytes);
    const v = new DataView(buffer);
    const put = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    put(0, "RIFF"); v.setUint32(4, 50 + bytes, true); put(8, "WAVE");
    put(12, "fmt "); v.setUint32(16, 18, true);
    v.setUint16(20, 3, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true);
    v.setUint16(32, 4, true); v.setUint16(34, 32, true); v.setUint16(36, 0, true);
    put(38, "fact"); v.setUint32(42, 4, true); v.setUint32(46, samples.length, true);
    put(50, "data"); v.setUint32(54, bytes, true);
    for (let i = 0; i < samples.length; i++) v.setFloat32(58 + 4 * i, samples[i], true);
    return buffer;
  }

  AT.dsp = {
    FS, BANDS_HZ, DIST_FREQS_HZ, SWEEP_LEVELS_DBFS, TONE_LEVELS_DBFS, LADDER_DBFS,
    db, rms,
    fft, rfft, irfft,
    sweep, tone, stepSignal,
    impulseResponse, smoothOctave, schroederRt60, latencySamples, analyzeResponse,
    harmonics, distortionPoint, ladderPoint, analyzeStep, noise,
    alignTake, analyzePerformance,
    summary, compare, performanceSummary,
    parseWav, encodeWav,
    np: { median, percentile, hanning, linspace, interp, movingAverageSame, polyfit, polyval },
    py: { round: pyRound, npRound, fixed: pyFixed, repr: pyRepr },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
