import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { defaultNode, defaultPrt, newQuestion } from "../lib/stack/model.ts";
import { layoutPrt, prtOverview } from "../lib/stack/prtgraph.ts";
import { parseQuiz } from "../lib/stack/xml.ts";

test("overview maps question parts to inputs and PRTs", () => {
  const src = readFileSync(`xml/${readdirSync("xml").find((x) => x.endsWith(".xml"))!}`, "utf8");
  const it = parseQuiz(src).items[0];
  assert.equal(it.kind, "stack");
  if (it.kind !== "stack") return;
  const o = prtOverview(it.q);
  // Reihenfolge wie im Fragetext: a) Definitionsbereich mit ans9 zuerst
  assert.equal(o.inputs[0].name, "ans9");
  assert.match(o.inputs[0].label, /^a\) Definitionsbereich/);
  assert.match(o.inputs.find((i) => i.name === "ans10")!.label, /^b\) Wertebereich/);
  // Unterpunkte bekommen ihre Teilaufgabe vorangestellt, Absätze mit anderer Eingabe werden übersprungen
  assert.equal(o.inputs.find((i) => i.name === "ans3")!.label, "c) Symmetrie › an der Stelle");
  assert.equal(o.inputs.find((i) => i.name === "ans7")!.label, "e) Monotonie");
  assert.doesNotMatch(o.inputs.find((i) => i.name === "ans8")!.label, /board|function|\(\)/);
  assert.deepEqual(o.inputs[0].prts, ["prt9"]);
  assert.equal(o.prts[0].name, "prt9");
  assert.equal(o.edges.length, o.prts.reduce((n, p) => n + p.inputs.length, 0));
});

test("new question: one input, one PRT, one edge", () => {
  const o = prtOverview(newQuestion());
  assert.deepEqual(o.edges, [{ input: "ans1", prt: "prt1" }]);
  // Eingabe steht allein im Absatz: Beschreibung kommt aus dem Absatz davor
  assert.match(o.inputs[0].label, /^Berechnen Sie/);
});

test("tree layout: branches, ends and cross edges", () => {
  const p = defaultPrt("prt1");
  p.nodes.push(defaultNode(1, "prt1"), defaultNode(2, "prt1"));
  p.nodes[0].fields.falsenextnode = "1"; // 1 falsch → 2
  p.nodes[1].fields.truenextnode = "2";
  p.nodes[1].fields.falsenextnode = "0"; // Rückverweis
  const l = layoutPrt(p);
  assert.equal(l.nodes.length, 3);
  assert.ok(l.nodes.every((n) => n.reachable));
  const root = l.nodes.find((n) => n.id === "0")!;
  assert.equal(root.depth, 0);
  assert.equal(l.nodes.find((n) => n.id === "2")!.depth, 2);
  assert.ok(l.edges.some((e) => e.from === "1" && e.to === "0" && e.cross));
  assert.equal(l.ends.find((e) => e.id === "0-true")!.score, "= 1");
  // Kinder liegen links (wahr) und rechts (falsch) vom Elternknoten
  const tEnd = l.ends.find((e) => e.id === "0-true")!;
  const n1 = l.nodes.find((n) => n.id === "1")!;
  assert.ok(tEnd.x < root.x && root.x < n1.x);
});

test("unreachable node is still laid out", () => {
  const p = defaultPrt("prt1");
  p.nodes.push(defaultNode(1, "prt1"));
  const l = layoutPrt(p);
  assert.equal(l.nodes.find((n) => n.id === "1")!.reachable, false);
});
