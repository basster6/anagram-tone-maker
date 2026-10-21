// Parity of web/js/blocks.js validate() with tools/validate.py on the example
// presets and on deliberately broken documents. Run: node web/test/blocks.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const root = new URL("../..", import.meta.url).pathname;
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["web/data/blocks-factory.js", "web/js/blocks.js"]) vm.runInContext(readFileSync(root + f, "utf8"), ctx);
const B = ctx.AT.blocks;

const examples = ["1.json", "2.json", "13.json", "41.json"].map(n => JSON.parse(readFileSync(`${root}reference/examples/${n}`, "utf8")));
const broken = JSON.parse(JSON.stringify(examples[3]));
const row = broken.preset.chains["1"].blocks;
const first = Object.values(row)[0];
first.parameters["1"].value = 9999;
first.quickpot = "nope";
broken.preset.scene = 7;
broken.preset.bindings = { "exp.pedal": { parameters: [{ row: 1, block: 12, symbol: "x" }] }, "pot9": { parameters: [] } };
const docs = [...examples, broken, { type: "x", version: 2, preset: {} }, []];

const py = execFileSync("python3", ["-c", `
import json, sys
sys.path.insert(0, "tools")
from validate import validate, load_blocks
blocks = load_blocks(("factory",))
docs = json.load(sys.stdin)
print(json.dumps([[ [i.severity, i.where] for i in validate(d, blocks)] for d in docs]))
`], { cwd: root, input: JSON.stringify(docs) }).toString();
const expected = JSON.parse(py);
let failed = 0;
docs.forEach((d, i) => {
  const got = B.validate(d, B.catalog.factory).map(x => [x.severity, x.where]);
  const a = JSON.stringify(got.sort()), b = JSON.stringify(expected[i].sort());
  if (a !== b) { failed++; console.log(`doc ${i}: MISMATCH\n  js: ${a}\n  py: ${b}`); }
  else console.log(`doc ${i}: ok (${got.length} issues)`);
});
console.log(failed ? `${failed} mismatch(es)` : "all match");
process.exit(failed ? 1 : 0);
