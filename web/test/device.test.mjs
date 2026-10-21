// WebHID framing in web/js/device.js against tools/anagram.py's framing, with a
// fake device. No hardware. Run: node web/test/device.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const root = new URL("../..", import.meta.url).pathname;
const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, crypto: globalThis.crypto, navigator: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(root + "web/js/device.js", "utf8"), ctx);
const D = ctx.AT.device;

// What tools/anagram.py writes for the same call: a list of 64-byte reports.
const action = "fetch_anagram_preset", payload = { filename: "49.json", note: "한글 ✓".repeat(8) };
const py = JSON.parse(execFileSync("python3", ["-c", `
import json, sys
START, END, CHUNK = b"DSTART", b"DEND", 63
action, payload = json.loads(sys.argv[1])
frame = START + json.dumps({"action": action, "payload": payload}).encode() + END
n = (len(frame) + CHUNK - 1) // CHUNK + 1
out = []
for i in range(n):
    buf = bytearray(64); buf[0] = 1
    piece = frame[i*CHUNK:(i+1)*CHUNK]; buf[1:1+len(piece)] = piece
    out.append(list(buf))
print(json.dumps(out))
`, JSON.stringify([action, payload])]).toString());

function fakeDevice(withReportId) {
  const sent = [];
  const reply = new TextEncoder().encode("DSTART" + JSON.stringify({ action, payload: { data: { presetFile: { content: { preset: { name: "X" } } } } } }) + "DEND");
  const dev = {
    vendorId: 0x2fa6, productId: 0x2500, opened: false,
    collections: [{ usagePage: 0xff00, outputReports: [withReportId ? { reportId: 1, items: [{ reportSize: 8, reportCount: 63 }] } : { reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] }] }],
    async open() { this.opened = true; },
    async sendReport(id, data) {
      // what goes on the wire: the report id byte (when used) followed by the data
      sent.push(id ? [id, ...data] : [...data]);
      if (sent.length === py.length) setTimeout(() => {
        for (let i = 0; i < reply.length; i += 63) {
          const chunk = new Uint8Array(withReportId ? 63 : 64);
          if (withReportId) chunk.set(reply.subarray(i, i + 63)); else { chunk[0] = 1; chunk.set(reply.subarray(i, i + 63), 1); }
          this.oninputreport({ data: new DataView(chunk.buffer) });
        }
      }, 5);
    },
  };
  return { dev, sent };
}

let failed = 0;
for (const withId of [false, true]) {
  const { dev, sent } = fakeDevice(withId);
  ctx.navigator.hid = { addEventListener() {}, getDevices: async () => [dev] };
  const a = new D.Anagram();
  if (!(await a.reconnect())) { console.log("could not open fake"); failed++; continue; }
  const reply = await a.call(action, payload);
  const doc = ((reply.data || {}).presetFile || {}).content;
  const same = JSON.stringify(sent) === JSON.stringify(py);
  console.log(`report id ${withId ? "1" : "none"}: wire ${same ? "matches python" : "DIFFERS"}, reply ${doc && doc.preset.name === "X" ? "parsed" : "WRONG"}`);
  if (!same || !doc) failed++;
}
const slots = ["01A", "17A", "42C"].map(s => [s, D.slotFilename(s), D.slotLabel(D.slotFilename(s))]);
console.log("slots", JSON.stringify(slots));
if (slots.some(([a, , b]) => a !== b) || D.slotFilename("17A") !== "49.json") failed++;
console.log(failed ? `${failed} failure(s)` : "all pass");
process.exit(failed ? 1 : 0);
