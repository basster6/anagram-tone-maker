// Everything the app keeps lives in this browser: IndexedDB for measurements,
// takes (with their audio), targets, backups and the conversation; localStorage
// for small settings. Nothing is sent anywhere except the chosen AI provider.
(function (root) {
  const AT = (root.AT = root.AT || {});
  const DB_NAME = "anagram-tone-maker", VERSION = 2;
  const STORES = ["measurements", "takes", "audio", "targets", "backups", "references", "kv"];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && "result" in r ? r.result : r);
      t.onerror = () => reject(t.error);
    });
  }

  const put = (store, key, value) => tx(store, "readwrite", s => s.put(value, key));
  const get = (store, key) => tx(store, "readonly", s => s.get(key));
  const del = (store, key) => tx(store, "readwrite", s => s.delete(key));
  const values = (store) => tx(store, "readonly", s => s.getAll());

  function newId(label) {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const slug = String(label || "").toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    return `${stamp}-${slug || Math.random().toString(16).slice(2, 6)}`;
  }

  const byCreated = list => list.sort((a, b) => (a.created || 0) - (b.created || 0));

  const settings = {
    get(key, fallback = null) { try { const v = localStorage.getItem("at." + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem("at." + key, JSON.stringify(value)); } catch {} },
  };

  AT.store = {
    open, newId, settings,
    async saveMeasurement(report, label, slot, by) {
      const id = newId(label);
      await put("measurements", id, { id, label: label || id, slot: slot || null, by, created: Date.now() / 1000, report });
      return id;
    },
    measurements: async () => byCreated(await values("measurements")),
    getMeasurement: id => get("measurements", id),

    // audio is stored apart from the metadata so listing takes stays cheap
    async saveTake({ label, analysis, dry, wet, dryRef, slot, by }) {
      const id = newId(label);
      const files = {};
      if (dry) { await put("audio", id + ":dry", dry); files.dry = id + ":dry"; }
      else if (dryRef) files.dry = dryRef;
      if (wet) { await put("audio", id + ":wet", wet); files.wet = id + ":wet"; }
      await put("takes", id, { id, label: label || id, slot: slot || null, by, created: Date.now() / 1000, files, analysis });
      return id;
    },
    takes: async () => byCreated(await values("takes")),
    getTake: id => get("takes", id),
    audio: key => get("audio", key),

    async saveTarget(name, gainDb, points, note) {
      const id = String(name).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || "target";
      await put("targets", id, { id, name, note: note || "", gainDb, points, created: Date.now() / 1000 });
      return id;
    },
    targets: async () => byCreated(await values("targets")),

    // A cut of a reference stem: its audio, its tone profile, and the DI it is compared against.
    async saveReference({ name, audio, rate, start, end, profile, source }) {
      const id = newId(name);
      await put("audio", id + ":ref", audio);
      await put("references", id, { id, name, rate, start, end, profile, source, audio: id + ":ref", created: Date.now() / 1000 });
      return id;
    },
    references: async () => byCreated(await values("references")),
    getReference: id => get("references", id),
    putReference: rec => put("references", rec.id, rec),

    async backup(filename, doc) {
      const id = newId(filename.replace(".json", ""));
      await put("backups", id, { id, filename, created: Date.now() / 1000, doc });
      return id;
    },
    backups: async () => byCreated(await values("backups")),

    async remove(kind, id) {
      if (kind === "takes") {
        const t = await get("takes", id);
        for (const k of Object.values((t && t.files) || {})) if (String(k).startsWith(id + ":")) await del("audio", k);
      }
      if (kind === "references") await del("audio", id + ":ref");
      await del(kind, id);
    },
    kv: { get: k => get("kv", k), set: (k, v) => put("kv", k, v) },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
