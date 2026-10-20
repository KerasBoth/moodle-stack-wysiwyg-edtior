import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseQuiz } from "../lib/stack/xml.ts";
import { buildPreview, evaluateAllPrts, runQuestionTests, validateInput } from "../lib/stack/preview.ts";
import type { StackQuestion } from "../lib/stack/model.ts";

function sample(): StackQuestion {
  const f = readdirSync("xml").find((x) => x.endsWith(".xml"))!;
  const it = parseQuiz(readFileSync(`xml/${f}`, "utf8")).items[0];
  if (it.kind !== "stack") throw new Error();
  return it.q;
}

test("preview renders question text", () => {
  const q = sample();
  const b = buildPreview(q, 455498905);
  assert.ok(b.questionHtml.includes('data-stack-input="ans9"'));
  assert.ok(b.questionHtml.includes("<select"));
  assert.equal(b.jsx.length, 1);
  assert.ok(!b.jsx[0].code.includes("{#"), "jsx substituted");
  assert.deepEqual(b.issues.filter((i) => i.severity === "error"), []);
  assert.ok(!/\{@/.test(b.questionHtml));
});

test("question tests pass for several seeds", () => {
  const q = sample();
  for (const seed of q.deployedseeds.slice(0, 8).map(Number)) {
    const b = buildPreview(q, seed);
    const out = runQuestionTests(q, b);
    for (const o of out) assert.ok(o.passed, `seed ${seed}: ${JSON.stringify(o.rows.filter((r) => !r.passed))}`);
  }
});

test("student answers are validated and graded", () => {
  const q = sample();
  const b = buildPreview(q, 1);
  const quer = b.env.vars.get("quer")!;
  const qv = quer.k === "num" ? quer.n : NaN;
  const v = validateInput(b, "ans9", `x#${-qv}`);
  assert.ok(v.valid, v.html);
  const { prts } = evaluateAllPrts(b, q, { ans9: `x#${-qv}`, ans4: `${-qv}` , ans3: "1000" });
  const p9 = prts.find((p) => p.name === "prt9")!;
  assert.equal(p9.score, 1);
  assert.equal(prts.find((p) => p.name === "prt4")!.score, 1);
  assert.equal(prts.find((p) => p.name === "prt3")!.score, 0);
  assert.ok(!validateInput(b, "ans4", "quer").valid, "teacher var forbidden");
  assert.ok(!validateInput(b, "ans4", "1.5").valid, "float forbidden");
});
