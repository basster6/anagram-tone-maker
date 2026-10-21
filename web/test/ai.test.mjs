// Run: node web/test/ai.test.mjs
// Loads web/js/ai.js as a classic script and mocks global fetch; no real API calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(here, "../js/ai.js"), "utf8"), { filename: "ai.js" });
const { providers, Agent, researchTool, compactHistory, toGeminiSchema } = globalThis.AT.ai;

// ------------------------------------------------------------ fetch mock

let calls = [];
let queue = [];

function json(body, status = 200) {
  return { status, body };
}

// handler: response object, a function (call) => response, or "hang" (waits for abort)
function mock(...handlers) {
  calls = [];
  queue = handlers.slice();
}

globalThis.fetch = async (url, init = {}) => {
  const headers = {};
  for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
  const call = { url: String(url), method: init.method || "GET", headers, body: init.body ? JSON.parse(init.body) : undefined };
  calls.push(call);
  let h = queue.shift();
  if (h === undefined) throw new Error("unexpected fetch: " + url);
  if (typeof h === "function") h = h(call);
  if (h === "hang") {
    return new Promise((_, reject) => {
      const fail = () => reject(new DOMException("aborted", "AbortError"));
      if (init.signal?.aborted) fail();
      init.signal?.addEventListener("abort", fail);
    });
  }
  if (h instanceof Error) throw h;
  return new Response(typeof h.body === "string" ? h.body : JSON.stringify(h.body), { status: h.status, headers: { "content-type": "application/json" } });
};

const clone = (v) => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------ fixtures

const toneTools = (log = []) => [
  {
    name: "read_block",
    description: "Read a block",
    parameters: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: {
        slot: { type: "integer", minimum: 0, maximum: 8, default: 0 },
        mode: { type: ["string", "null"], enum: ["full", "brief", null] },
        gain: { type: "number", enum: [0.5, 1] },
      },
      required: ["slot", "missing"],
    },
    run: async (args) => {
      log.push("read:" + args.slot);
      await new Promise((r) => setTimeout(r, 5));
      log.push("read-end:" + args.slot);
      return { block: "drive", slot: args.slot };
    },
  },
  {
    name: "measure",
    description: "Measure the preset",
    parameters: { type: "object", properties: {} },
    run: async () => {
      log.push("measure");
      return 42;
    },
  },
  {
    name: "explode",
    description: "Always fails",
    parameters: { type: "object", properties: {} },
    run: async () => {
      throw new Error("pedal not connected");
    },
  },
];

// ------------------------------------------------------------ Gemini

test("gemini: schema translation strips unsupported keywords", () => {
  const s = toGeminiSchema(toneTools()[0].parameters);
  assert.equal(s.$schema, undefined);
  assert.equal(s.additionalProperties, undefined);
  assert.equal(s.properties.slot.default, undefined);
  assert.equal(s.properties.slot.minimum, 0);
  assert.equal(s.properties.mode.type, "string");
  assert.equal(s.properties.mode.nullable, true);
  assert.equal(s.properties.gain.enum, undefined);
  assert.match(s.properties.gain.description, /Allowed values: 0\.5, 1/);
  assert.deepEqual(s.required, ["slot"]);
});

test("gemini: request shape and two-step tool loop with thought signature passthrough", async () => {
  const fcPart = { functionCall: { name: "read_block", args: { slot: 2 } }, thoughtSignature: "SIG_A==" };
  mock(
    json({ candidates: [{ content: { role: "model", parts: [fcPart] }, finishReason: "STOP" }] }),
    json({ candidates: [{ content: { role: "model", parts: [{ text: "Slot 2 is a drive.", thoughtSignature: "SIG_B" }] }, finishReason: "STOP" }] })
  );
  const events = [];
  const agent = new Agent({ provider: "gemini", key: "AIzaKEY", model: "gemini-3.8-flash", system: "You design tones.", tools: toneTools(), onEvent: (e) => events.push(e) });
  const text = await agent.send("What is in slot 2?");
  assert.equal(text, "Slot 2 is a drive.");

  const [c1, c2] = calls;
  assert.equal(c1.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.equal(c1.method, "POST");
  assert.equal(c1.headers["x-goog-api-key"], "AIzaKEY");
  assert.ok(!c1.url.includes("key="));
  assert.deepEqual(c1.body.systemInstruction, { parts: [{ text: "You design tones." }] });
  assert.deepEqual(c1.body.contents, [{ role: "user", parts: [{ text: "What is in slot 2?" }] }]);
  const decls = c1.body.tools[0].functionDeclarations;
  assert.deepEqual(decls.map((d) => d.name), ["read_block", "measure", "explode"]);
  assert.equal(decls[0].parameters.additionalProperties, undefined);
  assert.equal(decls[1].parameters, undefined, "no-arg function omits parameters");

  // model turn replayed verbatim, signature included; function response in a user turn, no id (model gave none)
  assert.deepEqual(c2.body.contents[1], { role: "model", parts: [fcPart] });
  assert.deepEqual(c2.body.contents[2], { role: "user", parts: [{ functionResponse: { name: "read_block", response: { block: "drive", slot: 2 } } }] });

  // generated stable id is kept in the transcript
  const callId = agent.history[1].toolCalls[0].id;
  assert.match(callId, /^gem_/);
  assert.equal(agent.history[2].id, callId);
  assert.deepEqual(events.map((e) => e.type), ["tool_call", "tool_result", "assistant_text", "done"]);
  assert.deepEqual(events[0], { type: "tool_call", id: callId, name: "read_block", args: { slot: 2 } });
});

test("gemini: parallel calls run sequentially; responses grouped with ids; signature only on first call", async () => {
  const parts = [
    { functionCall: { id: "fc1", name: "read_block", args: { slot: 1 } }, thoughtSignature: "SIG_PAR" },
    { functionCall: { id: "fc2", name: "measure", args: {} } },
  ];
  mock(
    json({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }] }),
    json({ candidates: [{ content: { role: "model", parts: [{ text: "done" }] }, finishReason: "STOP" }] })
  );
  const log = [];
  const agent = new Agent({ provider: "gemini", key: "k", model: "gemini-3.8-flash", tools: toneTools(log) });
  await agent.send("go");
  assert.deepEqual(log, ["read:1", "read-end:1", "measure"]);
  const contents = calls[1].body.contents;
  assert.deepEqual(contents[1].parts, parts);
  assert.deepEqual(contents[2], {
    role: "user",
    parts: [
      { functionResponse: { id: "fc1", name: "read_block", response: { block: "drive", slot: 1 } } },
      { functionResponse: { id: "fc2", name: "measure", response: { result: 42 } } },
    ],
  });
});

test("gemini: blocked prompt and finishReason errors", async () => {
  mock(json({ promptFeedback: { blockReason: "SAFETY" } }));
  await assert.rejects(providers.gemini.chat({ key: "k", model: "m", history: [{ role: "user", text: "x" }] }), /prompt blocked: SAFETY/);
  mock(json({ candidates: [{ content: { parts: [] }, finishReason: "MALFORMED_FUNCTION_CALL" }] }));
  await assert.rejects(providers.gemini.chat({ key: "k", model: "m", history: [{ role: "user", text: "x" }] }), /MALFORMED_FUNCTION_CALL/);
});

test("gemini: listModels filters, paginates, ranks; defaultModel prefers stable flash", async () => {
  const m = (name, methods = ["generateContent", "countTokens"]) => ({ name: "models/" + name, supportedGenerationMethods: methods });
  mock(
    json({ models: [m("gemini-3.5-flash-lite"), m("gemini-3.8-flash-tts"), m("text-embedding-004", ["embedContent"]), m("gemini-3.1-pro-preview")], nextPageToken: "p2" }),
    json({ models: [m("gemini-3.8-flash"), m("gemini-4-argon"), m("gemini-3-flash-preview"), m("gemma-3-27b-it"), m("gemini-3.1-flash-image")] })
  );
  const ids = await providers.gemini.listModels("k");
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000");
  assert.equal(calls[1].url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=p2");
  assert.equal(calls[0].headers["x-goog-api-key"], "k");
  assert.deepEqual(ids, ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-3-flash-preview"]);
  assert.equal(providers.gemini.defaultModel(ids), "gemini-3.8-flash");
  assert.equal(providers.gemini.defaultModel(["gemini-3-flash-preview", "gemini-3.5-flash-lite"]), "gemini-3-flash-preview");
  assert.equal(providers.gemini.defaultModel([]), "gemini-3.8-flash");
});

test("gemini: research uses google_search only and parses grounding sources", async () => {
  mock(json({
    candidates: [{
      content: { role: "model", parts: [{ text: "The Anagram has a " }, { text: "multi-block engine." }] },
      groundingMetadata: {
        webSearchQueries: ["darkglass anagram blocks"],
        groundingChunks: [
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "darkglass.com" } },
          { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/def", title: "reddit.com" } },
        ],
      },
    }],
  }));
  const r = await providers.gemini.research("k", "gemini-3.8-flash", "anagram blocks");
  assert.deepEqual(calls[0].body.tools, [{ google_search: {} }]);
  assert.equal(r.text, "The Anagram has a multi-block engine.");
  assert.deepEqual(r.sources, [
    { title: "darkglass.com", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" },
    { title: "reddit.com", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/def" },
  ]);
});

test("gemini: research error mentions paid tier", async () => {
  mock(json({ error: { code: 400, message: "Search Grounding is not supported.", status: "INVALID_ARGUMENT" } }, 400));
  await assert.rejects(providers.gemini.research("k", "gemini-3.5-flash-lite", "q"), /HTTP 400: Search Grounding is not supported\..*paid-tier/);
});

// ------------------------------------------------------------ OpenAI

const reasoningItem = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "gAAAAenc" };

test("openai: Responses request shape and tool loop replays output items", async () => {
  const fc = { type: "function_call", id: "fc_1", call_id: "call_A", name: "read_block", arguments: "{\"slot\":3}", status: "completed" };
  mock(
    json({ id: "resp_1", status: "completed", output: [reasoningItem, fc] }),
    json({ id: "resp_2", status: "completed", output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Slot 3: drive.", annotations: [] }] }] })
  );
  const agent = new Agent({ provider: "openai", key: "sk-test", model: "gpt-6.1-sol", system: "sys", tools: toneTools() });
  const text = await agent.send("slot 3?");
  assert.equal(text, "Slot 3: drive.");
  const [c1, c2] = calls;
  assert.equal(c1.url, "https://api.openai.com/v1/responses");
  assert.equal(c1.headers.authorization, "Bearer sk-test");
  assert.equal(c1.body.model, "gpt-6.1-sol");
  assert.equal(c1.body.instructions, "sys");
  assert.equal(c1.body.store, false);
  assert.deepEqual(c1.body.input, [{ role: "user", content: "slot 3?" }]);
  assert.deepEqual(c1.body.tools[0], { type: "function", name: "read_block", description: "Read a block", parameters: toneTools()[0].parameters, strict: false });
  assert.equal(c1.body.parallel_tool_calls, true);
  assert.deepEqual(c2.body.input, [
    { role: "user", content: "slot 3?" },
    reasoningItem,
    fc,
    { type: "function_call_output", call_id: "call_A", output: "{\"block\":\"drive\",\"slot\":3}" },
  ]);
  assert.equal(agent.history[1].toolCalls[0].id, "call_A");
  assert.deepEqual(agent.history[1].toolCalls[0].args, { slot: 3 });
});

test("openai: parallel tool calls and tool errors", async () => {
  mock(
    json({ status: "completed", output: [
      { type: "function_call", call_id: "c1", name: "explode", arguments: "{}" },
      { type: "function_call", call_id: "c2", name: "nope", arguments: "{}" },
      { type: "function_call", call_id: "c3", name: "measure", arguments: "" },
    ] }),
    json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }] })
  );
  const agent = new Agent({ provider: "openai", key: "k", model: "gpt-6.1-sol", tools: toneTools() });
  await agent.send("x");
  const outs = calls[1].body.input.filter((i) => i.type === "function_call_output");
  assert.deepEqual(outs, [
    { type: "function_call_output", call_id: "c1", output: "{\"error\":\"pedal not connected\"}" },
    { type: "function_call_output", call_id: "c2", output: "{\"error\":\"Unknown tool: nope\"}" },
    { type: "function_call_output", call_id: "c3", output: "42" },
  ]);
});

test("openai: listModels filters chat GPT models; defaultModel", async () => {
  mock(json({ object: "list", data: [
    "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna", "gpt-realtime-mini", "gpt-4o-mini-tts", "text-embedding-3-large", "dall-e-3",
    "gpt-4.1", "gpt-4.1-2025-04-14", "gpt-5.6-terra", "o4-mini", "gpt-image-1", "gpt-5-search-api", "whisper-1",
  ].map((id) => ({ id, object: "model", created: 0, owned_by: "openai" })) }));
  const ids = await providers.openai.listModels("k");
  assert.equal(calls[0].url, "https://api.openai.com/v1/models");
  assert.equal(calls[0].method, "GET");
  assert.deepEqual(ids, ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna", "gpt-5.6-terra", "gpt-4.1", "o4-mini"]);
  assert.equal(providers.openai.defaultModel(ids), "gpt-6.1-sol");
  assert.equal(providers.openai.defaultModel([]), "gpt-6.1-sol");
});

test("openai: research parses sources and citations", async () => {
  mock(json({ status: "completed", output: [
    { type: "web_search_call", id: "ws_1", status: "completed", action: { type: "search", query: "q", sources: [{ type: "url", url: "https://a.example/x" }, { type: "url", url: "https://b.example/y" }] } },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer.", annotations: [{ type: "url_citation", start_index: 0, end_index: 6, url: "https://a.example/x", title: "A page" }] }] },
  ] }));
  const r = await providers.openai.research("k", "gpt-6.1-sol", "q");
  const b = calls[0].body;
  assert.deepEqual(b.tools, [{ type: "web_search" }]);
  assert.deepEqual(b.include, ["web_search_call.action.sources"]);
  assert.equal(b.input, "q");
  assert.equal(r.text, "Answer.");
  assert.deepEqual(r.sources, [{ title: "A page", url: "https://a.example/x" }, { title: "", url: "https://b.example/y" }]);
});

// ------------------------------------------------------------ Anthropic

test("anthropic: request headers/body and tool loop with thinking replay and is_error", async () => {
  const content1 = [
    { type: "thinking", thinking: "check slot", signature: "EqSIG" },
    { type: "text", text: "Checking." },
    { type: "tool_use", id: "toolu_1", name: "read_block", input: { slot: 4 } },
    { type: "tool_use", id: "toolu_2", name: "explode", input: {} },
  ];
  mock(
    json({ id: "msg_1", type: "message", role: "assistant", content: content1, stop_reason: "tool_use" }),
    json({ id: "msg_2", type: "message", role: "assistant", content: [{ type: "text", text: "Drive in 4; pedal offline." }], stop_reason: "end_turn" })
  );
  const events = [];
  const agent = new Agent({ provider: "anthropic", key: "sk-ant", model: "claude-sonnet-5-5", system: "sys", tools: toneTools(), onEvent: (e) => events.push(e) });
  const text = await agent.send("slot 4?");
  assert.equal(text, "Drive in 4; pedal offline.");
  const [c1, c2] = calls;
  assert.equal(c1.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c1.headers["x-api-key"], "sk-ant");
  assert.equal(c1.headers["anthropic-version"], "2023-06-01");
  assert.equal(c1.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(c1.body.model, "claude-sonnet-5-5");
  assert.equal(c1.body.system, "sys");
  assert.ok(c1.body.max_tokens > 0);
  assert.deepEqual(c1.body.tools[1], { name: "measure", description: "Measure the preset", input_schema: { type: "object", properties: {} } });
  assert.deepEqual(c2.body.messages, [
    { role: "user", content: [{ type: "text", text: "slot 4?" }] },
    { role: "assistant", content: content1 },
    { role: "user", content: [
      { type: "tool_result", tool_use_id: "toolu_1", content: "{\"block\":\"drive\",\"slot\":4}" },
      { type: "tool_result", tool_use_id: "toolu_2", content: "{\"error\":\"pedal not connected\"}", is_error: true },
    ] },
  ]);
  assert.deepEqual(events.map((e) => e.type), ["assistant_text", "tool_call", "tool_result", "tool_call", "tool_result", "assistant_text", "done"]);
  assert.deepEqual(events[4].result, { error: "pedal not connected" });
});

test("anthropic: listModels paginates, caches capabilities; research checks support", async () => {
  const model = (id, line, ws = true, lifecycle = "active") => ({ id, line, lifecycle, type: "model", display_name: id, capabilities: { server_tools: { web_search: { supported: ws } } } });
  mock(
    json({ data: [model("claude-opus-5-5", "opus"), model("claude-sonnet-5-5", "sonnet")], has_more: true, last_id: "claude-sonnet-5-5" }),
    json({ data: [model("claude-haiku-4-5", "haiku", false, "deprecated"), model("claude-haiku-5-5", "haiku", false)], has_more: false, last_id: "claude-haiku-5-5" })
  );
  const ids = await providers.anthropic.listModels("k");
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/models?limit=1000");
  assert.equal(calls[1].url, "https://api.anthropic.com/v1/models?limit=1000&after_id=claude-sonnet-5-5");
  assert.equal(calls[0].headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.deepEqual(ids, ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5"]);
  assert.equal(providers.anthropic.defaultModel(ids), "claude-sonnet-5-5");
  mock();
  await assert.rejects(providers.anthropic.research("k", "claude-haiku-5-5", "q"), /does not support the web search tool/);
  assert.equal(calls.length, 0);
});

test("anthropic: research handles pause_turn and collects sources", async () => {
  const paused = [
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "anagram" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [
      { type: "web_search_result", url: "https://darkglass.com/anagram", title: "Anagram", encrypted_content: "E1", page_age: "2025" },
    ] },
  ];
  mock(
    json({ content: paused, stop_reason: "pause_turn" }),
    json({ content: [
      { type: "text", text: "It is a " },
      { type: "text", text: "multi-effects pedal.", citations: [{ type: "web_search_result_location", url: "https://manual.example/p1", title: "Manual", cited_text: "..." }] },
    ], stop_reason: "end_turn" })
  );
  const r = await providers.anthropic.research("k", "claude-sonnet-5-5", "what is the anagram");
  assert.deepEqual(calls[0].body.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
  assert.deepEqual(calls[1].body.messages[1], { role: "assistant", content: paused });
  assert.equal(r.text, "It is a multi-effects pedal.");
  assert.deepEqual(r.sources, [{ title: "Anagram", url: "https://darkglass.com/anagram" }, { title: "Manual", url: "https://manual.example/p1" }]);
});

// ------------------------------------------------------------ errors

test("error mapping", async () => {
  const h = [{ role: "user", text: "x" }];
  mock(json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
  await assert.rejects(providers.anthropic.chat({ key: "k", model: "m", history: h }), (e) => /the key was rejected/.test(e.message) && /invalid x-api-key/.test(e.message) && e.status === 401 && e.kind === "auth");
  mock(json({ error: { message: "forbidden" } }, 403));
  await assert.rejects(providers.openai.chat({ key: "k", model: "m", history: h }), /OpenAI: the key was rejected \(HTTP 403: forbidden\)/);
  mock(json({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }, 400));
  await assert.rejects(providers.gemini.chat({ key: "k", model: "m", history: h }), /Gemini: the key was rejected/);
  mock(json({ error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" } }, 429));
  await assert.rejects(providers.gemini.chat({ key: "k", model: "m", history: h }), (e) => /rate limited \/ quota/.test(e.message) && e.kind === "rate_limit");
  mock(json({ error: { message: "bad schema" } }, 400));
  await assert.rejects(providers.openai.chat({ key: "k", model: "m", history: h }), /OpenAI: request failed \(HTTP 400: bad schema\)/);
  mock(json("<html>oops</html>", 502));
  await assert.rejects(providers.openai.chat({ key: "k", model: "m", history: h }), /server error.*HTTP 502/);
  mock(new TypeError("Failed to fetch"));
  await assert.rejects(providers.anthropic.chat({ key: "k", model: "m", history: h }), /Anthropic: network error \(Failed to fetch\)/);
});

test("agent: chat error emits error + done and rethrows", async () => {
  mock(json({ error: { message: "quota" } }, 429));
  const events = [];
  const agent = new Agent({ provider: "openai", key: "k", model: "m", onEvent: (e) => events.push(e) });
  await assert.rejects(agent.send("hi"), /rate limited/);
  assert.deepEqual(events.map((e) => e.type), ["error", "done"]);
  assert.equal(events[1].stopped, "error");
});

// ------------------------------------------------------------ abort

test("abort during model request: rejects promptly, transcript has no dangling turn", async () => {
  mock("hang");
  const ctl = new AbortController();
  const events = [];
  const agent = new Agent({ provider: "gemini", key: "k", model: "m", tools: toneTools(), onEvent: (e) => events.push(e) });
  const p = agent.send("hi", { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 5);
  await assert.rejects(p, (e) => e.name === "AbortError");
  assert.deepEqual(agent.history, [{ role: "user", text: "hi" }]);
  assert.equal(events.at(-1).stopped, "aborted");
  assert.equal(agent.busy, false);
});

test("abort mid-tools fills cancelled results; next send continues cleanly", async () => {
  const ctl = new AbortController();
  const slow = { name: "slow", description: "", parameters: { type: "object", properties: {} }, run: () => new Promise(() => {}) };
  mock(json({ content: [
    { type: "tool_use", id: "toolu_a", name: "slow", input: {} },
    { type: "tool_use", id: "toolu_b", name: "measure", input: {} },
  ], stop_reason: "tool_use" }));
  const agent = new Agent({ provider: "anthropic", key: "k", model: "m", tools: [slow, ...toneTools()] });
  const p = agent.send("go", { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 10);
  await assert.rejects(p, (e) => e.name === "AbortError");
  assert.deepEqual(agent.history.slice(2), [
    { role: "tool", id: "toolu_a", name: "slow", result: { error: "cancelled" } },
    { role: "tool", id: "toolu_b", name: "measure", result: { error: "cancelled" } },
  ]);
  mock(json({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }));
  assert.equal(await agent.send("try again"), "ok");
  const msgs = calls[0].body.messages;
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs[2].content.map((b) => b.type), ["tool_result", "tool_result", "text"]);
  assert.equal(msgs[2].content[0].is_error, true);
});

test("already-aborted signal does not call the API", async () => {
  mock();
  const ctl = new AbortController();
  ctl.abort();
  const agent = new Agent({ provider: "openai", key: "k", model: "m" });
  await assert.rejects(agent.send("x", { signal: ctl.signal }), (e) => e.name === "AbortError");
  assert.equal(calls.length, 0);
});

// ------------------------------------------------------------ loop limits, budget, persistence

test("maxSteps stops the loop with a consistent transcript", async () => {
  const turn = () => json({ status: "completed", output: [{ type: "function_call", call_id: "c" + Math.random(), name: "measure", arguments: "{}" }] });
  mock(turn(), turn());
  const events = [];
  const agent = new Agent({ provider: "openai", key: "k", model: "m", tools: toneTools(), maxSteps: 2, onEvent: (e) => events.push(e) });
  await agent.send("loop");
  assert.equal(calls.length, 2);
  assert.equal(agent.history.at(-1).role, "tool");
  assert.equal(events.at(-1).stopped, "max_steps");
});

test("context budget: old large tool results omitted in requests only", () => {
  const big = { data: "x".repeat(5000) };
  const history = [{ role: "user", text: "start" }];
  for (let i = 0; i < 5; i++) {
    history.push({ role: "assistant", text: "", toolCalls: [{ id: "t" + i, name: "read_block", args: {} }] });
    history.push({ role: "tool", id: "t" + i, name: "read_block", result: big });
  }
  history.push({ role: "assistant", text: "fin", toolCalls: [] });
  const view = compactHistory(history, { maxChars: 12000, keepTurns: 2, minChars: 100 });
  assert.equal(view.length, history.length);
  const results = view.filter((e) => e.role === "tool").map((e) => typeof e.result === "string");
  assert.deepEqual(results, [true, true, true, false, false]);
  assert.match(view[2].result, /^\[omitted: old read_block result, \d+ chars\]$/);
  assert.equal(history[2].result, big, "stored history untouched");
  assert.equal(compactHistory(history, { maxChars: 1e9 }), history);
});

test("agent JSON round-trip reproduces the same next request and omits the key", async () => {
  const fcPart = { functionCall: { name: "measure", args: {} }, thoughtSignature: "SIG_RT" };
  mock(
    json({ candidates: [{ content: { role: "model", parts: [fcPart] } }] }),
    json({ candidates: [{ content: { role: "model", parts: [{ text: "42 dB" }] } }] })
  );
  const a = new Agent({ provider: "gemini", key: "secret", model: "gemini-3.8-flash", system: "s", tools: toneTools(), maxSteps: 7 });
  await a.send("measure");
  const saved = JSON.stringify(a);
  assert.ok(!saved.includes("secret"));
  const b = Agent.fromJSON(saved, { key: "secret", tools: toneTools() });
  assert.deepEqual(b.history, a.history);
  assert.equal(b.provider, providers.gemini);
  assert.equal(b.model, "gemini-3.8-flash");
  assert.equal(b.system, "s");
  assert.equal(b.maxSteps, 7);

  const reply = json({ candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }] });
  mock(reply);
  await a.send("again");
  const bodyA = calls[0].body;
  mock(reply);
  await b.send("again");
  assert.deepEqual(calls[0].body, bodyA);
  assert.equal(bodyA.contents[1].parts[0].thoughtSignature, "SIG_RT");
  a.reset();
  assert.deepEqual(a.history, []);
});

test("switching provider mid-conversation synthesises foreign turns", async () => {
  mock(
    json({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "measure", args: {} }, thoughtSignature: "S" }] } }] }),
    json({ candidates: [{ content: { role: "model", parts: [{ text: "42" }] } }] })
  );
  const g = new Agent({ provider: "gemini", key: "k", model: "m", tools: toneTools() });
  await g.send("measure");
  const callId = g.history[1].toolCalls[0].id;

  const c = Agent.fromJSON(Object.assign(g.toJSON(), { provider: "anthropic", model: "claude-sonnet-5-5" }), { key: "k", tools: toneTools() });
  mock(json({ content: [{ type: "text", text: "fine" }], stop_reason: "end_turn" }));
  await c.send("thanks");
  const msgs = calls[0].body.messages;
  assert.deepEqual(msgs[1], { role: "assistant", content: [{ type: "tool_use", id: callId, name: "measure", input: {} }] });
  assert.deepEqual(msgs[2].content[0], { type: "tool_result", tool_use_id: callId, content: "42" });

  const o = Agent.fromJSON(c.toJSON(), { provider: "openai", model: "gpt-6.1-sol", key: "k" });
  mock(json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "x" }] }] }));
  await o.send("more");
  const input = calls[0].body.input;
  assert.deepEqual(input[1], { type: "function_call", call_id: callId, name: "measure", arguments: "{}" });
  assert.deepEqual(input[2], { type: "function_call_output", call_id: callId, output: "42" });

  const g2 = Agent.fromJSON(o.toJSON(), { provider: "gemini", model: "m", key: "k" });
  mock(json({ candidates: [{ content: { role: "model", parts: [{ text: "y" }] } }] }));
  await g2.send("last");
  // the original Gemini turn still replays its real signature
  assert.equal(calls[0].body.contents[1].parts[0].thoughtSignature, "S");
});

test("researchTool calls the current provider's research with the agent's config", async () => {
  mock(json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "found", annotations: [] }] }] }));
  const agent = new Agent({ provider: "openai", key: "sk-r", model: "gpt-6.1-sol" });
  const tool = researchTool(agent);
  assert.equal(tool.name, "research");
  assert.deepEqual(tool.parameters.required, ["query"]);
  const r = await tool.run({ query: "anagram firmware" }, {});
  assert.deepEqual(r, { text: "found", sources: [] });
  assert.equal(calls[0].headers.authorization, "Bearer sk-r");
  assert.equal(calls[0].body.tools.length, 1, "no function tools in research");

  mock(json({ candidates: [{ content: { parts: [{ text: "g" }] } }] }));
  const t2 = researchTool(async () => ({ provider: "gemini", key: "gk", model: "gemini-3.8-flash" }));
  assert.equal((await t2.run({ query: "q" })).text, "g");
  assert.equal(calls[0].headers["x-goog-api-key"], "gk");
  assert.deepEqual(await t2.run({}), { error: "query is required" });
});

test("research as an agent tool inside a loop", async () => {
  mock(
    json({ content: [{ type: "tool_use", id: "toolu_r", name: "research", input: { query: "bass eq" } }], stop_reason: "tool_use" }),
    json({ content: [{ type: "text", text: "EQ info" }], stop_reason: "end_turn" }),
    json({ content: [{ type: "text", text: "Use a low shelf." }], stop_reason: "end_turn" })
  );
  const agent = new Agent({ provider: "anthropic", key: "k", model: "claude-sonnet-5-5" });
  agent.tools = [researchTool(agent)];
  assert.equal(await agent.send("eq?"), "Use a low shelf.");
  assert.equal(calls[1].body.tools[0].type, "web_search_20250305");
  assert.deepEqual(clone(agent.history[2].result), { text: "EQ info", sources: [] });
});
