// Open web/index.html from file:// in headless Chrome over the DevTools protocol,
// report script errors, run a few checks inside the page and save screenshots.
// No pedal and no API key needed. Run: node web/test/smoke.mjs [outdir]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const page = "file://" + new URL("../index.html", import.meta.url).pathname;
const out = process.argv[2] || mkdtempSync(join(tmpdir(), "at-smoke-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "at-prof-"))}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const waiting = new Map(), errors = [];
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise(r => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
const shot = async (name, width, height) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(600);
  const { result } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(out, name), Buffer.from(result.data, "base64"));
};

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: page });
await sleep(2500);

const checks = await evaluate(`(async () => {
  const r = {};
  r.modules = ["dsp","device","blocks","store","Rig","ai","prompt","makeTools","charts","view","match","reference"].filter(k => !AT[k]);
  r.factoryBlocks = Object.keys(AT.blocks.catalog.factory).length;
  r.promptChars = AT.prompt.build({ rig: {}, language: "ko" }).length;
  r.tools = AT.makeTools({ dev: { connected: false }, aiConfig: () => ({}) }).map(t => t.name);
  // fake data through the real store and charts
  const D = AT.dsp, bands = {}; D.BANDS_HZ.forEach((f, i) => bands[f] = Math.sin(i / 3) * 6);
  await AT.store.saveMeasurement({ noise: { wetDbfs: -120, dryDbfs: null }, response: [{ levelDbfs: -24, roundTripMs: 20, gainDb: bands, rt60s: null }], seconds: 1 }, "smoke A", null, "test");
  const sr = 48000, n = sr * 4, dry = new Float32Array(n), wet = new Float32Array(n);
  for (let i = 0; i < n; i++) { const env = Math.exp(-(i % sr) / 6000); dry[i] = 0.3 * env * Math.sin(2 * Math.PI * 55 * i / sr); wet[i] = Math.tanh(2 * dry[i]) * 0.5; }
  const root = await AT.store.saveTake({ label: "smoke take", dry, analysis: { seconds: 4, dryPeakDbfs: -10, dryRmsDbfs: -20 }, by: "test" });
  const t0 = performance.now(); const analysis = D.analyzePerformance(dry, wet); r.analyzeMs = Math.round(performance.now() - t0);
  await AT.store.saveTake({ label: "smoke take → drive", wet, dryRef: root + ":dry", analysis, by: "test" });
  await AT.view.refresh();
  r.legendRows = document.querySelectorAll("#legend label").length;
  r.versions = document.querySelectorAll(".var[data-i]").length;
  r.validateEmpty = AT.blocks.validate({ type: "preset", version: 1, preset: {} }).length;
  return r;
})()`);
await shot("desktop-ko.png", 1400, 1000);
await evaluate(`document.querySelector('#lang [data-v="en"]').click()`);
await evaluate(`document.querySelector('#tabs [data-p="setup"]').click()`);
await shot("desktop-en-setup.png", 1400, 1000);
await evaluate(`document.querySelector('#tabs [data-p="pedal"]').click()`);
await shot("mobile-en-pedal.png", 390, 2200);
await evaluate(`document.querySelector('#tabs [data-p="assistant"]').click(); document.querySelector('#lang [data-v="ko"]').click()`);
const overflow = await evaluate(`document.documentElement.scrollWidth - innerWidth`);
await shot("mobile-ko.png", 390, 2200);

console.log(JSON.stringify({ checks, horizontalOverflowPx: overflow, errors, screenshots: out }, null, 1));
ws.close(); chrome.kill();
process.exit(errors.length || checks.modules.length ? 1 : 0);
