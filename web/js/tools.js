// The tools the in-app assistant can call. Each one does what the CLI command
// of the same idea does, against the pedal connected to this page.
(function (root) {
  const AT = (root.AT = root.AT || {});

  const obj = (properties, required = []) => ({ type: "object", properties, required });
  const str = (description) => ({ type: "string", description });
  const docParam = { type: "object", description: 'A whole preset document: {"preset": {...}, "type": "preset", "version": 1}' };

  // Log-frequency interpolation of a few points across the report bands (studio.save_target).
  function targetGains(points) {
    const xs = Object.keys(points).map(Number).sort((a, b) => a - b);
    const g = {};
    for (const f of AT.dsp.BANDS_HZ) {
      let v;
      if (f <= xs[0]) v = points[xs[0]];
      else if (f >= xs[xs.length - 1]) v = points[xs[xs.length - 1]];
      else {
        const hi = xs.findIndex(x => x >= f), lo = hi - 1;
        const t = (Math.log(f) - Math.log(xs[lo])) / (Math.log(xs[hi]) - Math.log(xs[lo]));
        v = points[xs[lo]] + t * (points[xs[hi]] - points[xs[lo]]);
      }
      g[String(f)] = +v.toFixed(2);
    }
    return g;
  }

  function parsePoints(points) {
    const out = {};
    for (const [k, v] of Object.entries(points || {})) {
      const m = /^([\d.]+)\s*(k?)/i.exec(String(k));
      if (m) out[parseFloat(m[1]) * (m[2] ? 1000 : 1)] = Number(v);
    }
    if (Object.keys(out).length < 2) throw new Error("A target needs at least two points, e.g. {\"80\": 6, \"700\": -5, \"3000\": 4}.");
    return out;
  }

  function issuesOf(doc) {
    const issues = AT.blocks.validate(doc);
    return { errors: issues.filter(i => i.severity === "error"), warnings: issues.filter(i => i.severity === "warning") };
  }

  async function tavily(key, query, signal) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ query, search_depth: "basic", include_answer: true, max_results: 6 }),
    });
    if (!res.ok) throw new Error(`Tavily: HTTP ${res.status}`);
    const d = await res.json();
    return { text: d.answer || "", sources: (d.results || []).map(r => ({ title: r.title, url: r.url, excerpt: String(r.content || "").slice(0, 600) })) };
  }

  function makeTools(app) {
    const dev = () => { if (!app.dev.connected) throw new Error("The pedal is not connected. Ask the player to press Connect."); return app.dev; };

    const tools = [
      {
        name: "list_blocks",
        description: "Blocks available on this pedal, optionally filtered by family (Amp & Cabs, Overdrive & Distortion, EQs, Filters & Dynamics, Modulation & Pitch, Delays & Reverbs, Utilities).",
        parameters: obj({ category: str("Part of a family name, optional") }),
        run: ({ category }) => AT.blocks.list(category),
      },
      {
        name: "get_block",
        description: "Every parameter of one block: symbol, range, default, unit, enumeration options. Read this for every candidate before choosing or setting a value.",
        parameters: obj({ uri: str("Block URI") }, ["uri"]),
        run: ({ uri }) => AT.blocks.blockText(uri) || { error: `No block "${uri}" on this pedal.` },
      },
      {
        name: "list_presets",
        description: "Every preset stored on the pedal, as slots like 17A with their names.",
        parameters: obj({}),
        run: async () => (await dev().presetSlots()).map(p => ({ slot: AT.device.slotLabel(p.filename), name: p.name })),
      },
      {
        name: "get_preset",
        description: "The full document stored in one slot.",
        parameters: obj({ slot: str("Slot like 17A") }, ["slot"]),
        run: async ({ slot }) => (await dev().getPreset(AT.device.slotFilename(slot))) || { empty: true },
      },
      {
        name: "validate_preset",
        description: "Check a preset document against the format and the block catalogue.",
        parameters: obj({ document: docParam }, ["document"]),
        run: ({ document }) => issuesOf(document),
      },
      {
        name: "audition_preset",
        description: "Play a preset document on the pedal without saving it. The pedal plays it until a preset is selected again.",
        parameters: obj({ document: docParam }, ["document"]),
        run: async ({ document }) => {
          const { errors } = issuesOf(document);
          if (errors.length) return { notSent: true, errors };
          await dev().audition(document);
          app.setCurrent(document);
          return { playing: (document.preset || {}).name || "(unnamed)" };
        },
      },
      {
        name: "save_preset",
        description: "Write a preset into a slot. The page asks the player to confirm, refuses on an untested firmware, and keeps a backup of what the slot held. Only when the player asked to save and named a slot.",
        parameters: obj({ slot: str("Slot like 17A"), document: docParam }, ["slot", "document"]),
        run: async ({ slot, document }) => app.savePreset(slot, document),
      },
      {
        name: "measure",
        description: "Measure whatever the pedal is playing now with test signals. quick: frequency response only (~15 s); otherwise also distortion and dynamics (~90 s). Makes sound.",
        parameters: obj({ quick: { type: "boolean" }, label: str("Short name for the chart legend") }),
        run: async ({ quick, label }) => app.measure({ quick: !!quick, label, by: "assistant" }),
      },
      {
        name: "list_measurements",
        description: "Measurements saved on this page, newest last, with ids.",
        parameters: obj({}),
        run: async () => (await AT.store.measurements()).map(m => ({ id: m.id, label: m.label, full: !!m.report.dynamics })),
      },
      {
        name: "compare_measurements",
        description: "What changed between two saved measurements, band by band.",
        parameters: obj({ a: str("Earlier measurement id"), b: str("Later measurement id") }, ["a", "b"]),
        run: async ({ a, b }) => {
          const [ma, mb] = await Promise.all([AT.store.getMeasurement(a), AT.store.getMeasurement(b)]);
          if (!ma || !mb) return { error: "No such measurement id." };
          return AT.dsp.compare(ma.report, mb.report);
        },
      },
      {
        name: "list_takes",
        description: "Recorded and reamped takes on this page, with ids and whether each has a dry source.",
        parameters: obj({}),
        run: async () => (await AT.store.takes()).map(t => ({ id: t.id, label: t.label, hasDry: !!t.files.dry, seconds: t.analysis && t.analysis.seconds })),
      },
      {
        name: "reamp_take",
        description: "Send a take's dry audio through a preset document (auditioned first) or, without a document, through whatever the pedal plays now. Reports modulation, octave, tail and played tonal balance, and saves the wet take for the player to hear.",
        parameters: obj({ take_id: str("Take id with a dry source"), label: str("What changed, e.g. 'Eden cab'"), document: docParam }, ["take_id", "label"]),
        run: async ({ take_id, label, document }) => app.reamp({ takeId: take_id, label, document, by: "assistant" }),
      },
      {
        name: "set_target",
        description: "Draw the curve the research says to aim for over the measurements, from a few points in Hz to dB, e.g. {\"60\": 5, \"700\": -4, \"3500\": 4}.",
        parameters: obj({ name: str("Target name"), points: { type: "object", description: "Hz (string) to dB (number)" }, note: str("Why, in one line") }, ["name", "points"]),
        run: async ({ name, points, note }) => {
          const p = parsePoints(points);
          const id = await AT.store.saveTarget(name, targetGains(p), p, note);
          app.refresh();
          return { saved: id };
        },
      },
      {
        name: "ask_user",
        description: "Ask the player a multiple-choice question in the chat and wait for the answer. Use for anything about their rig, taste or hardware; offer two to four concrete options.",
        parameters: obj({ question: str("The question"), options: { type: "array", items: { type: "string" } }, multiple: { type: "boolean" } }, ["question", "options"]),
        run: ({ question, options, multiple }) => app.askUser(question, options || [], !!multiple),
      },
    ];
    tools.push(
      {
        name: "list_references",
        description: "Reference tones the player cut from a bass stem, with the DI take linked to each (the player playing the same part).",
        parameters: obj({}),
        run: async () => (await AT.store.references()).map(r => ({ id: r.id, name: r.name, seconds: +(r.end - r.start).toFixed(1), di: r.di || null, profile: r.profile, rounds: (r.rounds || []).length })),
      },
      {
        name: "match_reference",
        description: "Reamp the reference's DI (or another take with a dry source) through a preset document (auditioned first) or the current sound, and score the result against the reference: tone error in dB, the bands to move, compression and brightness gaps. Each call is kept as a round.",
        parameters: obj({ reference_id: str("Reference id"), document: docParam, label: str("What this round changed"), take_id: str("Optional: a different take with dry audio") }, ["reference_id", "label"]),
        run: async ({ reference_id, document, label, take_id }) => {
          const ref = await AT.store.getReference(reference_id);
          if (!ref) return { error: "No such reference." };
          const takeId = take_id || ref.di;
          if (!takeId) return { error: "This reference has no DI linked. Ask the player to record or upload a DI of the same part and link it on the reference card." };
          const r = await app.reamp({ takeId, label: `${ref.name} · ${label}`, document, by: "assistant" });
          if (!r.id) return r;
          const wet = await AT.store.audio(r.id + ":wet");
          const g = AT.match.gap(ref.profile, AT.match.profile(wet, 48000));
          ref.rounds = [...(ref.rounds || []), { label, take: r.id, toneErrorDb: g.toneErrorDb, at: Date.now() / 1000 }];
          await AT.store.putReference(ref);
          return { take: r.id, gap: AT.match.gapSummary(g), toneErrorDb: g.toneErrorDb, bandsDb: g.bandsDb, rounds: ref.rounds.map(x => `${x.label}: ${x.toneErrorDb} dB`) };
        },
      },
      {
        name: "read_url",
        description: "Read a web page as text: a forum thread, an interview, a rig rundown, or a link the player pasted.",
        parameters: obj({ url: str("http(s) URL") }, ["url"]),
        run: async ({ url }) => {
          if (!/^https?:\/\//.test(url)) return { error: "Only http(s) URLs." };
          const res = await fetch("https://r.jina.ai/" + url);
          if (!res.ok) return { error: `Could not read the page (HTTP ${res.status}).` };
          const text = await res.text();
          return text.length > 15000 ? text.slice(0, 15000) + "\n[truncated]" : text;
        },
      },
      {
        name: "research",
        description: "Search the web: how a sound is made (EQ bands, compression times), an artist's rig, what a piece of gear is known for. Returns an answer with sources.",
        parameters: obj({ query: str("A specific question or search phrase") }, ["query"]),
        run: async ({ query }, ctx = {}) => {
          const cfg = app.aiConfig(), errors = [];
          if (cfg.key) {
            try { return await AT.ai.providers[cfg.provider].research(cfg.key, cfg.model, query, { signal: ctx.signal }); }
            catch (e) { errors.push(e.message); }
          }
          if (cfg.searchKey) {
            try { return await tavily(cfg.searchKey, query, ctx.signal); }
            catch (e) { errors.push(e.message); }
          }
          return { error: "Web search is not available: " + (errors.join(" / ") || "no key") + ". Say so, and use read_url on links the player gives you." };
        },
      },
    );
    return tools;
  }

  AT.makeTools = makeTools;
  AT.targetGains = targetGains;
})(typeof globalThis !== "undefined" ? globalThis : window);
