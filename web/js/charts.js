// Charts and the take comparison player, carried over from tools/studio.html.
// The app supplies AT.view (t, render, refresh, reampFromPage, presetSlots).
(function (root) {
  const AT = (root.AT = root.AT || {});
  const t = (k, ...a) => AT.view.t(k, ...a);
const BANDS = [30,40,60,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000];
const COLORS = ["--s1","--s2","--s3","--s4"];
const MAX_SHOWN = 4;
let S = { measurements: [], takes: [], targets: [] };
let shown = [];            // ids of series on the chart, in the order they were picked
const colorOf = {};        // id -> color slot; follows the series, not its rank
let level = 0, focusId = null, lastKeys = {}, kindFilter = "all", groupId = null;

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmtHz = (f) => f >= 1000 ? (f / 1000) + "k" : String(f);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (ts) => { const s = Date.now() / 1000 - ts; return s < 90 ? t("now") : s < 5400 ? t("min", Math.round(s / 60)) : s < 129600 ? t("hr", Math.round(s / 3600)) : t("day", Math.round(s / 86400)); };
const sign = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d);
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);


function ref(g) { const k = BANDS.filter(f => f >= 200 && f <= 2000 && g[f] != null); return k.reduce((a, f) => a + g[f], 0) / k.length; }

// The words every visible name shares at the start, so chart labels show what differs.
function commonPrefix(names) {
  if (names.length < 2) return "";
  let p = names[0];
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1);
  const cut = Math.max(p.lastIndexOf(" · "), p.lastIndexOf(" → "), p.lastIndexOf(" "));
  return cut > 0 ? p.slice(0, cut + (p[cut + 1] === "·" || p[cut + 1] === "→" ? 3 : 1)) : "";
}

// ---------- takes: recordings and their reamps ----------
const ownRecording = (tk) => tk.files.dry ? tk.files.dry.startsWith(tk.id + ":") : !!tk.files.wet;
function groups() {
  const roots = S.takes.filter(ownRecording);
  return roots.map(r => ({ root: r, reamps: S.takes.filter(x => x !== r && r.files.dry && x.files.dry === r.files.dry) })).reverse();
}
const shortName = (root, tk) => tk.label.startsWith(root.label + " → ") ? tk.label.slice(root.label.length + 3) : tk.label;

// Every curve the chart can show, as {id, name, kind, by, values{band:dB}}
function series() {
  const out = [];
  for (const m of S.measurements) {
    const r = m.report.response[Math.min(level, m.report.response.length - 1)];
    const r0 = ref(r.gainDb);
    const v = {}; BANDS.forEach(f => v[f] = r.gainDb[f] - r0);
    out.push({ id: m.id, name: m.label, kind: "measured", by: m.by, t: m.created, values: v, slot: m.slot });
  }
  for (const tk of S.takes) {
    const g = tk.analysis && tk.analysis.playedGainDb; if (!g) continue;
    const v = {}; BANDS.forEach(f => v[f] = g[f]);
    out.push({ id: tk.id, name: tk.label, kind: "played", by: tk.by, t: tk.created, values: v, slot: tk.slot });
  }
  for (const tg of S.targets) {
    const r0 = ref(tg.gainDb); const v = {}; BANDS.forEach(f => v[f] = tg.gainDb[f] - r0);
    out.push({ id: tg.id, name: tg.name, kind: "target", note: tg.note, t: tg.created, values: v });
  }
  return out;
}

function pickColor(id) {
  if (colorOf[id]) return colorOf[id];
  const used = new Set(shown.filter(x => x !== id).map(x => colorOf[x]));
  colorOf[id] = COLORS.find(c => !used.has(c)) || COLORS[0];
  return colorOf[id];
}
const strokeOf = (s) => s.kind === "target" ? css("--ink-2") : css(pickColor(s.id));
const dashOf = (s) => s.kind === "target" ? "6 5" : s.kind === "played" ? "2 4" : "";

function toggleShown(id, on) {
  if (on) { if (!shown.includes(id)) shown.push(id); if (shown.length > MAX_SHOWN) shown.shift(); }
  else shown = shown.filter(x => x !== id);
  if (on && S.measurements.some(m => m.id === id && m.report.dynamics)) focusId = id;
}

// ---------- frequency response chart ----------
function drawFR() {
  const box = $("fr"); const W = Math.max(box.clientWidth, 280), H = Math.round(Math.max(220, Math.min(380, W * 0.5)));
  const m = { l: 34, r: 8, t: 10, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const lo = Math.log10(25), hi = Math.log10(18000), y0 = -36, y1 = 18;
  const x = f => m.l + (Math.log10(f) - lo) / (hi - lo) * iw;
  const y = d => m.t + (y1 - Math.max(y0, Math.min(y1, d))) / (y1 - y0) * ih;
  const all = series(); const vis = shown.map(id => all.find(s => s.id === id)).filter(Boolean);
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("fr"))}">`;
  const step = ih < 220 ? 12 : 6;
  for (let d = y0; d <= y1; d += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(d)}" y2="${y(d)}" stroke="${css(d === 0 ? "--axis" : "--grid")}" stroke-width="1"/><text x="${m.l - 6}" y="${y(d) + 4}" text-anchor="end" font-size="11" fill="${css("--muted")}">${d > 0 ? "+" + d : d}</text>`;
  const ticks = W < 480 ? [50, 100, 500, 1000, 5000, 10000] : [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  for (const f of ticks) g += `<line x1="${x(f)}" x2="${x(f)}" y1="${m.t}" y2="${m.t + ih}" stroke="${css("--grid")}"/><text x="${x(f)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${css("--muted")}">${fmtHz(f)}</text>`;
  g += `<text x="${W - m.r}" y="${H - 8}" text-anchor="end" font-size="11" fill="${css("--muted")}">Hz</text>`;
  for (const s of vis) {
    const pts = BANDS.filter(f => s.values[f] != null).map(f => `${x(f).toFixed(1)},${y(s.values[f]).toFixed(1)}`).join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${strokeOf(s)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${dashOf(s) ? `stroke-dasharray="${dashOf(s)}"` : ""}/>`;
  }
  // direct labels: only the part of each name that differs, placed in the open mids
  if (vis.length && vis.length <= 4 && W >= 420) {
    const pre = commonPrefix(vis.map(s => s.name)), placed = [];
    for (const s of vis) {
      const f = 1250; if (s.values[f] == null) continue;
      let yy = y(s.values[f]) - 8; while (placed.some(p => Math.abs(p - yy) < 14)) yy += 14; placed.push(yy);
      const text = s.name.slice(pre.length) || s.name;
      g += `<text x="${x(f)}" y="${yy}" font-size="11" fill="${css("--ink-2")}" text-anchor="middle" stroke="${css("--surface")}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${esc(text.length > 26 ? text.slice(0, 25) + "…" : text)}</text>`;
    }
  }
  g += `<line id="xh" y1="${m.t}" y2="${m.t + ih}" stroke="${css("--ink-2")}" stroke-width="1" visibility="hidden"/>`;
  g += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" id="hit"/></svg>`;
  if (!vis.length) g += `<div class="empty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${esc(t("frEmpty"))}</div>`;
  box.innerHTML = g + `<div class="tip" id="tip" hidden></div>`;
  const hit = box.querySelector("#hit"), xh = box.querySelector("#xh"), tip = box.querySelector("#tip");
  hit.addEventListener("pointermove", e => {
    if (!vis.length) return;
    const rect = box.querySelector("svg").getBoundingClientRect(), sx = (e.clientX - rect.left) * W / rect.width;
    const f = BANDS.reduce((a, b) => Math.abs(x(b) - sx) < Math.abs(x(a) - sx) ? b : a);
    xh.setAttribute("x1", x(f)); xh.setAttribute("x2", x(f)); xh.setAttribute("visibility", "visible");
    tip.innerHTML = `<div style="color:${css("--muted")};margin-bottom:3px">${fmtHz(f)} Hz</div>` + vis.map(s =>
      `<div><span style="display:inline-block;width:12px;border-top:2px ${s.kind === "measured" ? "solid" : s.kind === "played" ? "dotted" : "dashed"} ${strokeOf(s)};vertical-align:middle;margin-right:6px"></span>${esc(s.name).slice(0, 34)} <b>${s.values[f] == null ? "–" : sign(s.values[f]) + " dB"}</b></div>`).join("");
    tip.hidden = false;
    const px = x(f) * rect.width / W;
    tip.style.left = Math.max(0, Math.min(px + 12, rect.width - tip.offsetWidth - 4)) + "px"; tip.style.top = "8px";
  });
  hit.addEventListener("pointerleave", () => { xh.setAttribute("visibility", "hidden"); tip.hidden = true; });
  $("frtable").innerHTML = vis.length ? `<div class="scroll"><table><tr><th>Hz</th>${vis.map(s => `<th>${esc(s.name).slice(0, 18)}</th>`).join("")}</tr>${BANDS.map(f => `<tr><td>${fmtHz(f)}</td>${vis.map(s => `<td>${s.values[f] == null ? "–" : s.values[f].toFixed(1)}</td>`).join("")}</tr>`).join("")}</table></div>` : "";
}

function drawLegend() {
  const all = series().sort((a, b) => b.t - a.t);
  const counts = { all: all.length, measured: 0, played: 0, target: 0 }; all.forEach(s => counts[s.kind]++);
  $("kinds").innerHTML = all.length ? [["all", "all"], ["measured", "measured"], ["played", "played"], ["target", "targets"]]
    .filter(([k]) => k === "all" || counts[k]).map(([k, label]) => `<button data-k="${k}" class="${kindFilter === k ? "on" : ""}">${esc(t(label))} ${counts[k]}</button>`).join("") : "";
  $("kinds").querySelectorAll("button").forEach(b => b.onclick = () => { kindFilter = b.dataset.k; drawLegend(); });
  const list = all.filter(s => kindFilter === "all" || s.kind === kindFilter);
  $("legend").innerHTML = list.map(s => {
    const on = shown.includes(s.id);
    const col = on ? strokeOf(s) : css("--axis");
    const kind = s.kind === "target" ? t("target") : s.kind === "played" ? t("playedTake") : t("measuredK");
    const del = s.kind !== "played" ? `<button class="ghost x" data-del="${s.id}" data-kind="${s.kind === "target" ? "targets" : "measurements"}" title="✕">✕</button>` : "";
    return `<label title="${esc(s.note || s.name)}"><input type="checkbox" data-id="${s.id}" ${on ? "checked" : ""}>
      <span class="sw ${s.kind === "target" ? "dash" : s.kind === "played" ? "dot" : ""}" style="border-top-color:${col}"></span>
      <span class="name">${esc(s.name)}</span><span class="meta">${kind}${s.by ? " · " + s.by : ""} · ${ago(s.t)}</span>${del}</label>`;
  }).join("");
  $("legend").querySelectorAll("input").forEach(cb => cb.onchange = () => { toggleShown(cb.dataset.id, cb.checked); AT.view.render(true); });
  $("legend").querySelectorAll("[data-del]").forEach(b => b.onclick = async (e) => {
    e.preventDefault(); if (!confirm(t("confirmDel"))) return;
    await AT.store.remove(b.dataset.kind, b.dataset.del); shown = shown.filter(x => x !== b.dataset.del); AT.view.refresh();
  });
}

// ---------- compare takes: one transport over every version of a performance ----------
const P = { ctx: null, key: null, bufs: {}, peaks: {}, gain: {}, srcs: [], nodes: {}, active: 0, offset: 0, startAt: 0, playing: false,
  match: AT.store.settings.get("match", true), raf: 0, dur: 0, loading: false };

function versions(gr) {
  const r = gr.root, out = r.files.dry ? [{ id: r.id + ":dry", file: r.files.dry, name: t("dry"), a: null, take: null }] : [];
  if (r.files.wet) out.push({ id: r.id + ":wet", file: r.files.wet, name: t("asRecorded"), a: r.analysis, take: r });
  for (const x of gr.reamps) if (x.files.wet) out.push({ id: x.id, file: x.files.wet, name: shortName(r, x), sub: x.slot, a: x.analysis, take: x });
  return out;
}


function stopSources() { for (const s of P.srcs) { try { s.stop(); } catch {} } P.srcs = []; }
function position() { return P.playing ? Math.min(P.dur, P.offset + P.ctx.currentTime - P.startAt) : P.offset; }

async function loadGroup(gr) {
  const vs = versions(gr), key = vs.map(v => v.file).join("|");
  if (P.key === key) return vs;
  pause(); P.key = key; P.bufs = {}; P.peaks = {}; P.gain = {}; P.loading = true;
  P.ctx = P.ctx || new (window.AudioContext || window.webkitAudioContext)();
  await Promise.all(vs.map(async v => {
    try {
      const d = await AT.store.audio(v.file); if (!d) return;
      const buf = P.ctx.createBuffer(1, Math.max(1, d.length), 48000); buf.copyToChannel(d, 0);
      P.bufs[v.id] = buf;
      const n = 600, step = Math.max(1, Math.floor(d.length / n)), pk = new Float32Array(n);
      let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      for (let i = 0; i < n; i++) { let mx = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j++) { const a = Math.abs(d[j]); if (a > mx) mx = a; } pk[i] = mx; }
      P.peaks[v.id] = pk; v.rms = Math.sqrt(sum / d.length);
      P.gain[v.id] = v.rms;
    } catch { /* missing file: the version just stays silent */ }
  }));
  P.dur = Math.max(0, ...Object.values(P.bufs).map(b => b.duration));
  P.loading = false;
  return vs;
}

function levelGain(id) {
  if (!P.match) return 1;
  const quietest = Math.min(...Object.values(P.gain).filter(x => x > 0));
  return P.gain[id] > 0 ? quietest / P.gain[id] : 1;
}

function play(vs) {
  if (!P.ctx || P.loading) return;
  P.ctx.resume(); stopSources(); P.nodes = {};
  if (P.offset >= P.dur - 0.05) P.offset = 0;
  const when = P.ctx.currentTime + 0.03;
  vs.forEach((v, i) => {
    const buf = P.bufs[v.id]; if (!buf) return;
    const src = P.ctx.createBufferSource(), g = P.ctx.createGain();
    src.buffer = buf; g.gain.value = i === P.active ? levelGain(v.id) : 0;
    src.connect(g).connect(P.ctx.destination); src.start(when, Math.min(P.offset, buf.duration));
    P.srcs.push(src); P.nodes[v.id] = g;
  });
  P.startAt = when; P.playing = true; tick();
}
function pause() { if (P.playing) { P.offset = position(); P.playing = false; } stopSources(); cancelAnimationFrame(P.raf); drawHead(); }
function select(vs, i) {
  if (i < 0 || i >= vs.length) return; P.active = i;
  if (P.playing) { const now = P.ctx.currentTime; vs.forEach((v, j) => { const g = P.nodes[v.id]; if (g) g.gain.setTargetAtTime(j === i ? levelGain(v.id) : 0, now, 0.008); }); }
  drawWave(vs); document.querySelectorAll(".var[data-i]").forEach(r => r.classList.toggle("on", +r.dataset.i === i));
}
function seek(vs, frac) { const was = P.playing; pause(); P.offset = frac * P.dur; if (was) play(vs); else drawHead(); }
function tick() { drawHead(); if (P.playing && position() >= P.dur) { pause(); P.offset = 0; drawHead(); $("pp") && ($("pp").textContent = "▶"); return; } if (P.playing) P.raf = requestAnimationFrame(tick); }
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function drawHead() {
  const h = document.querySelector(".wave .head"); if (!h) return;
  const p = position(); h.style.left = (P.dur ? p / P.dur * 100 : 0) + "%";
  $("clock").textContent = `${clock(p)} / ${clock(P.dur)}`;
}
function drawWave(vs) {
  const cv = document.querySelector(".wave canvas"); if (!cv) return;
  const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext("2d"); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
  const v = vs[P.active], pk = v && P.peaks[v.id]; if (!pk) return;
  const g = levelGain(v.id), mx = Math.max(...Object.keys(P.peaks).map(k => Math.max(...P.peaks[k]) * levelGain(k))) || 1;
  const bw = w / pk.length;
  c.fillStyle = css(P.active === 0 ? "--wave" : "--accent");
  for (let i = 0; i < pk.length; i++) { const a = Math.max(1, pk[i] * g / mx * (h - 4)); c.fillRect(i * bw, (h - a) / 2, Math.max(1, bw - 0.6), a); }
}

function cellsOf(a) {
  if (!a) return { squash: "", tail: "", mod: "", oct: "" };
  const squash = a.dryCrestDb != null ? sign(-(a.dryCrestDb - a.wetCrestDb)) + " dB" : "–";
  const tail = a.tailMs != null ? a.tailMs + " ms" : "–";
  const mod = a.levelModulation && a.levelModulation.rateHz ? `${a.levelModulation.rateHz} Hz` : "–";
  const oct = a.octaveDownDb != null && a.octaveDownDb > -30 && (a.octaveDownAddedDb ?? 0) >= 10 ? `+${a.octaveDownAddedDb} dB` : "–";
  return { squash, tail, mod, oct };
}

function drawCompare() {
  const gs = groups();
  $("group").hidden = $("delgroup").hidden = !gs.length;
  if (!gs.length) { pause(); P.key = null; $("cmp").innerHTML = `<div class="empty">${esc(t("noTakes"))}</div>`; return; }
  if (!gs.some(g => g.root.id === groupId)) groupId = (gs.find(g => g.reamps.length) || gs[0]).root.id;
  $("group").innerHTML = gs.map(g => `<option value="${g.root.id}" ${g.root.id === groupId ? "selected" : ""}>${esc(g.root.label)} · ${g.reamps.length + 1} · ${ago(g.root.created)}</option>`).join("");
  const gr = gs.find(g => g.root.id === groupId), vs = versions(gr), r = gr.root.analysis || {};
  if (P.active >= vs.length) P.active = 0;
  const pp = P.loading ? "…" : P.playing ? "❚❚" : "▶";
  $("cmp").innerHTML = `
    <div class="player">
      <button class="play" id="pp" aria-label="play">${pp}</button>
      <div class="wave" id="wave"><canvas></canvas><span class="head"></span></div>
      <span class="clock" id="clock">0:00 / ${clock(P.dur)}</span>
    </div>
    <div class="row hint" style="margin-bottom:8px">
      <label title="${esc(t("matchTip"))}" style="display:flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" id="match" ${P.match ? "checked" : ""}>${esc(t("match"))}</label>
      <span>${t("keys")}</span>
      ${r.dryPeakDbfs != null ? `<span style="margin-left:auto">${esc(t("playingAt", r.dryPeakDbfs, r.dryRmsDbfs))}</span>` : ""}
    </div>
    <div class="variants">
      <div class="var head"><span></span><span>${esc(t("colName"))}</span><span class="n">${esc(t("colSquash"))}</span><span class="n">${esc(t("colTail"))}</span><span class="n">${esc(t("colMod"))}</span><span class="n">${esc(t("colOct"))}</span><span title="${esc(t("onChart"))}">📈</span><span></span></div>
      ${vs.map((v, i) => { const c = cellsOf(v.a), sum = v.a ? [c.squash, c.tail !== "–" ? c.tail : "", c.mod !== "–" ? c.mod : "", c.oct !== "–" ? c.oct : ""].filter(Boolean).join(" · ") : "";
        return `<div class="var ${i === P.active ? "on" : ""}" data-i="${i}">
          <span class="k">${i < 9 ? i + 1 : ""}</span>
          <span class="nm" title="${esc(v.name)}">${esc(v.name)}${v.sub ? `<small>${esc(v.sub)}</small>` : ""}</span>
          <span class="n">${c.squash}</span><span class="n">${c.tail}</span><span class="n">${c.mod}</span><span class="n">${c.oct}</span>
          <span>${v.take && v.take.analysis && v.take.analysis.playedGainDb ? `<input type="checkbox" data-chart="${v.take.id}" ${shown.includes(v.take.id) ? "checked" : ""} title="${esc(t("onChart"))}">` : ""}</span>
          <span>${v.take && v.take !== gr.root ? `<button class="ghost" data-deltake="${v.take.id}" title="✕">✕</button>` : ""}</span>
          ${sum ? `<span class="sum">${esc(sum)}</span>` : ""}
        </div>`; }).join("")}
    </div>
    <div class="row" style="margin-top:10px">
      ${gr.root.files.dry ? `<select id="rslot"><option value="">${esc(t("current"))}</option>${(AT.view.presetSlots || []).map(p => `<option value="${esc(p.slot)}">${esc(p.slot)} · ${esc(p.name)}</option>`).join("")}</select>
      <button id="reampbtn">${esc(t("reampThrough"))}</button>` : ""}
    </div>`;
  const ready = async () => { await loadGroup(gr); $("pp").textContent = P.playing ? "❚❚" : "▶"; drawWave(vs); drawHead(); };
  $("pp").onclick = async () => { if (P.playing) { pause(); $("pp").textContent = "▶"; return; } $("pp").textContent = "…"; await ready(); play(vs); $("pp").textContent = "❚❚"; };
  $("wave").onclick = async (e) => { const rc = $("wave").getBoundingClientRect(); await ready(); seek(vs, (e.clientX - rc.left) / rc.width); };
  $("match").onchange = () => { P.match = $("match").checked; AT.store.settings.set("match", P.match); select(vs, P.active); };
  $("cmp").querySelectorAll(".var[data-i]").forEach(row => row.onclick = (e) => { if (e.target.closest("input,button")) return; select(vs, +row.dataset.i); });
  $("cmp").querySelectorAll("[data-chart]").forEach(cb => cb.onchange = () => { toggleShown(cb.dataset.chart, cb.checked); AT.view.render(true); });
  $("cmp").querySelectorAll("[data-deltake]").forEach(b => b.onclick = async () => { if (!confirm(t("confirmDel"))) return; await AT.store.remove("takes", b.dataset.deltake); P.key = null; AT.view.refresh(); });
  if ($("reampbtn")) $("reampbtn").onclick = () => AT.view.reampFromPage(gr.root.id, $("rslot").value);
  P.vs = vs;
  if (P.key === vs.map(v => v.file).join("|")) { drawWave(vs); drawHead(); } else ready();
}

// ---------- dynamics & distortion for the focused measurement ----------
function focused() {
  const full = S.measurements.filter(m => m.report.dynamics);
  return full.find(m => m.id === focusId) || full[full.length - 1];
}

function drawDetail() {
  const full = S.measurements.filter(m => m.report.dynamics), m = focused();
  $("focus").hidden = full.length < 2;
  $("focus").innerHTML = [...full].reverse().map(x => `<option value="${x.id}" ${m && x.id === m.id ? "selected" : ""}>${esc(x.label)}</option>`).join("");
  if (!m) { $("dyn").innerHTML = `<div class="empty">${esc(t("runFull"))}</div>`; $("dyn-facts").innerHTML = ""; $("dist").innerHTML = ""; $("dist-note").textContent = ""; return; }
  const d = m.report.dynamics, curve = d.staticCurve;
  const W = Math.max($("dyn").clientWidth, 240), H = Math.round(W * 0.62), mg = { l: 36, r: 10, t: 8, b: 26 };
  const iw = W - mg.l - mg.r, ih = H - mg.t - mg.b, lo = -60, hi = 0;
  const X = v => mg.l + (v - lo) / (hi - lo) * iw, Y = v => mg.t + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * ih;
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("dyn"))}">`;
  for (let v = lo; v <= hi; v += 12) g += `<line x1="${mg.l}" x2="${W - mg.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("--grid")}"/><text x="${mg.l - 5}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="${css("--muted")}">${v}</text><line x1="${X(v)}" x2="${X(v)}" y1="${mg.t}" y2="${mg.t + ih}" stroke="${css("--grid")}"/><text x="${X(v)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="${css("--muted")}">${v}</text>`;
  const mid = curve[Math.floor(curve.length / 3)], off = mid ? mid.outDbfs - mid.inDbfs : 0;
  g += `<line x1="${X(lo)}" y1="${Y(lo + off)}" x2="${X(hi)}" y2="${Y(hi + off)}" stroke="${css("--axis")}" stroke-dasharray="4 4"/>`;
  g += `<polyline points="${curve.map(c => `${X(c.inDbfs)},${Y(c.outDbfs)}`).join(" ")}" fill="none" stroke="${css("--s1")}" stroke-width="2" stroke-linejoin="round"/>`;
  g += curve.map(c => `<circle cx="${X(c.inDbfs)}" cy="${Y(c.outDbfs)}" r="4" fill="${css("--s1")}" stroke="${css("--surface")}" stroke-width="2"><title>in ${c.inDbfs} → out ${c.outDbfs.toFixed(1)} dBFS</title></circle>`).join("");
  $("dyn").innerHTML = g + `</svg>`;
  const resp = m.report.response[0];
  $("dyn-facts").innerHTML = [
    [t("saturation"), d.saturationDb != null ? t("satV", d.saturationDb) : "–"],
    [t("compression"), d.compressionDb != null ? t("compV", d.compressionDb) + (d.attackMs != null ? t("attack", d.attackMs, d.releaseMs) : "") : "–"],
    [t("reverb"), resp.rt60s ? `RT60 ${resp.rt60s} s` : "–"],
    [t("noise"), t("noiseV", m.report.noise.wetDbfs)],
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") + `<dt></dt><dd class="hint">${esc(t("unity"))}</dd>`;
  const dist = m.report.distortion || [];
  const levels = [...new Set(dist.map(x => x.levelDbfs))], freqs = [...new Set(dist.map(x => x.freqHz))];
  $("dist").innerHTML = dist.length ? `<div class="scroll"><table><tr><th>${esc(t("inDbfs"))}</th>${freqs.map(f => `<th>${fmtHz(f)} Hz</th>`).join("")}</tr>${levels.map(l => `<tr><td class="lv">${l}</td>${freqs.map(f => { const c = dist.find(x => x.freqHz === f && x.levelDbfs === l); return `<td title="H2 ${c.h2Db} dB · H3 ${c.h3Db} dB · even−odd ${c.evenOddDb} dB">${c.thdPct.toFixed(1)}%<br><span style="color:${css("--muted")}">${c.h2Db}/${c.h3Db}</span></td>`; }).join("")}</tr>`).join("")}</table></div>` : "";
  const loud = dist.filter(x => x.levelDbfs === levels[levels.length - 1]);
  const bal = loud.length ? loud.reduce((a, x) => a + x.evenOddDb, 0) / loud.length : 0;
  $("dist-note").textContent = dist.length ? t("lean", t(bal > 3 ? "even" : bal < -3 ? "odd" : "neither"), sign(bal)) : "";
}

  AT.charts = {
    get S() { return S; }, set S(v) { S = v; },
    get shown() { return shown; }, set shown(v) { shown = v; },
    get groupId() { return groupId; }, set groupId(v) { groupId = v; },
    get focusId() { return focusId; }, set focusId(v) { focusId = v; },
    get level() { return level; }, set level(v) { level = v; },
    get kindFilter() { return kindFilter; }, set kindFilter(v) { kindFilter = v; },
    P, toggleShown, groups, ownRecording, drawFR, drawLegend, drawCompare, drawDetail, pause, select, esc, ago, css, $,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
