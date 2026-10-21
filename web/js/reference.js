// The reference card: upload a bass stem, drag over the part to match, save it
// as a target. AT.view supplies t, refresh and send.
(function (root) {
  const AT = root.AT;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const t = (k, ...a) => AT.view.t(k, ...a);
  const clock = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

  const R = { file: null, data: null, rate: 0, peaks: null, sel: null, ctx: null, src: null, list: [], dis: [] };

  async function load(file) {
    const { data, rate } = await AT.match.decode(file);
    const n = 1200, step = Math.max(1, Math.floor(data.length / n)), peaks = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step, e = Math.min(data.length, j + step); j < e; j++) { const a = Math.abs(data[j]); if (a > m) m = a; } peaks[i] = m; }
    Object.assign(R, { file: file.name, name: file.name.replace(/\.[^.]+$/, ""), data, rate, peaks, sel: null });
    draw();
  }

  function drawWave() {
    const cv = $("refwave"); if (!cv || !R.peaks) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const mx = Math.max(...R.peaks) || 1, bw = w / R.peaks.length;
    if (R.sel) { c.fillStyle = css("--accent-soft"); c.fillRect(R.sel[0] * w, 0, (R.sel[1] - R.sel[0]) * w, h); }
    for (let i = 0; i < R.peaks.length; i++) {
      const x = i / R.peaks.length, on = R.sel && x >= R.sel[0] && x <= R.sel[1];
      c.fillStyle = css(on ? "--accent" : "--wave");
      const a = Math.max(1, R.peaks[i] / mx * (h - 4)); c.fillRect(i * bw, (h - a) / 2, Math.max(1, bw - 0.4), a);
    }
  }

  function selection() {
    if (!R.data) return null;
    const [a, b] = R.sel || [0, 1];
    return { start: a * R.data.length / R.rate, end: b * R.data.length / R.rate, audio: R.data.subarray(Math.floor(a * R.data.length), Math.floor(b * R.data.length)) };
  }

  function stop() { if (R.src) { try { R.src.stop(); } catch {} R.src = null; } $("refplay") && ($("refplay").textContent = "▶"); }
  function play() {
    if (R.src) return stop();
    const s = selection(); if (!s || !s.audio.length) return;
    R.ctx = R.ctx || new AudioContext();
    const buf = R.ctx.createBuffer(1, s.audio.length, R.rate); buf.copyToChannel(s.audio, 0);
    R.src = R.ctx.createBufferSource(); R.src.buffer = buf; R.src.connect(R.ctx.destination);
    R.src.onended = () => { R.src = null; $("refplay") && ($("refplay").textContent = "▶"); };
    R.ctx.resume(); R.src.start(); $("refplay").textContent = "■";
  }

  async function save() {
    const s = selection(); if (!s) return;
    if (s.end - s.start < 3) { alert(t("refTooShort")); return; }
    const name = (R.name || "").trim() || R.file;
    const profile = AT.match.profile(s.audio, R.rate);
    if (!profile) { alert(t("refSilent")); return; }
    const diId = $("refdi").value;
    const id = await AT.store.saveReference({ name, audio: Float32Array.from(s.audio), rate: R.rate, start: s.start, end: s.end, profile, source: R.file });
    const rec = await AT.store.getReference(id);
    if (diId) rec.di = diId;
    await saveTarget(rec);
    Object.assign(R, { data: null, peaks: null, sel: null, file: null });
    await AT.view.refresh();
  }

  // The target on the chart: reference minus DI when a DI of the same part exists.
  async function saveTarget(rec) {
    let gains, note;
    if (rec.di) {
      const take = await AT.store.getTake(rec.di), dry = take && await AT.store.audio(take.files.dry);
      const diProfile = dry && AT.match.profile(dry, 48000);
      gains = AT.match.targetCurve(rec.profile, diProfile);
      note = `${rec.name}: reference minus the DI "${take.label}" — comparable with measurements and played curves`;
      rec.diProfile = diProfile;
    } else {
      gains = AT.match.targetCurve(rec.profile, null);
      note = `${rec.name}: spectral shape of the reference only — no DI of the same part to cancel the notes`;
    }
    const filled = {}; for (const [f, v] of Object.entries(gains)) filled[f] = v == null ? 0 : v;
    rec.target = await AT.store.saveTarget(`★ ${rec.name}`, filled, null, note);
    await AT.store.putReference(rec);
  }

  async function linkDi(id, diId) {
    const rec = await AT.store.getReference(id); if (!rec) return;
    rec.di = diId || null;
    await saveTarget(rec);
    await AT.view.refresh();
  }

  function draw() {
    const box = $("refcard"); if (!box) return;
    const dis = R.dis.map(d => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join("");
    const editing = R.data ? (() => { const s = selection(); return `
      <div class="wave" id="refwavebox" style="height:64px"><canvas id="refwave"></canvas></div>
      <div class="row" style="margin-top:6px">
        <button class="play" id="refplay" style="width:32px;height:32px">▶</button>
        <span class="clock">${clock(s.start)} – ${clock(s.end)}</span>
        <input id="refname" style="flex:1" value="${esc(R.name)}">
      </div>
      <div class="row" style="margin-top:6px">
        <label class="hint">${esc(t("refDi"))} <select id="refdi"><option value="">${esc(t("refNoDi"))}</option>${dis}</select></label>
        <button class="primary" id="refsave">${esc(t("refSave"))}</button>
        <button class="ghost" id="refcancel">${esc(t("cancel"))}</button>
      </div>`; })() : "";
    const list = R.list.length ? `<div class="presets">${[...R.list].reverse().map(r => `<div class="preset" style="grid-template-columns:minmax(0,1fr) auto auto">
        <span class="nm" title="${esc(r.source || "")}">${esc(r.name)} <span class="hint">${(r.end - r.start).toFixed(1)} s</span></span>
        <select data-link="${esc(r.id)}"><option value="">${esc(t("refNoDi"))}</option>${R.dis.map(d => `<option value="${esc(d.id)}" ${d.id === r.di ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select>
        <span class="act"><button data-match="${esc(r.id)}">${esc(t("refMatch"))}</button><button class="ghost" data-delref="${esc(r.id)}">✕</button></span>
      </div>`).join("")}</div>` : "";
    box.innerHTML = `
      <div class="row"><label class="hint" style="cursor:pointer"><input type="file" id="refupload" accept="audio/*,.wav,.mp3,.flac,.m4a" hidden><u>${esc(t("refUpload"))}</u></label>
        ${R.data ? "" : `<span class="hint">${esc(t("refHow"))}</span>`}</div>
      ${editing}${list}`;
    $("refupload").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) load(f).catch(err => alert(err.message)); };
    if (R.data) {
      drawWave();
      const wave = $("refwavebox");
      let down = null;
      const pos = e => { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
      wave.onpointerdown = e => { down = pos(e); wave.setPointerCapture(e.pointerId); R.sel = [down, down]; drawWave(); };
      wave.onpointermove = e => { if (down == null) return; const p = pos(e); R.sel = [Math.min(down, p), Math.max(down, p)]; drawWave(); };
      wave.onpointerup = () => { down = null; if (R.sel && R.sel[1] - R.sel[0] < 0.002) R.sel = null; stop(); draw(); };
      $("refname").oninput = e => { R.name = e.target.value; };
      $("refplay").onclick = play;
      $("refsave").onclick = () => save().catch(err => alert(err.message));
      $("refcancel").onclick = () => { stop(); Object.assign(R, { data: null, peaks: null, sel: null }); draw(); };
    }
    box.querySelectorAll("[data-link]").forEach(s => s.onchange = () => linkDi(s.dataset.link, s.value));
    box.querySelectorAll("[data-match]").forEach(b => b.onclick = () => AT.view.send(t("refMatchText", R.list.find(r => r.id === b.dataset.match).name, b.dataset.match)));
    box.querySelectorAll("[data-delref]").forEach(b => b.onclick = async () => {
      if (!confirm(t("confirmDel"))) return;
      const r = R.list.find(x => x.id === b.dataset.delref);
      await AT.store.remove("references", r.id); if (r.target) await AT.store.remove("targets", r.target);
      AT.view.refresh();
    });
  }

  async function update() {
    R.list = await AT.store.references();
    R.dis = (await AT.store.takes()).filter(x => x.files.dry && x.files.dry.startsWith(x.id + ":")).reverse();
    draw();
  }

  AT.reference = { update, draw: () => draw() };
})(window);
