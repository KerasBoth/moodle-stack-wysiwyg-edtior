import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseQuiz, writeQuiz } from "../lib/stack/xml.ts";

const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "uid" ? undefined : v)));

test("sample XML round-trips without loss", () => {
  const f = readdirSync("xml").find((x) => x.endsWith(".xml"))!;
  const src = readFileSync(`xml/${f}`, "utf8");
  const quiz = parseQuiz(src);
  assert.equal(quiz.items.length, 1);
  const it = quiz.items[0];
  assert.equal(it.kind, "stack");
  if (it.kind !== "stack") return;
  assert.equal(it.q.name, "Kurvendiskussion potenzfunktion (negativ, verschiebung)");
  assert.equal(it.q.inputs.length, 9);
  assert.equal(it.q.prts.length, 9);
  assert.equal(it.q.deployedseeds.length, 26);
  assert.equal(it.q.qtests[0].inputs.length, 7);
  assert.ok(it.q.texts.questiontext.text.includes("[[jsxgraph"));
  assert.ok(it.q.questionvariables.includes("rand_with_prohib"));
  assert.equal(it.q.comment, "question: 153936");
  const again = parseQuiz(writeQuiz(quiz));
  assert.deepEqual(strip(again), strip(quiz));
});
