// Sanity of web/js/match.js: a reference made from the DI with a known EQ must
// score that EQ back, and a signal against itself must score zero.
// Run: node web/test/match.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const root = new URL("../..", import.meta.url).pathname;
const ctx = { console, Float32Array, Float64Array, Math }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ["web/js/dsp.js", "web/js/match.js"]) vm.runInContext(readFileSync(root + f, "utf8"), ctx);
const { match: M } = ctx.AT;

// plucked bass-like DI: decaying harmonics on a few notes
const sr = 48000, n = sr * 12, di = new Float32Array(n);
const notes = [41.2, 55, 73.4, 61.7];
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < n; i++) {
  const k = Math.floor(i / (sr * 0.75)), f = notes[k % 4], tt = (i % (sr * 0.75)) / sr, env = Math.exp(-tt * 3);
  let v = 0; for (let h = 1; f * h < 12000; h++) v += Math.sin(2 * Math.PI * f * h * tt) * Math.exp(-tt * h * 0.4) / h ** 0.9;
  const pick = tt < 0.02 ? (rnd() - 0.5) * (1 - tt / 0.02) : 0;   // finger/pick click
  di[i] = 0.15 * env * v + 0.3 * pick + 1e-4 * (rnd() - 0.5);
}
// reference = DI through a high shelf: +6 dB above ~2 kHz (one-pole split)
const ref = new Float32Array(n); let lp = 0; const a = Math.exp(-2 * Math.PI * 2000 / sr);
for (let i = 0; i < n; i++) { lp = (1 - a) * di[i] + a * lp; ref[i] = lp + (di[i] - lp) * 2; }

const pDi = M.profile(di, sr), pRef = M.profile(ref, sr);
const self = M.gap(pDi, pDi), shelf = M.gap(pRef, pDi);
const curve = M.targetCurve(pRef, pDi);
console.log("self tone error", self.toneErrorDb);
console.log("shelf gap 250/1k/4k/8k:", [250, 1000, 4000, 8000].map(f => shelf.bandsDb[f]).join(" / "), "error", shelf.toneErrorDb);
console.log("target curve 4k", curve["4000"], "centroid gap", shelf.centroidGapHz);
console.log(M.gapSummary(shelf));
// ideal response of the shelf: H = 2 - Hlp, normalised to its 200 Hz - 2 kHz mean like the profile
const H = f => { const w = 2 * Math.PI * f / sr, re = 1 - a * Math.cos(w), im = a * Math.sin(w), d = re * re + im * im;
  const lr = (1 - a) * re / d, li = -(1 - a) * im / d; return 20 * Math.log10(Math.hypot(2 - lr, -li)); };
const bands = ctx.AT.dsp.BANDS_HZ, mids = bands.filter(f => f >= 200 && f <= 2000);
const norm = mids.reduce((s, f) => s + H(f), 0) / mids.length;
const worst = Math.max(...bands.filter(f => f >= 60 && f <= 8000).map(f => Math.abs(shelf.bandsDb[f] - (H(f) - norm))));
console.log("max deviation from the ideal shelf, 60 Hz - 8 kHz:", worst.toFixed(2), "dB");
const ok = self.toneErrorDb === 0 && worst < 1.0 && curve["4000"] === shelf.bandsDb[4000] && shelf.centroidGapHz > 0;
console.log(ok ? "pass" : "FAIL"); process.exit(ok ? 0 : 1);
