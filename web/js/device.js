// The Anagram's control link over WebHID, and its MIDI port over Web MIDI.
// A port of tools/anagram.py and tools/midi.py: same actions, same payloads.
(function (root) {
  const AT = (root.AT = root.AT || {});

  const VENDOR_ID = 0x2fa6;
  const PRODUCT_ID = 0x2500;
  const TAG_BYTE = 0x01;
  const START = "DSTART", END = "DEND";
  const TESTED_FIRMWARE = [[1, 18], [1, 19]];
  const PRESETS_PER_BANK = 3, MAX_PRESET_SLOT = 126;

  function slotLabel(filename) {
    const n = parseInt(String(filename), 10);
    return String(Math.floor((n - 1) / PRESETS_PER_BANK) + 1).padStart(2, "0") + "ABC"[(n - 1) % PRESETS_PER_BANK];
  }

  function slotFilename(label) {
    const m = /^(\d{1,2})([ABC])$/.exec(String(label).trim().toUpperCase());
    const bank = m ? +m[1] : 0;
    if (!m || bank < 1 || bank > MAX_PRESET_SLOT / PRESETS_PER_BANK) throw new Error(`"${label}" is not a slot like 17A.`);
    return `${(bank - 1) * PRESETS_PER_BANK + "ABC".indexOf(m[2]) + 1}.json`;
  }

  function newUuid() {
    const hex = [...crypto.getRandomValues(new Uint8Array(28))].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}-${hex.slice(32)}`;
  }

  function firmwareLine(version) {
    return String(version).trim().replace(/^v/, "").split(".").slice(0, 2).map(Number);
  }

  // Serialise exactly like Python's json.dumps defaults, the form the pedal was verified with.
  function pyJson(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : String(v)) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return JSON.stringify(v).replace(/[\u0080-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    if (Array.isArray(v)) return "[" + v.map(pyJson).join(", ") + "]";
    return "{" + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => pyJson(k) + ": " + pyJson(x)).join(", ") + "}";
  }

  class AnagramError extends Error {}

  class Anagram {
    constructor() {
      this.dev = null;
      this.queue = Promise.resolve();
      this.bytes = [];
      this.waiter = null;
      this.onchange = null;
    }

    get supported() { return !!(navigator.hid); }
    get connected() { return !!(this.dev && this.dev.opened); }

    // A device granted earlier is reopened without the chooser.
    async reconnect() {
      if (!navigator.hid) return false;
      const known = (await navigator.hid.getDevices()).filter(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
      for (const d of known) if (await this._open(d)) return true;
      return false;
    }

    // Needs a user gesture: shows the browser's device chooser.
    async connect() {
      if (!navigator.hid) throw new AnagramError("This browser has no WebHID. Use Chrome or Edge.");
      const picked = await navigator.hid.requestDevice({ filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }] });
      for (const d of picked) if (await this._open(d)) return true;
      if (!picked.length) return false;
      throw new AnagramError("The Anagram's control interface would not open. Quit Darkglass Suite and close other tabs connected to the pedal.");
    }

    async _open(d) {
      // The control link is the vendor-defined collection; the pedal may show others.
      if (!d.collections.some(c => c.usagePage === 0xff00 || c.usagePage === 0xff)) return false;
      try { if (!d.opened) await d.open(); } catch { return false; }
      this.dev = d;
      d.oninputreport = e => this._input(e);
      const out = d.collections.flatMap(c => c.outputReports || []);
      // With report ids the tag travels as the id; without them it is the first data byte.
      const withId = out.find(r => r.reportId === TAG_BYTE);
      const size = (r) => (r.items || []).reduce((a, i) => a + (i.reportSize * i.reportCount) / 8, 0);
      this.reportId = withId ? TAG_BYTE : 0;
      this.reportBytes = withId ? (size(withId) || 63) : ((out[0] && size(out[0])) || 64);
      navigator.hid.addEventListener("disconnect", this._gone = (e) => {
        if (e.device === this.dev) { this.dev = null; this.onchange && this.onchange(false); }
      });
      this.onchange && this.onchange(true);
      return true;
    }

    async disconnect() {
      if (this.dev) { try { await this.dev.close(); } catch {} }
      this.dev = null;
      this.onchange && this.onchange(false);
    }

    _input(e) {
      const data = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
      for (const b of data) if (b !== 0x00 && b !== TAG_BYTE) this.bytes.push(b);
      if (this.waiter) this.waiter();
    }

    // One action at a time: replies carry no request id.
    call(action, payload = {}, timeoutMs = 20000) {
      const run = () => this._call(action, payload, timeoutMs);
      const p = this.queue.then(run, run);
      this.queue = p.catch(() => {});
      return p;
    }

    async _call(action, payload, timeoutMs) {
      if (!this.connected) throw new AnagramError("The pedal is not connected.");
      const frame = new TextEncoder().encode(START + pyJson({ action, payload: payload || {} }) + END);
      this.bytes = [];
      const chunk = this.reportId ? this.reportBytes : this.reportBytes - 1;
      const reports = Math.ceil(frame.length / chunk) + 1;   // the last one is a flush frame
      for (let i = 0; i < reports; i++) {
        const piece = frame.subarray(i * chunk, (i + 1) * chunk);
        if (this.reportId) {
          const buf = new Uint8Array(chunk); buf.set(piece);
          await this.dev.sendReport(this.reportId, buf);
        } else {
          const buf = new Uint8Array(this.reportBytes); buf[0] = TAG_BYTE; buf.set(piece, 1);
          await this.dev.sendReport(0, buf);
        }
        await new Promise(r => setTimeout(r, 10));
      }
      const deadline = Date.now() + timeoutMs;
      const decoder = new TextDecoder();
      while (Date.now() < deadline) {
        const text = decoder.decode(new Uint8Array(this.bytes));
        const a = text.indexOf(START), b = text.lastIndexOf(END);
        if (a !== -1 && b > a) {
          let reply;
          try { reply = JSON.parse(text.slice(a + START.length, b)); }
          catch (err) { throw new AnagramError(`The pedal sent malformed JSON: ${err.message}`); }
          return reply.payload || {};
        }
        await new Promise(r => { this.waiter = r; setTimeout(r, 200); });
        this.waiter = null;
      }
      throw new AnagramError(`No reply to "${action}" within ${timeoutMs / 1000} s. A wrong payload shape makes the pedal answer nothing at all.`);
    }

    // reads
    async firmware() { return (await this.call("fetch_firmware_version")).data; }
    async plugins(which = "ALL") { return (await this.call("read_all_plugins", { filterOption: which })).data; }
    async blockInfo(uri) { return (await this.call("get_plugin_info", { uri })).data; }
    async presetSlots() { return (await this.call("get_anagram_preset_positions")).data.files; }
    async presetCount() { return (await this.call("get_anagram_presets_info")).data.length; }
    async getPreset(filename) {
      const data = await this.call("fetch_anagram_preset", { filename });
      const content = ((data.data || {}).presetFile || {}).content;
      return content || null;
    }
    async userFiles(dir, page = 1) { return (await this.call("find_user_files", { pageNum: page, selectedDir: dir })).data; }

    // writes
    async savePreset(filename, doc) { return this.call("edit_anagram_presets", { presets: [{ name: filename, content: doc }] }, 30000); }
    async deletePreset(filename) { return this.call("delete_anagram_preset", { filename }, 25000); }
    async audition(doc) { return this.call("try_anagram_preset", { presetData: doc, type: 0 }, 25000); }

    async firmwareOk() {
      const fw = await this.firmware();
      const line = firmwareLine(fw.version);
      return { version: String(fw.version).trim(), ok: TESTED_FIRMWARE.some(([major, minor]) => line[0] === major && line[1] === minor) };
    }
  }

  // Program changes and controllers; the pedal needs USB MIDI switched on in its settings.
  class AnagramMidi {
    async open() {
      if (this.out) return this.out;
      if (!navigator.requestMIDIAccess) throw new AnagramError("This browser has no Web MIDI.");
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this.out = [...access.outputs.values()].find(o => /anagram/i.test(o.name));
      if (!this.out) throw new AnagramError("No Anagram MIDI port. Switch USB MIDI on in the pedal's MIDI settings.");
      return this.out;
    }
    async send(bytes) { (await this.open()).send(bytes); }
    async gotoSlot(n) {
      if (n < 1 || n > MAX_PRESET_SLOT) throw new AnagramError(`A program change only reaches slots 1-126, not ${n}.`);
      await this.send([0xc0, n & 0x7f]);
    }
  }

  AT.device = { pyJson, Anagram, AnagramMidi, AnagramError, slotLabel, slotFilename, newUuid, firmwareLine, TESTED_FIRMWARE, MAX_PRESET_SLOT };
})(typeof globalThis !== "undefined" ? globalThis : window);
