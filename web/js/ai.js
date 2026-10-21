// Browser-only, bring-your-own-key LLM agent layer (Gemini, OpenAI, Anthropic).
// Classic script: exposes AT.ai on the global object. Uses global fetch.
(function (root) {
  "use strict";
  const AT = (root.AT = root.AT || {});

  // ---------------------------------------------------------------- helpers

  function abortError() {
    if (typeof DOMException === "function") return new DOMException("The operation was aborted.", "AbortError");
    const e = new Error("The operation was aborted.");
    e.name = "AbortError";
    return e;
  }

  function isAbort(e) {
    return !!e && e.name === "AbortError";
  }

  // Rejects as soon as the signal fires, even if the wrapped promise ignores it.
  function abortable(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
        (e) => { signal.removeEventListener("abort", onAbort); reject(e); }
      );
    });
  }

  let idSeq = 0;
  function newId(prefix) {
    return prefix + Date.now().toString(36) + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function resultText(result) {
    if (typeof result === "string") return result;
    if (result === undefined) return "null";
    try {
      return JSON.stringify(result);
    } catch (e) {
      return String(result);
    }
  }

  function isErrorResult(r) {
    return !!r && typeof r === "object" && !Array.isArray(r) && "error" in r;
  }

  function parseArgs(s) {
    if (s && typeof s === "object") return s;
    if (!s) return {};
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? v : { value: v };
    } catch (e) {
      return { _invalid_json: String(s) };
    }
  }

  function providerMessage(body) {
    if (!body) return "";
    if (typeof body === "string") return body.slice(0, 300);
    const e = body.error;
    if (e && typeof e === "object") return String(e.message || e.status || e.type || "").slice(0, 300);
    if (typeof e === "string") return e.slice(0, 300);
    return String(body.message || "").slice(0, 300);
  }

  function httpError(label, status, body) {
    const msg = providerMessage(body);
    let kind, head;
    // Gemini answers an invalid key with 400 INVALID_ARGUMENT, not 401.
    if (status === 401 || status === 403 || (status === 400 && /api key not valid|api_key_invalid|invalid api key|invalid x-api-key/i.test(msg))) {
      kind = "auth"; head = "the key was rejected";
    } else if (status === 429) {
      kind = "rate_limit"; head = "rate limited / quota exceeded";
    } else if (status >= 500) {
      kind = "server"; head = "server error, try again later";
    } else {
      kind = "request"; head = "request failed";
    }
    const err = new Error(`${label}: ${head} (HTTP ${status}${msg ? ": " + msg : ""})`);
    err.status = status;
    err.kind = kind;
    err.provider = label;
    err.providerMessage = msg;
    return err;
  }

  async function request(label, url, { method = "POST", headers = {}, body, signal } = {}) {
    let res, text;
    const h = Object.assign(body !== undefined ? { "content-type": "application/json" } : {}, headers);
    try {
      res = await fetch(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
      text = await res.text();
    } catch (e) {
      if (isAbort(e) || (signal && signal.aborted)) throw abortError();
      const err = new Error(`${label}: network error (${(e && e.message) || e}). Check the connection; an extension or CORS policy may also block the request.`);
      err.kind = "network";
      err.cause = e;
      throw err;
    }
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }
    if (!res.ok) throw httpError(label, res.status, data);
    if (!data || typeof data !== "object") throw new Error(`${label}: unexpected response (not JSON)`);
    return data;
  }

  function addSource(list, url, title) {
    if (!url) return;
    const hit = list.find((s) => s.url === url);
    if (hit) {
      if (!hit.title && title) hit.title = title;
    } else {
      list.push({ title: title || "", url });
    }
  }

  // Merge consecutive same-role messages; the copy keeps raw arrays untouched.
  function pushMerged(out, role, key, items) {
    if (!items.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last[key].push(...items);
    else out.push({ role, [key]: items.slice() });
  }

  // ------------------------------------------------------- model list sorting

  function versionKey(id) {
    const base = id.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8}$/, "");
    const m = /(\d+(?:[.-]\d+)*)/.exec(base);
    return m ? m[1].split(/[.-]/).map(Number) : [];
  }

  function cmpVersion(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function tierOf(id) {
    if (/(^|-)(pro|ultra|argon|astra|opus|fable)(-|$)/.test(id)) return 0;
    if (/(^|-)(nano|lite)(-|$)/.test(id)) return 3;
    if (/(^|-)(mini|luna|haiku)(-|$)/.test(id)) return 2;
    return 1;
  }

  function isUnstable(id) {
    return /preview|exp|latest|-\d{4}-\d{2}-\d{2}$|-\d{2}-\d{4}$|-\d{2}-\d{2}$/.test(id) ? 1 : 0;
  }

  function rankModels(ids) {
    return ids.slice().sort((a, b) =>
      cmpVersion(versionKey(b), versionKey(a)) || tierOf(a) - tierOf(b) || isUnstable(a) - isUnstable(b) || a.length - b.length || a.localeCompare(b));
  }

  function pickFirst(models, patterns) {
    for (const re of patterns) {
      const hit = models.find((m) => re.test(m));
      if (hit) return hit;
    }
    return models[0];
  }

  const RESEARCH_SYSTEM = "Search the web to answer the query. Answer concisely and factually, prefer primary sources, and say when sources disagree or nothing reliable was found.";

  // ------------------------------------------------------------------ Gemini
  // generateContent (stateless, full history each turn). Docs: ai.google.dev/api/generate-content

  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
  const GEMINI_GEN_ID = "gem_";
  const GEMINI_DUMMY_SIGNATURE = "skip_thought_signature_validator";
  const GEMINI_SCHEMA_KEYS = new Set(["type", "format", "title", "description", "nullable", "enum", "maxItems", "minItems",
    "properties", "required", "minProperties", "maxProperties", "minLength", "maxLength", "pattern", "example", "anyOf",
    "propertyOrdering", "items", "minimum", "maximum"]);
  const GEMINI_FORMATS = new Set(["enum", "date-time", "int32", "int64", "float", "double"]);

  // JSON Schema -> Gemini OpenAPI-subset Schema.
  function toGeminiSchema(schema) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
    const s = Object.assign({}, schema);
    if (Array.isArray(s.type)) {
      const types = s.type.filter((t) => t !== "null");
      if (types.length < s.type.length) s.nullable = true;
      s.type = types[0] || "string";
    }
    if ("const" in s) {
      s.enum = [s.const];
      delete s.const;
    }
    if (s.oneOf && !s.anyOf) s.anyOf = s.oneOf;
    if (Array.isArray(s.enum)) {
      if (s.enum.every((v) => typeof v === "string")) {
        if (!s.type) s.type = "string";
      } else {
        // Gemini enums must be strings; keep the constraint as prose instead.
        s.description = ((s.description ? s.description + " " : "") + "Allowed values: " + s.enum.map((v) => JSON.stringify(v)).join(", ") + ".").trim();
        if (!s.type) {
          const t = typeof s.enum.find((v) => v !== null);
          s.type = t === "number" ? (s.enum.every((v) => v === null || Number.isInteger(v)) ? "integer" : "number") : t === "boolean" ? "boolean" : "string";
        }
        delete s.enum;
      }
    }
    if (s.format && !GEMINI_FORMATS.has(s.format)) delete s.format;
    const out = {};
    for (const k of Object.keys(s)) if (GEMINI_SCHEMA_KEYS.has(k)) out[k] = s[k];
    if (out.properties && typeof out.properties === "object") {
      const props = {};
      for (const [k, v] of Object.entries(out.properties)) props[k] = toGeminiSchema(v);
      if (Object.keys(props).length) out.properties = props;
      else delete out.properties;
    }
    if (Array.isArray(out.required)) {
      out.required = out.required.filter((k) => out.properties && k in out.properties);
      if (!out.required.length) delete out.required;
    }
    if (out.items) out.items = toGeminiSchema(out.items);
    if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map(toGeminiSchema);
    return out;
  }

  function geminiDeclaration(tool) {
    const d = { name: tool.name, description: tool.description || "" };
    const p = tool.parameters && toGeminiSchema(tool.parameters);
    if (p && p.properties) d.parameters = p; // no-arg functions must omit parameters
    return d;
  }

  function geminiResponseObject(result) {
    return result && typeof result === "object" && !Array.isArray(result) ? result : { result: result === undefined ? null : result };
  }

  function geminiContents(history) {
    const out = [];
    const nativeIds = new Set();
    for (const e of history) {
      if (e.role === "user") {
        if (e.text) pushMerged(out, "user", "parts", [{ text: e.text }]);
      } else if (e.role === "assistant") {
        if (e.raw && e.raw.provider === "gemini" && Array.isArray(e.raw.parts)) {
          for (const p of e.raw.parts) if (p.functionCall && p.functionCall.id) nativeIds.add(p.functionCall.id);
          pushMerged(out, "model", "parts", e.raw.parts);
        } else {
          // Turn produced by another provider: rebuild parts, with the documented dummy signature on the first call.
          const parts = [];
          if (e.text) parts.push({ text: e.text });
          (e.toolCalls || []).forEach((c, i) => {
            const part = { functionCall: { name: c.name, args: c.args || {} } };
            if (i === 0) part.thoughtSignature = GEMINI_DUMMY_SIGNATURE;
            parts.push(part);
          });
          pushMerged(out, "model", "parts", parts);
        }
      } else if (e.role === "tool") {
        const fr = { name: e.name, response: geminiResponseObject(e.result) };
        if (nativeIds.has(e.id)) fr.id = e.id;
        pushMerged(out, "user", "parts", [{ functionResponse: fr }]);
      }
    }
    return out;
  }

  function geminiModelPath(model) {
    return encodeURIComponent(String(model).replace(/^models\//, ""));
  }

  function geminiCandidate(data) {
    const cand = data.candidates && data.candidates[0];
    if (!cand) {
      const r = data.promptFeedback && data.promptFeedback.blockReason;
      throw new Error(`Gemini: no response${r ? " (prompt blocked: " + r + ")" : ""}`);
    }
    return cand;
  }

  function geminiText(parts) {
    return parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
  }

  const gemini = {
    id: "gemini",
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Free tier without a card (Google AI Studio). Free-tier prompts may be used by Google to improve its products. Web research (Google Search grounding) needs a paid-tier key.",
    fallbackModel: "gemini-3.8-flash",

    async listModels(key, { signal } = {}) {
      const ids = [];
      let token = "";
      do {
        const url = `${GEMINI_BASE}/models?pageSize=1000${token ? "&pageToken=" + encodeURIComponent(token) : ""}`;
        const data = await request("Gemini", url, { method: "GET", headers: { "x-goog-api-key": key }, signal });
        for (const m of data.models || []) {
          const id = String(m.name || "").replace(/^models\//, "");
          if (!/^gemini-/.test(id)) continue;
          if (!(m.supportedGenerationMethods || []).includes("generateContent")) continue;
          if (/(tts|image|live|transcribe|embedding|audio|native|computer-use|robotics|aqa|banana|omni|translate|learnlm)/i.test(id)) continue;
          if (!ids.includes(id)) ids.push(id);
        }
        token = data.nextPageToken || "";
      } while (token);
      return rankModels(ids);
    },

    defaultModel(models) {
      if (!models || !models.length) return gemini.fallbackModel;
      // Prefer a stable flash (free tier, fast, good tool use), then any non-lite flash.
      return pickFirst(rankModels(models), [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash(?!-lite)(?!.*(preview|exp))/, /flash(?!-lite)/, /flash/]);
    },

    async chat({ key, model, system, history, tools, signal }) {
      const body = { contents: geminiContents(history) };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (tools && tools.length) body.tools = [{ functionDeclarations: tools.map(geminiDeclaration) }];
      const data = await request("Gemini", `${GEMINI_BASE}/models/${geminiModelPath(model)}:generateContent`, {
        headers: { "x-goog-api-key": key }, body, signal,
      });
      const cand = geminiCandidate(data);
      const parts = (cand.content && cand.content.parts) || [];
      if (!parts.length && cand.finishReason && cand.finishReason !== "STOP") {
        throw new Error(`Gemini: generation stopped (${cand.finishReason}${cand.finishMessage ? ": " + cand.finishMessage : ""})`);
      }
      const toolCalls = [];
      for (const p of parts) {
        if (p.functionCall) toolCalls.push({ id: p.functionCall.id || newId(GEMINI_GEN_ID), name: p.functionCall.name, args: p.functionCall.args || {} });
      }
      // raw.parts is replayed verbatim so thoughtSignature values survive.
      return { text: geminiText(parts), toolCalls, raw: { provider: "gemini", parts }, finishReason: cand.finishReason };
    },

    async research(key, model, query, { signal } = {}) {
      const body = {
        systemInstruction: { parts: [{ text: RESEARCH_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
      };
      let data;
      try {
        data = await request("Gemini", `${GEMINI_BASE}/models/${geminiModelPath(model)}:generateContent`, { headers: { "x-goog-api-key": key }, body, signal });
      } catch (e) {
        if (e.status && e.kind !== "auth") e.message += ` Google Search grounding needs a paid-tier key and a model that supports it (${model}).`;
        throw e;
      }
      const cand = geminiCandidate(data);
      const parts = (cand.content && cand.content.parts) || [];
      const sources = [];
      const gm = cand.groundingMetadata || {};
      for (const ch of gm.groundingChunks || []) if (ch.web) addSource(sources, ch.web.uri, ch.web.title);
      return { text: geminiText(parts), sources, queries: gm.webSearchQueries || [] };
    },
  };

  // ------------------------------------------------------------------ OpenAI
  // Responses API, stateless (store:false); reasoning items come back with encrypted_content and are replayed.

  const OPENAI_BASE = "https://api.openai.com/v1";

  function openaiHeaders(key) {
    return { authorization: `Bearer ${key}` };
  }

  function openaiInput(history) {
    const items = [];
    for (const e of history) {
      if (e.role === "user") {
        items.push({ role: "user", content: e.text || "" });
      } else if (e.role === "assistant") {
        if (e.raw && e.raw.provider === "openai" && Array.isArray(e.raw.output)) {
          items.push(...e.raw.output);
        } else {
          if (e.text) items.push({ role: "assistant", content: e.text });
          for (const c of e.toolCalls || []) items.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.args || {}) });
        }
      } else if (e.role === "tool") {
        items.push({ type: "function_call_output", call_id: e.id, output: resultText(e.result) });
      }
    }
    return items;
  }

  function openaiParse(data) {
    if (data.status === "failed") throw new Error(`OpenAI: response failed (${providerMessage(data) || "unknown error"})`);
    let text = "";
    const toolCalls = [];
    const sources = [];
    for (const item of data.output || []) {
      if (item.type === "message") {
        for (const c of item.content || []) {
          if (c.type === "output_text") {
            text += c.text || "";
            for (const a of c.annotations || []) if (a.type === "url_citation") addSource(sources, a.url, a.title);
          } else if (c.type === "refusal") {
            text += c.refusal || "";
          }
        }
      } else if (item.type === "function_call") {
        toolCalls.push({ id: item.call_id, name: item.name, args: parseArgs(item.arguments) });
      } else if (item.type === "web_search_call") {
        const srcs = (item.action && item.action.sources) || [];
        for (const s of srcs) addSource(sources, s.url, s.title);
      }
    }
    if (!text && !toolCalls.length && data.status === "incomplete") {
      const r = data.incomplete_details && data.incomplete_details.reason;
      throw new Error(`OpenAI: response incomplete${r ? " (" + r + ")" : ""}`);
    }
    return { text, toolCalls, sources };
  }

  const openai = {
    id: "openai",
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "Paid API key (prepaid credits). Separate from a ChatGPT subscription.",
    fallbackModel: "gpt-6.1-sol",

    async listModels(key, { signal } = {}) {
      const data = await request("OpenAI", `${OPENAI_BASE}/models`, { method: "GET", headers: openaiHeaders(key), signal });
      let ids = (data.data || []).map((m) => String(m.id)).filter((id) =>
        /^(gpt-|o\d)/.test(id) &&
        !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|codex|moderation|computer-use|diarize|oss|deep-research)/.test(id));
      // Hide dated snapshots when their alias is listed.
      ids = ids.filter((id) => {
        const alias = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
        return alias === id || !ids.includes(alias);
      });
      return rankModels(ids);
    },

    defaultModel(models) {
      if (!models || !models.length) return openai.fallbackModel;
      return pickFirst(rankModels(models), [/^gpt-[\d.]+-sol$/, /^gpt-[\d.]+-terra$/, /^gpt-[\d.]+-mini$/, /^gpt-[\d.]+$/, /^gpt-/]);
    },

    async chat({ key, model, system, history, tools, signal }) {
      const body = { model, input: openaiInput(history), store: false };
      if (system) body.instructions = system;
      if (tools && tools.length) {
        body.tools = tools.map((t) => ({
          type: "function",
          name: t.name,
          description: t.description || "",
          parameters: t.parameters || { type: "object", properties: {} },
          strict: false, // app schemas may have optional fields; strict mode would force them required
        }));
        body.parallel_tool_calls = true;
      }
      const data = await request("OpenAI", `${OPENAI_BASE}/responses`, { headers: openaiHeaders(key), body, signal });
      const { text, toolCalls } = openaiParse(data);
      return { text, toolCalls, raw: { provider: "openai", output: data.output || [] } };
    },

    async research(key, model, query, { signal } = {}) {
      const body = {
        model,
        instructions: RESEARCH_SYSTEM,
        input: query,
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        store: false,
      };
      let data;
      try {
        data = await request("OpenAI", `${OPENAI_BASE}/responses`, { headers: openaiHeaders(key), body, signal });
      } catch (e) {
        if (e.status === 400) e.message += ` Model ${model} may not support the web_search tool.`;
        throw e;
      }
      const { text, sources } = openaiParse(data);
      return { text, sources };
    },
  };

  // --------------------------------------------------------------- Anthropic
  // Messages API with the direct-browser-access CORS opt-in header.

  const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
  const ANTHROPIC_MAX_TOKENS = 16000;

  function anthropicHeaders(key) {
    return {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  function anthropicId(id) {
    return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_") || "id";
  }

  function anthropicMessages(history) {
    const out = [];
    for (const e of history) {
      if (e.role === "user") {
        if (e.text) pushMerged(out, "user", "content", [{ type: "text", text: e.text }]);
      } else if (e.role === "assistant") {
        if (e.raw && e.raw.provider === "anthropic" && Array.isArray(e.raw.content)) {
          pushMerged(out, "assistant", "content", e.raw.content);
        } else {
          const blocks = [];
          if (e.text) blocks.push({ type: "text", text: e.text });
          for (const c of e.toolCalls || []) blocks.push({ type: "tool_use", id: anthropicId(c.id), name: c.name, input: c.args || {} });
          pushMerged(out, "assistant", "content", blocks);
        }
      } else if (e.role === "tool") {
        const block = { type: "tool_result", tool_use_id: anthropicId(e.id), content: resultText(e.result) };
        if (isErrorResult(e.result)) block.is_error = true;
        pushMerged(out, "user", "content", [block]);
      }
    }
    return out;
  }

  function anthropicText(content) {
    return content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
  }

  const anthropic = {
    id: "anthropic",
    label: "Anthropic Claude",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyHint: "Paid API key (prepaid credits). Separate from a Claude.ai subscription.",
    fallbackModel: "claude-sonnet-5-5",
    _meta: {},

    async listModels(key, { signal } = {}) {
      const rows = [];
      let after = "";
      for (;;) {
        const url = `${ANTHROPIC_BASE}/models?limit=1000${after ? "&after_id=" + encodeURIComponent(after) : ""}`;
        const data = await request("Anthropic", url, { method: "GET", headers: anthropicHeaders(key), signal });
        rows.push(...(data.data || []));
        if (!data.has_more || !data.last_id) break;
        after = data.last_id;
      }
      for (const m of rows) anthropic._meta[m.id] = m;
      // The API lists newest first; keep that order but move deprecated models to the end.
      const active = rows.filter((m) => m.lifecycle !== "deprecated").map((m) => m.id);
      const old = rows.filter((m) => m.lifecycle === "deprecated").map((m) => m.id);
      return active.concat(old);
    },

    defaultModel(models) {
      if (!models || !models.length) return anthropic.fallbackModel;
      const line = (id) => (anthropic._meta[id] && anthropic._meta[id].line) || "";
      return models.find((id) => line(id) === "sonnet") || pickFirst(models, [/sonnet/, /haiku/]);
    },

    async chat({ key, model, system, history, tools, signal }) {
      const body = { model, max_tokens: ANTHROPIC_MAX_TOKENS, messages: anthropicMessages(history) };
      if (system) body.system = system;
      if (tools && tools.length) {
        body.tools = tools.map((t) => ({
          name: t.name,
          description: t.description || "",
          input_schema: t.parameters || { type: "object", properties: {} },
        }));
      }
      const data = await request("Anthropic", `${ANTHROPIC_BASE}/messages`, { headers: anthropicHeaders(key), body, signal });
      const content = data.content || [];
      if (!content.length && data.stop_reason === "max_tokens") throw new Error("Anthropic: output limit reached before any content");
      const toolCalls = content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
      // raw.content keeps thinking blocks (with signatures) for exact replay.
      return { text: anthropicText(content), toolCalls, raw: { provider: "anthropic", content }, stopReason: data.stop_reason };
    },

    async research(key, model, query, { signal } = {}) {
      const meta = anthropic._meta[model];
      const ws = meta && meta.capabilities && meta.capabilities.server_tools && meta.capabilities.server_tools.web_search;
      if (ws && ws.supported === false) throw new Error(`Anthropic: model ${model} does not support the web search tool.`);
      const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
      const messages = [{ role: "user", content: query }];
      const all = [];
      for (let i = 0; i < 5; i++) {
        let data;
        try {
          data = await request("Anthropic", `${ANTHROPIC_BASE}/messages`, {
            headers: anthropicHeaders(key), body: { model, max_tokens: ANTHROPIC_MAX_TOKENS, system: RESEARCH_SYSTEM, messages, tools }, signal,
          });
        } catch (e) {
          if (e.status === 400) e.message += ` Web search may be disabled for the organization or unsupported by ${model}.`;
          throw e;
        }
        const content = data.content || [];
        all.push(...content);
        if (data.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content }); // resume a paused server-tool turn
      }
      const sources = [];
      let searchError = "";
      for (const b of all) {
        if (b.type === "web_search_tool_result") {
          if (Array.isArray(b.content)) for (const r of b.content) addSource(sources, r.url, r.title);
          else if (b.content && b.content.error_code) searchError = b.content.error_code;
        } else if (b.type === "text") {
          for (const c of b.citations || []) addSource(sources, c.url, c.title);
        }
      }
      const text = anthropicText(all);
      if (!text && searchError) throw new Error(`Anthropic: web search failed (${searchError})`);
      return { text, sources };
    },
  };

  const providers = { gemini, openai, anthropic };

  function resolveProvider(p) {
    if (p && typeof p === "object") return p;
    const hit = providers[p || "gemini"];
    if (!hit) throw new Error(`Unknown provider: ${p}`);
    return hit;
  }

  // ----------------------------------------------------------- context budget

  const DEFAULT_CONTEXT = { maxChars: 150000, keepTurns: 6, minChars: 800 };

  function entryChars(e) {
    return e.role === "tool" ? resultText(e.result).length : (e.text || "").length;
  }

  // Returns a request view where large tool results older than the last keepTurns
  // assistant turns are replaced (oldest first) until under maxChars. Calls and results stay paired.
  function compactHistory(history, opts) {
    const { maxChars, keepTurns, minChars } = Object.assign({}, DEFAULT_CONTEXT, opts);
    let total = 0;
    for (const e of history) total += entryChars(e);
    if (total <= maxChars) return history;
    let cutoff = -1;
    for (let i = history.length - 1, seen = 0; i >= 0; i--) {
      if (history[i].role === "assistant" && ++seen === keepTurns) { cutoff = i; break; }
    }
    if (cutoff < 0) return history;
    return history.map((e, i) => {
      if (i >= cutoff || e.role !== "tool" || total <= maxChars) return e;
      const len = entryChars(e);
      if (len < minChars) return e;
      const marker = `[omitted: old ${e.name} result, ${len} chars]`;
      total -= len - marker.length;
      return Object.assign({}, e, { result: marker });
    });
  }

  // ------------------------------------------------------------------- Agent

  class Agent {
    constructor({ provider = "gemini", key = "", model = "", system = "", tools = [], maxSteps = 24, onEvent = null, context = null } = {}) {
      this.provider = resolveProvider(provider);
      this.key = key;
      this.model = model || this.provider.defaultModel([]);
      this.system = system;
      this.tools = tools;
      this.maxSteps = maxSteps;
      this.onEvent = onEvent;
      this.context = Object.assign({}, DEFAULT_CONTEXT, context);
      this.history = [];
      this.busy = false;
    }

    reset() {
      this.history = [];
    }

    _emit(e) {
      if (!this.onEvent) return;
      try {
        this.onEvent(e);
      } catch (err) {
        if (root.console) root.console.error("AT.ai onEvent handler failed", err);
      }
    }

    async send(userText, { signal } = {}) {
      if (this.busy) throw new Error("The assistant is already running.");
      this.busy = true;
      try {
        return await this._loop(String(userText), signal);
      } finally {
        this.busy = false;
      }
    }

    async _loop(userText, signal) {
      this.history.push({ role: "user", text: userText });
      const decls = this.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
      let lastText = "";
      let stopped = "error";
      try {
        for (let step = 0; step < this.maxSteps; step++) {
          if (signal && signal.aborted) throw abortError();
          const turn = await abortable(this.provider.chat({
            key: this.key, model: this.model, system: this.system,
            history: compactHistory(this.history, this.context), tools: decls, signal,
          }), signal);
          const entry = { role: "assistant", text: turn.text || "", toolCalls: turn.toolCalls || [], raw: turn.raw };
          this.history.push(entry);
          if (entry.text) {
            lastText = entry.text;
            this._emit({ type: "assistant_text", text: entry.text });
          }
          if (!entry.toolCalls.length) {
            stopped = "complete";
            return entry.text;
          }
          await this._runTools(entry.toolCalls, signal);
        }
        stopped = "max_steps";
        this._emit({ type: "error", error: `Stopped after ${this.maxSteps} steps.`, maxSteps: true });
        return lastText;
      } catch (e) {
        if (isAbort(e) || (signal && signal.aborted)) {
          stopped = "aborted";
          this._emit({ type: "error", error: "cancelled", aborted: true });
          throw abortError();
        }
        this._emit({ type: "error", error: (e && e.message) || String(e) });
        throw e;
      } finally {
        this._emit({ type: "done", text: lastText, stopped });
      }
    }

    async _runTools(calls, signal) {
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        if (signal && signal.aborted) {
          this._cancelFrom(calls, i);
          throw abortError();
        }
        this._emit({ type: "tool_call", id: call.id, name: call.name, args: call.args });
        const tool = this.tools.find((t) => t.name === call.name);
        let result;
        try {
          if (!tool) result = { error: `Unknown tool: ${call.name}` };
          else result = await abortable(Promise.resolve().then(() => tool.run(call.args || {}, { signal, agent: this, call })), signal);
          if (result === undefined) result = null;
        } catch (e) {
          if (signal && signal.aborted) {
            this._cancelFrom(calls, i);
            throw abortError();
          }
          result = { error: (e && e.message) || String(e) };
        }
        this.history.push({ role: "tool", id: call.id, name: call.name, result });
        this._emit({ type: "tool_result", id: call.id, name: call.name, result });
      }
    }

    _cancelFrom(calls, from) {
      for (let i = from; i < calls.length; i++) {
        const result = { error: "cancelled" };
        this.history.push({ role: "tool", id: calls[i].id, name: calls[i].name, result });
        this._emit({ type: "tool_result", id: calls[i].id, name: calls[i].name, result });
      }
    }

    // The API key is intentionally not serialised.
    toJSON() {
      return { v: 1, provider: this.provider.id, model: this.model, system: this.system, maxSteps: this.maxSteps, history: this.history };
    }

    static fromJSON(data, opts = {}) {
      const d = typeof data === "string" ? JSON.parse(data) : data;
      const agent = new Agent(Object.assign({ provider: d.provider, model: d.model, system: d.system, maxSteps: d.maxSteps }, opts));
      agent.history = JSON.parse(JSON.stringify(d.history || []));
      return agent;
    }
  }

  // source: an Agent, or a (possibly async) function returning {provider, key, model, researchModel?}.
  function researchTool(source) {
    return {
      name: "research",
      description: "Search the web for current information (gear specs, artist rigs, tone descriptions). Returns a short answer and its sources.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What to look up, as a specific question or search phrase." } },
        required: ["query"],
      },
      async run(args, ctx = {}) {
        const cfg = typeof source === "function" ? await source() : source;
        if (!args || !args.query) return { error: "query is required" };
        const provider = resolveProvider(cfg.provider);
        return provider.research(cfg.key, cfg.researchModel || cfg.model, String(args.query), { signal: ctx.signal });
      },
    };
  }

  AT.ai = {
    providers,
    Agent,
    researchTool,
    compactHistory,
    toGeminiSchema,
    rankModels,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
