// The block catalogue and the preset validator. A port of tools/build_reference.py
// (describe) and tools/validate.py, calibrated the same way: unmodified presets
// read off a device must produce zero errors.
(function (root) {
  const AT = (root.AT = root.AT || {});

  const CONTROL = 2, OUTPUT = 4, TOGGLED = 16, INTEGER = 32, ENUMERATION = 64, LOGARITHMIC = 128;
  const ROLES = { 1: "bypass", 2: "hostTempo", 3: "reset", 4: "quickpotDefault" };
  const CATEGORIES = {
    1: "Delays & Reverbs", 29: "Delays & Reverbs",
    2: "Overdrive & Distortion",
    5: "Amp & Cabs", 30: "Amp & Cabs",
    6: "EQs, Filters & Dynamics", 9: "EQs, Filters & Dynamics", 11: "EQs, Filters & Dynamics",
    25: "Modulation & Pitch", 26: "Modulation & Pitch", 27: "Modulation & Pitch",
    33: "Utilities", 34: "Utilities",
  };
  const FAMILY_ORDER = ["Amp & Cabs", "Overdrive & Distortion", "EQs, Filters & Dynamics", "Modulation & Pitch", "Delays & Reverbs", "Utilities"];

  function describe(info) {
    const params = [];
    for (const port of info.ports || []) {
      const flags = port.flags || 0;
      if (!(flags & CONTROL) || (flags & OUTPUT) || String(port.symbol).startsWith("lv2_")) continue;
      const e = { symbol: port.symbol, name: port.name, min: port.min, max: port.max, def: port.def };
      if (port.unit) e.unit = port.unit;
      if (flags & TOGGLED) e.toggle = true;
      else if (flags & ENUMERATION) e.options = (port.scalePoints || []).map(p => p.label);
      else if (flags & INTEGER) e.integer = true;
      if (flags & LOGARITHMIC) e.log = true;
      if (ROLES[port.designation]) e.role = ROLES[port.designation];
      params.push(e);
    }
    return { name: info.name, abbr: info.abbreviation || "", category: CATEGORIES[info.category] || "Utilities", categoryCode: info.category, params };
  }

  // factory: shipped with the app; user: read off this pedal, kept in this browser only
  const catalog = { factory: {}, user: {}, firmware: null };

  function loadFactory() {
    const data = root.AT_DATA && root.AT_DATA.blocksFactory;
    if (data) { catalog.factory = data.blocks; catalog.firmware = data.firmware; }
  }

  function all() { return Object.assign({}, catalog.factory, catalog.user); }
  function spec(uri) { const b = all(); return b[uri] || b[String(uri).split("#")[0]] || null; }
  function tierOf(uri) { return catalog.user[uri] ? "user" : catalog.factory[uri] ? "factory" : null; }

  async function refreshUser(dev, onProgress) {
    const plugins = await dev.plugins("USER");
    const blocks = {};
    for (let i = 0; i < plugins.length; i++) {
      onProgress && onProgress(i + 1, plugins.length);
      try { blocks[plugins[i].uri] = describe(await dev.blockInfo(plugins[i].uri)); } catch { /* skip a block the pedal will not describe */ }
    }
    catalog.user = blocks;
    return blocks;
  }

  function rangeText(p) {
    if (p.toggle) return "(toggle)";
    if (p.options) return "[" + p.options.join(" | ") + "]";
    return `${+p.min}..${+p.max}` + (p.log ? "~" : "");
  }

  function list(category) {
    return Object.entries(all())
      .filter(([, b]) => !category || b.category.toLowerCase().includes(String(category).toLowerCase()))
      .sort((a, b) => FAMILY_ORDER.indexOf(a[1].category) - FAMILY_ORDER.indexOf(b[1].category) || a[1].name.localeCompare(b[1].name))
      .map(([uri, b]) => ({ uri, name: b.name, abbr: b.abbr, category: b.category, tier: tierOf(uri), params: b.params.length }));
  }

  function blockText(uri) {
    const b = spec(uri);
    if (!b) return null;
    const lines = [`${b.name} ${b.abbr ? "(" + b.abbr + ")" : ""} - ${b.category} - ${uri} - ${tierOf(uri)} tier`];
    if (!b.params.length) lines.push("No user parameters; the device fills them in when the block is placed.");
    for (const p of b.params) {
      const bits = [`${p.symbol} ${rangeText(p)} default ${+p.def}`];
      if (p.unit) bits.push(p.unit);
      if (p.name !== p.symbol) bits.push(`(${p.name})`);
      if (p.role) bits.push(`*${p.role}*`);
      lines.push("- " + bits.join(" "));
    }
    return lines.join("\n");
  }

  // ---------- validator ----------
  const MAX_ROWS = 2, MAX_SLOTS = 12, SCENES = [1, 2, 3];
  const ACTUATORS = ["pot1", "pot2", "pot3", "pot4", "pot5", "pot6", "foot1", "foot2", "foot3", "exp.pedal"];
  const FOOTSWITCHES = new Set(["foot1", "foot2", "foot3"]);
  const UUID_RE = /^[0-9a-f]{16}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{24}$/;
  const isNum = v => typeof v === "number" && isFinite(v);
  const isDigits = k => /^\d+$/.test(String(k));

  function validate(doc, blocks) {
    blocks = blocks || all();
    const hasBlocks = Object.keys(blocks).length > 0;
    const out = [];
    const err = (where, message) => out.push({ severity: "error", where, message });
    const warn = (where, message) => out.push({ severity: "warning", where, message });
    const known = uri => { const s = blocks[uri] || blocks[String(uri).split("#")[0]]; return new Set(s ? s.params.map(p => p.symbol) : []); };
    const pspec = (uri, sym) => { const s = blocks[uri] || blocks[String(uri).split("#")[0]]; return s ? s.params.find(p => p.symbol === sym) : null; };

    if (!doc || typeof doc !== "object" || Array.isArray(doc)) { err("root", "A preset document must be a JSON object."); return out; }
    if (doc.type !== "preset") err("type", 'The root "type" must be the string "preset".');
    if (doc.version !== 1) err("version", 'The root "version" must be 1.');
    const preset = doc.preset;
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) { err("preset", 'The document needs a "preset" object.'); return out; }

    if (!String(preset.name || "").trim()) warn("preset.name", "The preset has no name.");
    if (preset.uuid && !UUID_RE.test(String(preset.uuid))) warn("preset.uuid", "The uuid is not 56 lowercase hex digits in 16-8-8-24 groups; the device replaces it on save anyway.");
    if (Number.isInteger(preset.scene) && !(preset.scene >= 0 && preset.scene < SCENES.length)) err("preset.scene", `The active scene counts from 0, so it must be 0-${SCENES.length - 1}.`);

    const chains = preset.chains || {};
    if (!Object.keys(chains).length) warn("preset.chains", "The preset has no blocks.");

    for (const [rowKey, row] of Object.entries(chains)) {
      if (!(isDigits(rowKey) && +rowKey >= 1 && +rowKey <= MAX_ROWS)) err(`chains.${rowKey}`, `A chain row must be 1-${MAX_ROWS}.`);
      for (const [slotKey, block] of Object.entries((row && row.blocks) || {})) {
        const at = `row ${rowKey} / slot ${slotKey}`;
        if (!(isDigits(slotKey) && +slotKey >= 1 && +slotKey <= MAX_SLOTS)) err(at, `A slot must be 1-${MAX_SLOTS}.`);
        const uri = block && block.uri;
        if (!uri) { err(at, 'A block needs a "uri"; it is the only required field.'); continue; }
        if (hasBlocks && !blocks[uri] && !blocks[uri.split("#")[0]]) warn(at, `"${uri}" is not a block this device reports as installed.`);

        for (const field of ["parameters", "properties"]) {
          const keys = Object.keys(block[field] || {}).filter(isDigits).map(Number).sort((a, b) => a - b);
          if (keys.length && keys.some((k, i) => k !== i + 1)) err(`${at} / ${field}`, `${field} keys must run 1..N with no gaps; found [${keys.join(", ")}].`);
        }

        const stored = new Set(Object.values(block.parameters || {}).filter(p => p && "symbol" in p).map(p => p.symbol));
        const knownSyms = known(uri);
        const wrong = sym => !stored.has(sym) && knownSyms.size > 0 && !knownSyms.has(sym);

        if (block.quickpot && wrong(block.quickpot)) err(at, `quickpot "${block.quickpot}" is not a parameter of this plugin.`);

        for (const param of Object.values(block.parameters || {})) {
          const s = pspec(uri, param && param.symbol);
          const v = param && param.value;
          if (s && isNum(v)) {
            if (!(s.min <= v && v <= s.max)) err(`${at} / ${param.symbol}`, `${v} is outside the plugin range ${s.min} to ${s.max}.`);
            else if (s.options && v !== Math.trunc(v)) warn(`${at} / ${param.symbol}`, "This is an enumeration, so the value should be a whole number.");
          }
        }

        for (const [sceneKey, delta] of Object.entries(block.scenes || {})) {
          if (!(isDigits(sceneKey) && SCENES.includes(+sceneKey))) err(`${at} / scene ${sceneKey}`, `A scene must be one of [${SCENES.join(", ")}].`);
          const params = delta && delta.parameters;
          if (params != null && !Array.isArray(params)) err(`${at} / scene ${sceneKey}`, "Scene parameters are an array, unlike the block's parameters object.");
          for (const entry of Array.isArray(params) ? params : []) {
            if (wrong((entry && entry.symbol) || "")) err(`${at} / scene ${sceneKey}`, `The scene overrides "${entry && entry.symbol}", which this plugin does not have.`);
          }
        }
      }
    }

    for (const [key, binding] of Object.entries(preset.bindings || {})) {
      const at = `bindings.${key}`;
      if (!ACTUATORS.includes(key)) err(at, `"${key}" is not one of the ten hardware actuators.`);
      const targets = (binding && binding.parameters) || [];
      if (!targets.length) warn(at, "This binding has no targets; unused actuators are left out entirely.");
      for (const target of targets) {
        if (target.row == null || target.block == null || !target.symbol) { err(at, "Every binding target needs row, block and symbol."); continue; }
        const row = ((chains[String(target.row)] || {}).blocks) || {};
        const block = row[String(target.block)];
        if (!block) { err(at, `Target row ${target.row} / slot ${target.block} holds no block.`); continue; }
        if (!String(target.symbol).startsWith(":")) {
          const stored = new Set(Object.values(block.parameters || {}).filter(p => p && "symbol" in p).map(p => p.symbol));
          const knownSyms = known(block.uri || "");
          if (!stored.has(target.symbol) && knownSyms.size && !knownSyms.has(target.symbol)) err(at, `The target plugin has no parameter "${target.symbol}".`);
        }
        if (isNum(target.min) !== isNum(target.max)) err(at, "min and max must both be present or both absent.");
      }
      if (targets.length > 1 && !isNum(binding.value)) warn(at, "A macro binding should carry a normalised value between 0 and 1.");
      if (FOOTSWITCHES.has(key)) warn(at, "Footswitch bindings only act in Stomp mode; in Scene mode the footswitches select scenes.");
    }
    return out;
  }

  function summarise(issues) {
    if (!issues.length) return "No problems found.";
    const errors = issues.filter(i => i.severity === "error"), warnings = issues.filter(i => i.severity === "warning");
    return [`${errors.length} error(s), ${warnings.length} warning(s)`, ...[...errors, ...warnings].map(i => `  ${i.severity} ${i.where}: ${i.message}`)].join("\n");
  }

  loadFactory();
  AT.blocks = { catalog, describe, refreshUser, all, spec, tierOf, list, blockText, rangeText, validate, summarise, FAMILY_ORDER };
})(typeof globalThis !== "undefined" ? globalThis : window);
