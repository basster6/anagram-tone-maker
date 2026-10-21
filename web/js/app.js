// The page: wires the pedal, the audio rig, the assistant and the charts together.
(function (root) {
  const AT = root.AT;
  const C = AT.charts, $ = C.$, esc = C.esc, css = C.css;
  const settings = AT.store.settings;

  // ---------- language and theme ----------
  let lang = settings.get("lang") || ((navigator.language || "en").startsWith("ko") ? "ko" : "en");
  const t = (k, ...a) => { const v = (AT.i18n[lang] || AT.i18n.en)[k] ?? AT.i18n.en[k] ?? k; return typeof v === "function" ? v(...a) : v; };
  let theme = settings.get("theme") || "auto";

  function applyTheme() {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = theme;
    $("theme").textContent = theme === "auto" ? "◐" : theme === "light" ? "☀" : "☾";
    $("theme").title = t(theme === "auto" ? "themeAuto" : theme === "light" ? "themeLight" : "themeDark");
  }

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t("title");
    document.querySelectorAll("[data-t]").forEach(el => el.textContent = t(el.dataset.t));
    document.querySelectorAll("[data-t-ph]").forEach(el => el.placeholder = t(el.dataset.tPh));
    document.querySelectorAll("[data-t-title]").forEach(el => el.title = t(el.dataset.tTitle));
    $("lang").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === lang));
    $("tbl").textContent = $("frtable").hidden ? t("table") : t("chartOnly");
    $("routesteps").innerHTML = t("routeSteps").map(s => `<li>${esc(s)}</li>`).join("");
    $("quick").innerHTML = ["Warmer", "Punch", "Clean", "Cut", "Measure"].map(k => `<button data-q="${k}">${esc(t("q" + k))}</button>`).join("");
    $("quick").querySelectorAll("button").forEach(b => b.onclick = () => send(t("q" + b.dataset.q + "Text")));
    applyTheme(); drawRig(); drawSetup(); drawStatus(); drawChat(); drawPresets();
  }

  // ---------- state ----------
  const dev = new AT.device.Anagram();
  const midi = new AT.device.AnagramMidi();
  const rig = new AT.Rig();
  const app = { dev, rig, current: null, presetSlots: [], firmware: null, route: null, job: null, chat: [], agent: null, abort: null };

  // ---------- results ----------
  let lastKeys = {};
  async function refresh() {
    const [measurements, takes, targets] = await Promise.all([AT.store.measurements(), AT.store.takes(), AT.store.targets()]);
    C.S = { measurements, takes, targets };
    render();
    await AT.reference.update();
  }

  function render(force) {
    const S = C.S;
    const key = S.measurements.map(m => m.id).join() + "|" + S.takes.map(x => x.id).join() + "|" + S.targets.map(x => x.id + x.created).join();
    if (!force && key === lastKeys.data) return;
    if (lastKeys.data !== undefined) {
      for (const f of [...S.measurements, ...S.targets].filter(x => !lastKeys.ids.has(x.id))) C.toggleShown(f.id, true);
      const freshRoot = S.takes.filter(x => C.ownRecording(x) && !lastKeys.ids.has(x.id)).pop();
      if (freshRoot) C.groupId = freshRoot.id;
    } else {
      C.shown = [...S.measurements.slice(-2).map(m => m.id), ...S.targets.slice(-1).map(x => x.id)];
    }
    lastKeys = { data: key, ids: new Set([...S.measurements, ...S.takes, ...S.targets].map(x => x.id)) };
    C.drawLegend(); C.drawFR(); C.drawDetail(); C.drawCompare();
  }

  AT.view = { t, render, refresh, get presetSlots() { return app.presetSlots; }, reampFromPage, send: text => { setPane("assistant"); return send(text); } };

  // ---------- status ----------
  function drawStatus() {
    const p = $("pedal");
    p.className = "pill " + (dev.connected ? "ok" : "bad");
    p.textContent = dev.supported ? (dev.connected ? t("pedalOn") : t("pedalOff")) : t("noHid");
    p.title = dev.connected ? "" : t("connect");
    $("route").title = app.route === true ? "" : t("check");
    $("aistate").title = t("tabSetup");
    $("connect").textContent = dev.connected ? t("disconnect") : t("connect");
    $("connect").className = dev.connected ? "" : "primary";
    const r = $("route");
    r.className = "pill " + (app.route === true ? "ok" : app.route === false ? "bad" : "warn");
    r.textContent = app.route === true ? t("audioOk") : app.route === false ? t("audioBad") : t("audioOff");
    const cfg = aiConfig();
    $("aistate").className = "pill " + (cfg.key ? "ok" : "warn");
    $("aistate").textContent = cfg.key ? t("aiOn", AT.ai.providers[cfg.provider].label, cfg.model || "–") : t("aiOff");
    $("fw").textContent = app.firmware ? (app.firmware.ok ? t("firmware", app.firmware.version) : t("firmwareBad", app.firmware.version)) : "";
    $("fw").className = "hint" + (app.firmware && !app.firmware.ok ? " bad-text" : "");
    $("ublocks").textContent = Object.keys(AT.blocks.catalog.user).length ? t("userBlocks", Object.keys(AT.blocks.catalog.user).length) : "";
    const busy = !!app.job;
    ["mquick", "mfull", "recwet", "recdry", "checkroute"].forEach(id => $(id).disabled = busy);
    $("readblocks").disabled = busy || !dev.connected;
    if ($("reampbtn")) $("reampbtn").disabled = busy;
    $("send").textContent = app.abort ? t("stop") : t("send");
  }

  function drawJob(text, pct) {
    $("job").innerHTML = text ? `<span>${esc(text)}</span>${pct != null ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ""}` : "";
  }

  // One audio job at a time; the header shows its progress.
  async function job(text, seconds, fn) {
    if (app.job) throw new Error("Another measurement or recording is running.");
    const started = Date.now();
    app.job = { text };
    const timer = setInterval(() => drawJob(app.job.text, Math.min(97, (Date.now() - started) / 10 / seconds)), 250);
    drawStatus();
    try { return await fn(s => { app.job.text = s; }); }
    finally { clearInterval(timer); app.job = null; drawJob(""); drawStatus(); }
  }

  // ---------- pedal ----------
  async function afterConnect() {
    try {
      app.firmware = await dev.firmwareOk();
      await loadPresets();
    } catch (e) { addChat("error", e.message); }
    drawStatus();
  }

  async function loadPresets() {
    if (!dev.connected) return;
    app.presetSlots = (await dev.presetSlots()).map(p => ({ slot: AT.device.slotLabel(p.filename), filename: p.filename, name: p.name }))
      .sort((a, b) => parseInt(a.filename, 10) - parseInt(b.filename, 10));
    drawPresets(); C.drawCompare();
  }

  function drawPresets() {
    const el = $("presets");
    if (!app.presetSlots.length) { el.innerHTML = ""; return; }
    el.innerHTML = app.presetSlots.map(p => `<div class="preset"><span class="sl">${esc(p.slot)}</span><span class="nm" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="act"><button data-aud="${esc(p.filename)}">${esc(t("audition"))}</button><button data-go="${esc(p.filename)}" title="${esc(t("selectTip"))}">${esc(t("select"))}</button></span></div>`).join("");
    el.querySelectorAll("[data-aud]").forEach(b => b.onclick = () => guard(async () => {
      const doc = await dev.getPreset(b.dataset.aud); if (!doc) return;
      await dev.audition(doc); app.current = doc;
    }));
    el.querySelectorAll("[data-go]").forEach(b => b.onclick = () => guard(async () => {
      await midi.gotoSlot(parseInt(b.dataset.go, 10));
      app.current = await dev.getPreset(b.dataset.go);
    }));
  }

  async function guard(fn) { try { await fn(); } catch (e) { addChat("error", e.message); drawChat(); } }

  async function savePreset(slot, doc) {
    const filename = AT.device.slotFilename(slot), label = AT.device.slotLabel(filename);
    const errors = AT.blocks.validate(doc).filter(i => i.severity === "error");
    if (errors.length) return { saved: false, errors };
    if (!dev.connected) throw new Error("The pedal is not connected.");
    app.firmware = await dev.firmwareOk();
    if (!app.firmware.ok) return { saved: false, reason: t("firmwareBad", app.firmware.version) };
    const existing = await dev.getPreset(filename);
    const name = (doc.preset || {}).name || label;
    const ok = await confirmDialog(t("saveTitle", label), existing ? t("saveReplace", label, (existing.preset || {}).name || filename) : t("saveEmpty", label));
    if (!ok) return { saved: false, declined: true };
    let backup = null;
    if (existing) backup = await AT.store.backup(filename, existing);
    await dev.savePreset(filename, doc);
    const back = await dev.getPreset(filename);
    await loadPresets();
    if (!back) return { saved: false, reason: "Reading the slot back returned nothing.", backup };
    return { saved: true, slot: label, name: (back.preset || {}).name || name, backup };
  }

  function confirmDialog(title, text) {
    const d = $("dlg");
    $("dlgtitle").textContent = title; $("dlgtext").textContent = text;
    return new Promise(resolve => {
      $("dlgyes").onclick = () => { d.close(); resolve(true); };
      $("dlgno").onclick = () => { d.close(); resolve(false); };
      d.oncancel = () => resolve(false);
      d.showModal();
    });
  }

  // ---------- audio ----------
  const notifier = (set, label) => (s) => set(s === "waiting-quiet" ? t("waitingQuiet") : t("jobMeasure", label) + (s && s !== "waiting-quiet" ? ` · ${s}` : ""));

  async function checkRoute() {
    try { app.route = (await rig.findReampChannel()) != null; }
    catch (e) { app.route = false; $("routemsg").textContent = audioError(e); $("routemsg").className = "hint bad-text"; setPane("setup"); drawStatus(); return; }
    $("routemsg").textContent = app.route ? t("routeOk") : t("routeBad");
    $("routemsg").className = "hint " + (app.route ? "ok-text" : "bad-text");
    if (!app.route) setPane("setup");
    drawStatus();
  }

  async function measure({ quick, label, by }) {
    label = label || ((app.current && app.current.preset && app.current.preset.name) || t("current"));
    const report = await job(t("jobMeasure", label), quick ? 15 : 90, set => rig.measureAll({ quick, notify: notifier(set, label) })).catch(routeError);
    const id = await AT.store.saveMeasurement(report, label, null, by);
    await refresh();
    return { id, summary: AT.dsp.summary(report) };
  }

  const audioError = e => e && e.code === "no-permission" ? t("micDenied") : e && e.code === "no-device" ? t("noAudio") + ` (${e.missing}; ${(e.seen || []).join(", ") || "-"})` : e && e.code === "no-reamp" ? t("routeBad") : (e && e.message) || String(e);

  function routeError(e) {
    if (e && e.code) { if (e.code === "no-reamp") app.route = false; drawStatus(); setPane("setup"); $("routemsg").textContent = audioError(e); throw new Error(audioError(e)); }
    throw e;
  }

  const dryDoc = () => ({ type: "preset", version: 1, preset: { name: "Dry capture", scene: 0, bindings: {}, chains: { "1": { blocks: { "1": {
    uri: "urn:darkglass:Gain", enabled: true, quickpot: "Gain", properties: {}, scenes: {},
    parameters: { "1": { name: "Gain", symbol: "Gain", value: 0 }, "2": { name: "Invert Polarity", symbol: "PolarityInversion", value: 0 } } } } } } } });

  async function record(kind) {
    const seconds = Math.max(2, Math.min(120, +$("secs").value || 20));
    const label = $("tlabel").value.trim() || (kind === "dry" ? "DI" : "take");
    await guard(() => job(t("jobRec"), seconds, async () => {
      const restore = app.current;
      if (kind === "dry") { if (!dev.connected) throw new Error("The pedal is not connected."); await dev.audition(dryDoc()); }
      rig.onmeter = drawMeter;
      let audio;
      try { audio = await rig.capture(seconds); }
      finally { rig.onmeter = null; drawMeter(null); if (kind === "dry" && restore) await dev.audition(restore); }
      const peak = AT.dsp.db(audio.reduce((m, v) => Math.max(m, Math.abs(v)), 0)), avg = AT.dsp.db(AT.dsp.rms(audio));
      const level = kind === "dry" ? { dryPeakDbfs: +peak.toFixed(1), dryRmsDbfs: +avg.toFixed(1) } : { outPeakDbfs: +peak.toFixed(1), outRmsDbfs: +avg.toFixed(1) };
      const analysis = { seconds: +(audio.length / 48000).toFixed(1), ...level };
      await AT.store.saveTake(kind === "dry" ? { label, analysis, dry: audio, by: "user" } : { label, analysis, wet: audio, by: "user" });
      $("tlabel").value = "";
      await refresh();
    }));
  }

  function drawMeter(lv) {
    if (!lv) { $("mrms").style.width = "0"; $("mpeak").style.left = "0"; $("meterval").textContent = ""; return; }
    const w = v => Math.max(0, Math.min(100, (v + 60) / 60 * 100));
    $("mrms").style.width = w(lv.rmsDb) + "%"; $("mpeak").style.left = w(lv.peakDb) + "%";
    $("meterval").textContent = `${lv.peakDb} dBFS peak · ${lv.rmsDb} dBFS avg`;
  }

  async function upload(file) {
    await guard(async () => {
      const wav = AT.dsp.parseWav(await file.arrayBuffer());
      let mono = wav.channels.length > 1 ? wav.channels[0].map((v, i) => wav.channels.reduce((a, c) => a + c[i], 0) / wav.channels.length) : wav.channels[0];
      if (wav.rate !== 48000) mono = resample(mono, wav.rate, 48000);
      const peak = AT.dsp.db(mono.reduce((m, v) => Math.max(m, Math.abs(v)), 0)), avg = AT.dsp.db(AT.dsp.rms(mono));
      await AT.store.saveTake({ label: file.name.replace(/\.wav$/i, ""), dry: mono, by: "user",
        analysis: { seconds: +(mono.length / 48000).toFixed(1), dryPeakDbfs: +peak.toFixed(1), dryRmsDbfs: +avg.toFixed(1) } });
      await refresh();
    });
  }

  function resample(x, from, to) {
    const n = Math.round(x.length * to / from), out = new Float32Array(n), r = from / to;
    for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; out[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
    return out;
  }

  async function reamp({ takeId, label, document, slot, by }) {
    const take = await AT.store.getTake(takeId);
    if (!take || !take.files.dry) throw new Error("That take has no dry audio to reamp.");
    const dry = await AT.store.audio(take.files.dry);
    if (document) {
      const errors = AT.blocks.validate(document).filter(i => i.severity === "error");
      if (errors.length) return { notSent: true, errors };
      if (!dev.connected) throw new Error("The pedal is not connected.");
      await dev.audition(document); app.current = document;
      await new Promise(r => setTimeout(r, 800));
    }
    const name = `${take.label} → ${label}`;
    const wet = await job(t("jobReamp", name), dry.length / 48000 + 6, set => rig.reamp(dry, { notify: s => set(s === "waiting-quiet" ? t("waitingQuiet") : t("jobReamp", name)) })).catch(routeError);
    const analysis = AT.dsp.analyzePerformance(dry, wet);
    const id = await AT.store.saveTake({ label: name, analysis, wet, dryRef: take.files.dry, slot: slot || null, by });
    await refresh();
    return { id, summary: AT.dsp.performanceSummary(analysis) };
  }

  async function reampFromPage(takeId, slot) {
    await guard(async () => {
      if (!slot) return reamp({ takeId, label: (app.current && app.current.preset && app.current.preset.name) || t("current"), by: "user" });
      const p = app.presetSlots.find(x => x.slot === slot);
      const doc = await dev.getPreset(p.filename);
      return reamp({ takeId, label: `${slot} · ${p.name}`, document: doc, slot, by: "user" });
    });
  }

  // ---------- assistant ----------
  function aiConfig() {
    const provider = settings.get("provider", "gemini");
    return { provider, key: settings.get("key." + provider, ""), model: settings.get("model." + provider, ""), searchKey: settings.get("searchKey", "") };
  }

  function addChat(kind, text, extra) { app.chat.push({ kind, text, ts: Date.now() / 1000, ...extra }); saveChat(); }
  const saveChat = () => AT.store.kv.set("chat", { log: app.chat.slice(-300), agent: app.agent ? app.agent.toJSON() : null });

  function drawChat() {
    const el = $("chat"); if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const cfg = aiConfig();
    if (!app.chat.length) { el.innerHTML = `<div class="empty">${esc(cfg.key ? t("chatEmpty") : t("needKey"))}</div>`; return; }
    el.innerHTML = app.chat.map((m, i) => {
      if (m.kind === "tool") return `<div class="msg tool">· ${esc((t("toolNames") || {})[m.text] || m.text)}</div>`;
      if (m.kind === "error") return `<div class="msg error">${esc(m.text)}</div>`;
      const who = m.kind === "user" ? t("you") : t("assistant");
      const ask = m.ask ? `<div class="ask" data-ask="${i}">${m.ask.options.map((o, j) => `<button data-j="${j}" class="${(m.ask.picked || []).includes(o) ? "on" : ""}" ${m.ask.done ? "disabled" : ""}>${esc(o)}</button>`).join("")}${m.ask.multiple && !m.ask.done ? `<button class="primary" data-submit>${esc(t("submit"))}</button>` : ""}</div>` : "";
      return `<div class="msg ${m.kind === "user" ? "user" : "claude"}"><span class="who">${esc(who)} · ${C.ago(m.ts)}</span>${esc(m.text)}${ask}</div>`;
    }).join("");
    el.querySelectorAll("[data-ask]").forEach(box => {
      const m = app.chat[+box.dataset.ask];
      box.querySelectorAll("[data-j]").forEach(b => b.onclick = () => {
        const o = m.ask.options[+b.dataset.j];
        if (!m.ask.multiple) { m.ask.picked = [o]; finishAsk(m); return; }
        m.ask.picked = (m.ask.picked || []).includes(o) ? m.ask.picked.filter(x => x !== o) : [...(m.ask.picked || []), o];
        drawChat();
      });
      const sub = box.querySelector("[data-submit]"); if (sub) sub.onclick = () => finishAsk(m);
    });
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  const pendingAsks = new Map();
  function askUser(question, options, multiple) {
    const id = Math.random().toString(36).slice(2);
    addChat("assistant", question, { ask: { id, options, multiple, picked: [] } });
    drawChat();
    return new Promise(resolve => pendingAsks.set(id, resolve));
  }
  function finishAsk(m) {
    m.ask.done = true;
    const answer = (m.ask.picked || []).join(", ");
    addChat("user", answer);
    drawChat();
    const r = pendingAsks.get(m.ask.id); pendingAsks.delete(m.ask.id);
    r && r({ answer });
  }

  function makeAgent(saved) {
    const cfg = aiConfig();
    const opts = {
      provider: cfg.provider, key: cfg.key, model: cfg.model,
      system: AT.prompt.build({ rig: settings.get("rig", {}), language: lang }),
      tools: AT.makeTools(Object.assign(app, { measure, reamp, savePreset, askUser, aiConfig, refresh, setCurrent: d => { app.current = d; } })),
      onEvent: onAgentEvent,
    };
    return saved ? AT.ai.Agent.fromJSON(saved, opts) : new AT.ai.Agent(opts);
  }

  function onAgentEvent(e) {
    if (e.type === "assistant_text" && e.text) addChat("assistant", e.text);
    else if (e.type === "tool_call" && e.name !== "ask_user") addChat("tool", e.name);
    else if (e.type === "error" && !e.aborted) addChat("error", (e.error && e.error.message) || String(e.error || "error"));
    drawChat();
  }

  async function send(text) {
    if (app.abort) { app.abort.abort(); for (const [id, r] of pendingAsks) { pendingAsks.delete(id); r({ cancelled: true }); } return; }
    text = (text || "").trim(); if (!text) return;
    const cfg = aiConfig();
    if (!cfg.key) { setPane("setup"); addChat("error", t("needKey")); drawChat(); return; }
    if (!cfg.model) { await loadModels().catch(() => {}); }
    $("say").value = "";
    addChat("user", text); drawChat();
    app.agent = app.agent || makeAgent();
    const now = aiConfig(), provider = AT.ai.providers[now.provider];
    Object.assign(app.agent, { provider, key: now.key, model: now.model || provider.defaultModel([]),
      system: AT.prompt.build({ rig: settings.get("rig", {}), language: lang }) });
    app.abort = new AbortController(); drawStatus();
    try { await app.agent.send(text, { signal: app.abort.signal }); }
    catch (e) {
      const last = app.chat[app.chat.length - 1];
      if (e.name !== "AbortError" && !(last && last.kind === "error" && last.text === e.message)) addChat("error", e.message);
    }
    finally { app.abort = null; saveChat(); drawChat(); drawStatus(); }
  }

  // ---------- setup ----------
  function drawSetup() {
    const cfg = aiConfig(), P = AT.ai.providers;
    $("provider").innerHTML = Object.entries(P).map(([k, p]) => `<option value="${k}" ${k === cfg.provider ? "selected" : ""}>${esc(p.label)}</option>`).join("");
    $("apikey").value = cfg.key;
    $("searchkey").value = cfg.searchKey;
    $("keyurl").href = P[cfg.provider].keyUrl;
    $("keyhint").textContent = (t("keyHints") || {})[cfg.provider] || P[cfg.provider].keyHint || "";
    const models = settings.get("models." + cfg.provider, []);
    $("model").innerHTML = (models.length ? models : [cfg.model].filter(Boolean)).map(m => `<option ${m === cfg.model ? "selected" : ""}>${esc(m)}</option>`).join("");
  }

  async function loadModels() {
    const cfg = aiConfig();
    if (!cfg.key) return;
    const p = AT.ai.providers[cfg.provider];
    const models = await p.listModels(cfg.key);
    settings.set("models." + cfg.provider, models);
    if (!models.includes(cfg.model)) settings.set("model." + cfg.provider, p.defaultModel(models));
    drawSetup(); drawStatus();
  }

  function drawRig() {
    const rigv = settings.get("rig", {}), spec = t("rig");
    $("rigform").innerHTML = Object.entries(spec).map(([key, [label, options, multi]]) => {
      const cur = rigv[key];
      const on = o => multi ? (cur || []).includes(o) : cur === o;
      return `<div class="field"><span>${esc(label)}</span><div class="opts" data-key="${key}" data-multi="${multi ? 1 : ""}">${options.map(o => `<button class="${on(o) ? "on" : ""}">${esc(o)}</button>`).join("")}</div></div>`;
    }).join("");
    $("rigform").querySelectorAll(".opts").forEach(box => box.querySelectorAll("button").forEach(b => b.onclick = () => {
      const r = settings.get("rig", {}), k = box.dataset.key, o = b.textContent;
      if (box.dataset.multi) r[k] = (r[k] || []).includes(o) ? r[k].filter(x => x !== o) : [...(r[k] || []), o];
      else r[k] = r[k] === o ? null : o;
      settings.set("rig", r); drawRig();
    }));
  }

  function setPane(p) {
    $("tabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.p === p));
    document.querySelectorAll("[data-pane]").forEach(el => el.hidden = el.dataset.pane !== p);
  }

  // ---------- controls ----------
  $("tabs").querySelectorAll("button").forEach(b => b.onclick = () => setPane(b.dataset.p));
  // the status pills lead straight to what fixes them
  $("pedal").onclick = () => { setPane("pedal"); if (!dev.connected && dev.supported) $("connect").click(); };
  $("route").onclick = () => { setPane("setup"); if (app.route !== true) $("checkroute").click(); };
  $("aistate").onclick = () => { setPane("setup"); $("apikey").focus(); };
  $("connect").onclick = () => guard(async () => {
    if (dev.connected) { await dev.disconnect(); return; }
    if (await dev.connect()) await afterConnect();
  });
  dev.onchange = () => drawStatus();
  $("readblocks").onclick = () => guard(() => job(t("jobBlocks", 0, "?"), 30, async set => {
    const blocks = await AT.blocks.refreshUser(dev, (i, n) => set(t("jobBlocks", i, n)));
    await AT.store.kv.set("userBlocks", blocks);
  }));
  $("loadpresets").onclick = () => guard(loadPresets);
  $("mquick").onclick = () => guard(() => measure({ quick: true, label: $("mlabel").value.trim(), by: "user" }).then(() => { $("mlabel").value = ""; }));
  $("mfull").onclick = () => guard(() => measure({ quick: false, label: $("mlabel").value.trim(), by: "user" }).then(() => { $("mlabel").value = ""; }));
  $("recwet").onclick = () => record("wet");
  $("recdry").onclick = () => record("dry");
  $("upload").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) upload(f); };
  $("checkroute").onclick = () => guard(() => job(t("check"), 3, checkRoute));
  $("send").onclick = () => send($("say").value);
  $("say").addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send($("say").value); });
  $("newchat").onclick = () => { if (app.abort) app.abort.abort(); app.agent = null; app.chat = []; saveChat(); drawChat(); };
  $("provider").onchange = () => { settings.set("provider", $("provider").value); app.agent = null; drawSetup(); drawStatus(); drawChat(); };
  $("apikey").onchange = () => { settings.set("key." + aiConfig().provider, $("apikey").value.trim()); drawStatus(); drawChat(); loadModels().catch(e => { $("keyhint").textContent = e.message; }); };
  $("searchkey").onchange = () => settings.set("searchKey", $("searchkey").value.trim());
  $("model").onchange = () => { settings.set("model." + aiConfig().provider, $("model").value); drawStatus(); };
  $("loadmodels").onclick = () => loadModels().catch(e => { $("keyhint").textContent = e.message; });
  $("lvl").querySelectorAll("button").forEach(b => b.onclick = () => {
    C.level = +b.dataset.l; $("lvl").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); C.drawFR();
  });
  $("tbl").onclick = () => { const el = $("frtable"); el.hidden = !el.hidden; $("tbl").textContent = el.hidden ? t("table") : t("chartOnly"); };
  $("group").onchange = () => { C.pause(); C.groupId = $("group").value; C.P.active = 0; C.P.offset = 0; C.drawCompare(); };
  $("delgroup").onclick = async () => {
    const gr = C.groups().find(g => g.root.id === C.groupId); if (!gr || !confirm(t("confirmGroup", gr.reamps.length))) return;
    C.pause(); C.P.key = null;
    for (const x of [...gr.reamps, gr.root]) await AT.store.remove("takes", x.id);
    C.groupId = null; refresh();
  };
  $("focus").onchange = () => { C.focusId = $("focus").value; C.drawDetail(); };
  $("lang").querySelectorAll("button").forEach(b => b.onclick = () => { lang = b.dataset.v; settings.set("lang", lang); applyLang(); render(true); AT.reference.draw(); });
  $("theme").onclick = () => { theme = { auto: "light", light: "dark", dark: "auto" }[theme]; settings.set("theme", theme); applyTheme(); render(true); };
  addEventListener("keydown", e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey || !C.P.vs) return;
    if (e.code === "Space") { e.preventDefault(); $("pp") && $("pp").click(); }
    else if (/^[1-9]$/.test(e.key)) C.select(C.P.vs, +e.key - 1);
  });
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { render(true); AT.reference.draw(); }, 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render(true));

  // ---------- start ----------
  (async () => {
    applyLang();
    const ub = await AT.store.kv.get("userBlocks"); if (ub) AT.blocks.catalog.user = ub;
    const saved = await AT.store.kv.get("chat");
    if (saved) { app.chat = saved.log || []; if (saved.agent && aiConfig().key) { try { app.agent = makeAgent(saved.agent); } catch { app.agent = null; } } }
    await refresh();
    drawChat(); drawStatus();
    if (!aiConfig().key) setPane("setup");
    if (await dev.reconnect().catch(() => false)) await afterConnect();
  })();
})(window);
