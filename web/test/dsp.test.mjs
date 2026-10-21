// Checks web/js/dsp.js against tools/measure.py on the fixtures that
// dsp_reference.py writes. Run: node web/test/dsp.test.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../js/dsp.js";

const dsp = globalThis.AT.dsp;
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
let E;
try {
  E = JSON.parse(readFileSync(path.join(FIX, "expected.json"), "utf8"));
} catch {
  console.error("No fixtures. Build them first: python3 web/test/dsp_reference.py");
  process.exit(2);
}

function arr(name) {
  const meta = E.arrays[name];
  const buf = readFileSync(path.join(FIX, `${name}.bin`));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return meta.type === "f64" ? new Float64Array(ab) : new Float32Array(ab);
}

function fileBuffer(name) {
  const buf = readFileSync(path.join(FIX, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const rows = [];
const timings = [];

function timed(label, fn) {
  const t0 = performance.now();
  const out = fn();
  timings.push([label, performance.now() - t0]);
  return out;
}

// One row per group: the worst deviation over every value compared in it.
class Group {
  constructor(name, tolText) { this.name = name; this.tolText = tolText; this.dev = 0; this.fail = []; this.count = 0; }
  num(label, got, exp, abs, rel = 0) {
    this.count++;
    if (exp === null || got === null || exp === undefined || got === undefined) {
      if (got !== exp && !(got == null && exp == null)) this.fail.push(`${label}: got ${got}, expected ${exp}`);
      return;
    }
    const d = Math.abs(got - exp);
    const allowed = Math.max(abs, rel * Math.abs(exp));
    this.dev = Math.max(this.dev, d);
    if (!(d <= allowed)) this.fail.push(`${label}: got ${got}, expected ${exp} (|d| ${d.toPrecision(3)} > ${allowed.toPrecision(3)})`);
  }
  arrays(label, got, exp, abs, scale = 1) {
    if (got.length !== exp.length) { this.fail.push(`${label}: length ${got.length} != ${exp.length}`); return; }
    let d = 0;
    for (let i = 0; i < exp.length; i++) d = Math.max(d, Math.abs(got[i] - exp[i]));
    this.count += exp.length;
    this.dev = Math.max(this.dev, d / scale);
    if (!(d / scale <= abs)) this.fail.push(`${label}: max |d| ${(d / scale).toPrecision(3)} > ${abs}`);
  }
  same(label, got, exp) {
    this.count++;
    if (JSON.stringify(got) !== JSON.stringify(exp)) {
      this.dev = Math.max(this.dev, 1);
      this.fail.push(`${label}:\n  got      ${JSON.stringify(got)}\n  expected ${JSON.stringify(exp)}`);
    }
  }
  text(label, got, exp) {
    this.count++;
    if (got === exp) return;
    const g = got.split("\n"), e = exp.split("\n");
    const lines = [];
    for (let i = 0; i < Math.max(g.length, e.length); i++) {
      if (g[i] !== e[i]) lines.push(`  line ${i + 1}\n    got      ${JSON.stringify(g[i])}\n    expected ${JSON.stringify(e[i])}`);
    }
    this.dev = Math.max(this.dev, lines.length);
    this.fail.push(`${label}: ${lines.length} line(s) differ\n${lines.slice(0, 6).join("\n")}`);
  }
  keys(label, got, exp) {
    const a = Object.keys(got).join(","), b = Object.keys(exp).join(",");
    if (a !== b) this.fail.push(`${label}: keys ${a} != ${b}`);
  }
  done() { rows.push(this); }
}

// --- Python / numpy semantics ---------------------------------------------

{
  const N = E.numpy;
  const g = new Group("python round / np.round / format / str", "exact");
  for (const [v, nd, py, np_] of N.round) {
    g.same(`round(${v}, ${nd})`, dsp.py.round(v, nd), py);
    g.same(`np.round(${v}, ${nd})`, dsp.py.npRound(v, nd), np_);
  }
  for (const [v, spec, text] of N.format) {
    const m = /^(\+?)(\d*)\.(\d)f$/.exec(spec);
    g.same(`format(${v}, '${spec}')`, dsp.py.fixed(v, Number(m[3]), m[1] === "+", Number(m[2] || 0)), text);
  }
  g.same("format(inf, '.1f')", dsp.py.fixed(Infinity, 1), "inf");
  for (const [v, text] of N.repr) g.same(`str(${v})`, dsp.py.repr(v), text);
  g.same("pow constants", [2 ** (1 / 12), 2 ** (1 / 6), 10 ** (-30 / 20), 10 ** (-50 / 20), 10 ** (-60 / 20)],
    Object.values(N.pow));
  g.done();
}

{
  const N = E.numpy;
  const a = arr(N.a), b = arr(N.b);
  const g = new Group("numpy helpers (convolve same, percentile, median, polyfit, hanning, interp)", "1e-9");
  for (const [m, name] of Object.entries(N.convSame)) g.arrays(`convolve same m=${m}`, dsp.np.movingAverageSame(a, Number(m)), arr(name), 1e-12);
  g.arrays("convolve same m=960 [::240]", dsp.np.movingAverageSame(a, 960, 240), arr(N.convSameStep), 1e-12);
  for (const [q, [pa, pb]] of Object.entries(N.percentile)) {
    g.num(`percentile a ${q}`, dsp.np.percentile(a, Number(q)), pa, 1e-12);
    g.num(`percentile b ${q}`, dsp.np.percentile(b, Number(q)), pb, 1e-12);
  }
  g.num("median odd", dsp.np.median(a), N.median[0], 0);
  g.num("median even", dsp.np.median(b), N.median[1], 0);
  const px = arr(N.polyX), py = arr(N.polyY);
  const coef = dsp.np.polyfit(px, py, 3);
  coef.forEach((c, i) => g.num(`polyfit c${i}`, c, N.polyfit[i], 1e-12, 1e-9));
  g.arrays("polyval", dsp.np.polyval(coef, px), arr(N.polyval), 1e-9);
  g.arrays("hanning(7)", dsp.np.hanning(7), N.hanning7, 1e-15);
  g.num("hanning(12000).sum()", dsp.np.hanning(12000).reduce((s, v) => s + v, 0), N.hanning12000Sum, 1e-9);
  N.interpAt.forEach((x, i) => g.num(`interp(${x})`, dsp.np.interp(x, px, py), N.interp[i], 1e-12));
  g.done();
}

{
  const N = E.numpy;
  const g = new Group("rfft / irfft vs numpy (4096, and 3000 padded to 8192)", "1e-9 rel");
  const x = arr(N.rfftIn);
  const X = dsp.rfft(x);
  const scale = Math.max(...arr(N.rfftRe).map(Math.abs));
  g.arrays("rfft re", X.re, arr(N.rfftRe), 1e-12, scale);
  g.arrays("rfft im", X.im, arr(N.rfftIm), 1e-12, scale);
  const P = dsp.rfft(x.subarray(0, 3000), 8192);
  g.arrays("rfft padded re", P.re, arr(N.rfftPadRe), 1e-12, scale);
  g.arrays("rfft padded im", P.im, arr(N.rfftPadIm), 1e-12, scale);
  g.arrays("irfft(rfft(x))", dsp.irfft(X.re, X.im, 4096), x, 1e-12);
  const big = new Float64Array(1 << 20).map((_, i) => Math.sin(i * 0.001) + ((i * 7919) % 1000) / 1000);
  const B = timed("rfft 2^20", () => dsp.rfft(big));
  const back = timed("irfft 2^20", () => dsp.irfft(B.re, B.im, 1 << 20));
  g.arrays("irfft(rfft(x)) 2^20", back, big, 1e-10);
  g.done();
}

{
  const N = E.numpy;
  const g = new Group("smoothOctave vs smooth_octave (32768 bins)", "1e-6 dB");
  const out = timed("smoothOctave 32768 bins", () => dsp.smoothOctave(arr(N.smoothFreqs), arr(N.smoothMags)));
  g.arrays("smoothed", out, arr(N.smoothOut), 1e-6);
  g.done();
}

// --- signals ----------------------------------------------------------------

{
  const S = E.signals;
  const g = new Group("sweep / tone / stepSignal vs Python float32", "1e-6 abs");
  g.arrays("sweep(100, 10000, 0.5, -24)", dsp.sweep(100, 10000, 0.5, -24), arr(S.sweepCal), 1e-6);
  g.arrays("sweep(20, 20000, 6, -24)", dsp.sweep(20, 20000, 6.0, -24), arr(S.sweep24), 1e-6);
  g.arrays("tone(110, 0.9, -12)", dsp.tone(110, 0.9, -12), arr(S.tone110), 1e-7);
  g.arrays("tone(55, 0.8, -60)", dsp.tone(55, 0.8, -60), arr(S.tone55), 1e-9);
  g.arrays("stepSignal(110)", dsp.stepSignal(110), arr(E.suites.a.step.signal), 1e-7);
  g.done();
}

// --- the measurement suite ----------------------------------------------------

for (const [tag, suite] of Object.entries(E.suites)) {
  const cal = suite.calibration;
  {
    const g = new Group(`[${tag}] latencySamples (Rig.calibrate)`, "exact");
    g.num("latency", dsp.latencySamples(arr(cal.played), arr(cal.recorded)), cal.latency, 0);
    g.done();
  }
  {
    const g = new Group(`[${tag}] impulseResponse vs Python (first 2 s)`, "1e-4 of peak");
    const ir = timed(`[${tag}] impulseResponse 6 s sweep + 3 s tail`, () => dsp.impulseResponse(arr(cal.irPlayed), arr(cal.irRecorded)));
    const ref = arr(cal.ir);
    const peak = Math.max(...ref.map(Math.abs));
    g.arrays("ir", ir.subarray(0, ref.length), ref, 1e-4, peak);
    g.done();
  }
  {
    const gb = new Group(`[${tag}] analyzeResponse gainDb`, "0.1 dB");
    const gr = new Group(`[${tag}] analyzeResponse roundTripMs, rt60s`, "exact, 5 % (or 0.001 s)");
    for (const r of suite.response) {
      const got = timed(`[${tag}] analyzeResponse @ ${r.level}`, () => dsp.analyzeResponse(arr(r.played), arr(r.recorded), r.level));
      gb.keys(`@${r.level}`, got, r.expected);
      for (const f of Object.keys(r.expected.gainDb)) gb.num(`@${r.level} ${f} Hz`, got.gainDb[f], r.expected.gainDb[f], 0.1);
      gr.num(`@${r.level} roundTripMs`, got.roundTripMs, r.expected.roundTripMs, 0);
      gr.num(`@${r.level} rt60s`, got.rt60s, r.expected.rt60s, 0.001, 0.05);
      gr.same(`@${r.level} levelDbfs`, got.levelDbfs, r.expected.levelDbfs);
    }
    gb.done();
    gr.done();
  }
  {
    const gd = new Group(`[${tag}] distortionPoint dB values (15 tones)`, "0.1 dB");
    const gt = new Group(`[${tag}] distortionPoint thdPct`, "2 % rel (or 0.01)");
    for (const d of suite.distortion) {
      const got = dsp.distortionPoint(arr(d.wet), d.freq, d.level);
      gd.keys(`${d.freq}@${d.level}`, got, d.expected);
      for (const [k, v] of Object.entries(d.expected)) {
        if (k === "thdPct") gt.num(`${d.freq}@${d.level} thd`, got[k], v, 0.01, 0.02);
        else gd.num(`${d.freq}@${d.level} ${k}`, got[k], v, k.endsWith("Db") || k.endsWith("Dbfs") ? 0.1 : 0);
      }
    }
    gd.done();
    gt.done();
  }
  {
    const g = new Group(`[${tag}] ladderPoint (16 levels)`, "0.01 dB");
    for (const l of suite.ladder) {
      const got = dsp.ladderPoint(arr(l.wet), l.level);
      g.same(`${l.level} in`, got.inDbfs, l.expected.inDbfs);
      g.num(`${l.level} out`, got.outDbfs, l.expected.outDbfs, 0.01);
    }
    g.done();
  }
  {
    const g = new Group(`[${tag}] analyzeStep`, "0.5 dB, 2 ms");
    const exp = suite.step.expected;
    const got = timed(`[${tag}] analyzeStep`, () => dsp.analyzeStep(arr(suite.step.wet), 110, exp.staticCurve));
    g.keys("keys", got, exp);
    g.num("saturationDb", got.saturationDb, exp.saturationDb, 0.5);
    g.num("compressionDb", got.compressionDb, exp.compressionDb, 0.5);
    g.num("attackMs", got.attackMs, exp.attackMs, 2);
    g.num("releaseMs", got.releaseMs, exp.releaseMs, 2);
    g.done();
  }
  {
    const g = new Group(`[${tag}] noise`, "0.1 dB");
    const got = dsp.noise(arr(suite.noise.wet));
    g.num("wetDbfs", got.wetDbfs, suite.noise.expected.wetDbfs, 0.1);
    g.done();
  }
}

{
  const g = new Group("analyzeStep error variant (dead pedal)", "exact");
  const exp = E.deadStep.expected;
  g.same("result", dsp.analyzeStep(arr(E.deadStep.wet), 110, exp.staticCurve), exp);
  g.done();
}

// --- whole reports, as the browser would assemble them --------------------------

{
  const g = new Group("JS-built measurement reports identical to Python's (a, b)", "exact JSON");
  for (const [tag, suite] of Object.entries(E.suites)) {
    const staticCurve = suite.ladder.map((l) => dsp.ladderPoint(arr(l.wet), l.level));
    const report = {
      // The browser has no dry input; borrow Python's figure so the reports compare.
      noise: { ...dsp.noise(arr(suite.noise.wet)), dryDbfs: E.reports[tag].noise.dryDbfs },
      response: suite.response.map((r) => dsp.analyzeResponse(arr(r.played), arr(r.recorded), r.level)),
      distortion: suite.distortion.map((d) => dsp.distortionPoint(arr(d.wet), d.freq, d.level)),
      dynamics: dsp.analyzeStep(arr(suite.step.wet), 110, staticCurve),
      seconds: E.reports[tag].seconds,
    };
    g.same(`report ${tag}`, report, E.reports[tag]);
    g.text(`summary ${tag} from the JS report`, dsp.summary(report), E.summaries[tag]);
  }
  const noDry = dsp.summary({ ...E.reports.q, noise: { wetDbfs: -98.5, dryDbfs: null } }).split("\n").at(-2);
  g.same("noise line without a dry input", noDry, "Noise floor: chain output -98.5 dBFS");
  g.done();
}

// --- text -----------------------------------------------------------------------

{
  const g = new Group("summary / compare text on Python reports", "exact");
  for (const [k, text] of Object.entries(E.summaries)) {
    // Python always has the instrument input; the JS line drops it only when it is null.
    g.text(`summary ${k}`, dsp.summary(E.reports[k]), text);
  }
  for (const [k, text] of Object.entries(E.compares)) g.text(`compare ${k}`, dsp.compare(E.reports[k[0]], E.reports[k[1]]), text);
  for (const [k, t] of Object.entries(E.takes)) g.text(`performanceSummary ${k}`, dsp.performanceSummary(t.expected), t.summary);
  g.done();
}

// --- played takes -------------------------------------------------------------------

{
  const dry = arr(E.takeDry);
  for (const [name, t] of Object.entries(E.takes)) {
    const wet = arr(t.wet);
    const trimmed = timed(`[${name}] alignTake 20 s`, () => dsp.alignTake(dry, wet));
    const ga = new Group(`[${name}] alignTake lag`, "exact");
    ga.num("lag", wet.length - trimmed.length, t.lag, 0);
    ga.done();

    const got = timed(`[${name}] analyzePerformance 20 s`, () => dsp.analyzePerformance(dry, trimmed));
    const exp = t.expected;
    const gl = new Group(`[${name}] analyzePerformance levels, playedGainDb`, "0.1 dB, null exact");
    gl.keys("keys", got, exp);
    for (const k of ["seconds", "dryPeakDbfs", "dryRmsDbfs", "dryCrestDb", "wetCrestDb"]) gl.num(k, got[k], exp[k], 0.1);
    gl.keys("playedGainDb keys", got.playedGainDb, exp.playedGainDb);
    for (const [f, v] of Object.entries(exp.playedGainDb)) gl.num(`played ${f}`, got.playedGainDb[f], v, 0.1);
    gl.done();
    const gm = new Group(`[${name}] levelModulation`, "rate 0.05 Hz, depth 0.2 dB");
    gm.num("rateHz", got.levelModulation.rateHz, exp.levelModulation.rateHz, 0.05);
    gm.num("depthDb", got.levelModulation.depthDb, exp.levelModulation.depthDb, 0.2);
    gm.done();
    const gx = new Group(`[${name}] analyzePerformance report identical to Python's`, "exact JSON");
    gx.same("report", got, exp);
    gx.done();
    const go = new Group(`[${name}] octaveDown, tailMs`, "0.5 dB, 10 ms");
    go.num("octaveDownDb", got.octaveDownDb, exp.octaveDownDb, 0.5);
    go.num("octaveDownAddedDb", got.octaveDownAddedDb, exp.octaveDownAddedDb, 0.5);
    go.num("tailMs", got.tailMs, exp.tailMs, 10);
    go.done();
  }
}

{
  // Timing only: a two-minute take through the alignment.
  const n = 48000 * 120;
  const dry = new Float32Array(n).map((_, i) => Math.sin(i * 0.01) * Math.exp(-((i % 30000) / 9000)));
  const wet = new Float32Array(n + 48000 * 3);
  wet.set(dry.map((v) => 0.5 * v), 12345);
  const trimmed = timed("alignTake 2 min take", () => dsp.alignTake(dry, wet));
  const g = new Group("alignTake 2 min synthetic (lag 12345 -> 12336 on the 48-sample grid)", "1 block");
  g.num("lag", wet.length - trimmed.length, 12336, 48);
  g.done();
}

// --- WAV ------------------------------------------------------------------------------

{
  const g = new Group("parseWav (int16, int24, int32, float32, float64, extensible 24/f32, odd chunk)", "exact");
  for (const c of E.wav) {
    const got = dsp.parseWav(fileBuffer(c.file));
    g.same(`${c.file} rate`, got.rate, c.rate);
    g.same(`${c.file} channels`, got.channels.length, c.channels.length);
    c.channels.forEach((name, i) => g.arrays(`${c.file} ch${i}`, got.channels[i], arr(name), 0));
  }
  const x = new Float32Array(48001).map((_, i) => Math.sin(i * 0.37) * 0.9 + (i % 7) * 1e-9);
  const back = dsp.parseWav(dsp.encodeWav(x, 48000));
  g.same("encodeWav round trip rate", back.rate, 48000);
  g.arrays("encodeWav round trip samples", back.channels[0], x, 0);
  g.done();
}

// --- report ----------------------------------------------------------------------------

const width = Math.max(...rows.map((r) => r.name.length));
console.log(`${"check".padEnd(width)}  result  max deviation  tolerance`);
for (const r of rows) {
  console.log(`${r.name.padEnd(width)}  ${r.fail.length ? "FAIL" : "pass"}    ${r.dev.toPrecision(3).padStart(11)}  ${r.tolText}`);
}
console.log("\ntimings");
for (const [label, ms] of timings) console.log(`  ${label.padEnd(44)} ${ms.toFixed(0).padStart(6)} ms`);
const failed = rows.filter((r) => r.fail.length);
for (const r of failed) console.log(`\nFAIL ${r.name}\n  ${r.fail.slice(0, 8).join("\n  ")}`);
console.log(`\n${rows.length - failed.length}/${rows.length} checks pass`);
process.exit(failed.length ? 1 : 0);
