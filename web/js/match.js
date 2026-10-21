// Matching a reference tone: a region of an uploaded bass stem becomes a target,
// and a reamped take is scored against it.
//
// A stem's spectrum is the tone and the notes together, so the fair comparison is
// the reference against the player's own DI of the same part, reamped through the
// candidate preset. Without that DI only the overall spectral shape can be compared.
(function (root) {
  const AT = (root.AT = root.AT || {});

  const db = x => 10 * Math.log10(Math.max(x, 1e-20));

  function hann(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const k = (sorted.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
  }

  // The tonal and dynamic fingerprint of a signal at its own sample rate.
  function profile(x, rate) {
    const D = AT.dsp, bandsHz = D.BANDS_HZ;
    const size = 8192, hop = 4096, w = hann(size), half = size / 2;
    let peak = 0; for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; }

    // short-term level, 50 ms windows: how much the playing moves
    const win = Math.round(rate * 0.05), levels = [];
    for (let i = 0; i + win <= x.length; i += win) { let s = 0; for (let j = i; j < i + win; j++) s += x[j] * x[j]; levels.push(db(s / win)); }
    const loud = Math.max(...levels, -200), active = levels.filter(l => l > loud - 40).sort((a, b) => a - b);

    // long-term average spectrum over frames that carry playing, not silence
    const power = new Float64Array(half + 1);
    let frames = 0, sumSq = 0, count = 0;
    const frameGate = loud - 40;
    for (let i = 0; i + size <= x.length; i += hop) {
      let s = 0; for (let j = 0; j < size; j++) s += x[i + j] * x[i + j];
      if (db(s / size) < frameGate) continue;
      const buf = new Float64Array(size); for (let j = 0; j < size; j++) buf[j] = x[i + j] * w[j];
      const { re, im } = D.rfft(buf, size);
      for (let k = 0; k <= half; k++) power[k] += re[k] * re[k] + im[k] * im[k];
      frames++; sumSq += s; count += size;
    }
    if (!frames) return null;
    const binHz = rate / size;
    const band = f => { const lo = Math.ceil(f / 2 ** (1 / 6) / binHz), hi = Math.floor(f * 2 ** (1 / 6) / binHz); let s = 0, n = 0; for (let k = lo; k <= Math.min(hi, half); k++) { s += power[k]; n++; } return n ? db(s / n / frames) : -200; };
    const abs = {}; for (const f of bandsHz) abs[f] = f < rate / 2 ? band(f) : -200;
    const top = Math.max(...Object.values(abs));
    const mids = bandsHz.filter(f => f >= 200 && f <= 2000), ref = mids.reduce((a, f) => a + abs[f], 0) / mids.length;
    const bands = {}; for (const f of bandsHz) bands[f] = abs[f] > top - 60 ? +(abs[f] - ref).toFixed(1) : null;

    let num = 0, den = 0;
    for (let k = Math.ceil(40 / binHz); k <= Math.min(half, Math.floor(8000 / binHz)); k++) { num += k * binHz * power[k]; den += power[k]; }
    const rmsAct = Math.sqrt(sumSq / count);
    return {
      seconds: +(x.length / rate).toFixed(1), rate,
      bands,
      rmsDbfs: +(20 * Math.log10(Math.max(rmsAct, 1e-12))).toFixed(1),
      crestDb: +(20 * Math.log10(Math.max(peak, 1e-12)) - 20 * Math.log10(Math.max(rmsAct, 1e-12))).toFixed(1),
      spreadDb: +(percentile(active, 0.95) - percentile(active, 0.10)).toFixed(1),
      centroidHz: Math.round(num / Math.max(den, 1e-20)),
    };
  }

  // The EQ the preset needs: reference minus the player's dry DI, so the notes cancel.
  function targetCurve(ref, dry) {
    const out = {};
    for (const f of AT.dsp.BANDS_HZ) {
      const a = ref.bands[f], b = dry ? dry.bands[f] : 0;
      out[String(f)] = a == null || b == null ? null : +(a - b).toFixed(1);
    }
    return out;
  }

  // How far a candidate is from the reference, band by band (reference minus candidate).
  function gap(ref, cand) {
    const bands = {}, used = [];
    for (const f of AT.dsp.BANDS_HZ) {
      const a = ref.bands[f], b = cand.bands[f];
      if (a == null || b == null) { bands[f] = null; continue; }
      bands[f] = +(a - b).toFixed(1);
      if (f >= 40 && f <= 8000) used.push(bands[f]);
    }
    const score = Math.sqrt(used.reduce((s, v) => s + v * v, 0) / Math.max(used.length, 1));
    return {
      bandsDb: bands,
      toneErrorDb: +score.toFixed(1),
      crestGapDb: +(ref.crestDb - cand.crestDb).toFixed(1),
      spreadGapDb: +(ref.spreadDb - cand.spreadDb).toFixed(1),
      centroidGapHz: ref.centroidHz - cand.centroidHz,
    };
  }

  function gapSummary(g) {
    const fmt = f => f >= 1000 ? (f / 1000) + "k" : String(f);
    const big = Object.entries(g.bandsDb).filter(([, v]) => v != null && Math.abs(v) >= 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
    const lines = [`Tone error ${g.toneErrorDb} dB RMS over 40 Hz - 8 kHz (0 = identical balance).`];
    lines.push(big.length ? "Bands to move (reference minus candidate): " + big.map(([f, v]) => `${fmt(+f)} Hz ${v > 0 ? "+" : ""}${v}`).join(", ") : "No band is more than 2 dB away.");
    lines.push(`Peak-to-average: reference is ${g.crestGapDb > 0 ? "+" : ""}${g.crestGapDb} dB vs the candidate (negative = reference is more compressed).`);
    lines.push(`Level spread of the playing: ${g.spreadGapDb > 0 ? "+" : ""}${g.spreadGapDb} dB (negative = reference is more even).`);
    lines.push(`Spectral centroid: reference ${g.centroidGapHz > 0 ? "brighter" : "darker"} by ${Math.abs(g.centroidGapHz)} Hz.`);
    return lines.join("\n");
  }

  async function decode(file) {
    const ab = await file.arrayBuffer();
    try {
      const w = AT.dsp.parseWav(ab);
      const n = w.channels[0].length, mono = new Float32Array(n);
      for (const c of w.channels) for (let i = 0; i < n; i++) mono[i] += c[i] / w.channels.length;
      return { rate: w.rate, data: mono };
    } catch {
      // mp3, flac, m4a: let the browser decode at the file's own rate
      const ctx = new AudioContext();
      try {
        const buf = await ctx.decodeAudioData(ab);
        const n = buf.length, mono = new Float32Array(n);
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
        return { rate: buf.sampleRate, data: mono };
      } finally { ctx.close(); }
    }
  }

  AT.match = { profile, targetCurve, gap, gapSummary, decode };
})(typeof globalThis !== "undefined" ? globalThis : window);
