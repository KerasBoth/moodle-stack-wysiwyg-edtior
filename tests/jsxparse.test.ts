import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { generateJsx, newElement, newModel, type JsxModel } from "../lib/stack/jsxbuilder.ts";
import { parseJsxBlock } from "../lib/stack/jsxparse.ts";
import { parseQuiz } from "../lib/stack/xml.ts";

/** Modell ohne IDs (die werden beim Einlesen neu vergeben). */
const shape = (m: JsxModel) => JSON.parse(JSON.stringify(m, (k, v) => (k === "id" ? undefined : v)));
/** Blockinhalt als ausführbares JavaScript (CAS-Platzhalter durch Zahlen ersetzt). */
const asJs = (code: string) => code.replace(/^\[\[jsxgraph[^\]]*\]\]/, "").replace(/\[\[\/jsxgraph\]\]$/, "").replace(/\{#[^#]*#\}/g, "2");

function sampleModel(): JsxModel {
  const m = newModel();
  const a = newElement(m, "slider"); m.elements.push(a);
  const A = newElement(m, "point"); m.elements.push(A);
  const B = newElement(m, "point"); m.elements.push(B);
  const f = newElement(m, "function"); m.elements.push(f);
  const s = newElement(m, "line"); m.elements.push(s);
  const t = newElement(m, "text"); m.elements.push(t);
  if (a.kind !== "slider" || A.kind !== "point" || B.kind !== "point" || f.kind !== "function" || t.kind !== "text") throw new Error();
  a.input = "ans2"; a.label = "Steigung";
  A.input = "ans1"; A.snap = "0.5"; A.fixed = false; A.showLabel = false;
  B.x = "a"; B.y = "{#c#}+1";
  f.term = "a*(x-A_x)^2+sin(x)/2-{#d#}"; f.dx = "1"; f.dy = "-2"; f.dashed = true; f.from = "-3";
  t.text = "Punkt's Lage";
  m.grid = true;
  return m;
}

test("round trip: editor graph → code → editor graph gives the same code", () => {
  const m = sampleModel();
  const code = generateJsx(m).code;
  const r = parseJsxBlock(code);
  assert.ok(r.ok, !r.ok ? r.error : "");
  if (!r.ok) return;
  assert.equal(r.custom, 0);
  assert.equal(generateJsx(r.model).code.replace(/\/\* stack-editor:jsx [^*]+\*\//, ""), code.replace(/\/\* stack-editor:jsx [^*]+\*\//, ""));
  assert.deepEqual(shape(r.model).elements.map((e: { kind: string; name: string }) => [e.kind, e.name]), shape(m).elements.map((e: { kind: string; name: string }) => [e.kind, e.name]));
  const f = r.model.elements.find((e) => e.kind === "function");
  assert.equal(f?.kind === "function" && [f.dx, f.dy, f.dashed, f.from].join("|"), "1|-2|true|-3");
});

test("changes made by hand in the code are read back", () => {
  const code = generateJsx(sampleModel()).code
    .replace("[(-3), 1, 3]]", "[(-5), 2, 10]]")              // Regler a: Bereich und Start
    .replace("grid: true", "grid: false")
    .replace(/var A = board\.create\('point', \[[^\]]*\]/, "var A = board.create('point', [4, -1]");
  const r = parseJsxBlock(code);
  assert.ok(r.ok);
  if (!r.ok) return;
  const a = r.model.elements.find((e) => e.name === "a");
  const A = r.model.elements.find((e) => e.name === "A");
  assert.equal(a?.kind === "slider" && `${a.min} ${a.start} ${a.max}`, "-5 2 10");
  assert.equal(A?.kind === "point" && `${A.x} ${A.y} ${A.input}`, "4 -1 ans1");
  assert.equal(r.model.grid, false);
});

test("hand-written graph of the sample question: known parts become elements, the rest stays as code", () => {
  const src = readFileSync(`xml/${readdirSync("xml").find((x) => x.endsWith(".xml"))!}`, "utf8");
  const it = parseQuiz(src).items[0];
  if (it.kind !== "stack") throw new Error();
  const text = it.q.texts.questiontext.text;
  const block = /\[\[jsxgraph[\s\S]*?\[\[\/jsxgraph\]\]/.exec(text)![0];
  const r = parseJsxBlock(block);
  assert.ok(r.ok, !r.ok ? r.error : "");
  if (!r.ok) return;
  const kinds = r.model.elements.map((e) => `${e.kind}:${e.name}`);
  assert.ok(kinds.includes("slider:a") && kinds.includes("slider:b"), kinds.join(", "));
  const curve = r.model.elements.find((e) => e.name === "curve");
  assert.equal(curve?.kind === "function" && curve.term, "{#vorf#}*(x + a)^{#expo#} + b");
  // pq (unsichtbar, mit parseFloat) und unsuspendUpdate bleiben als eigener Code – samt Bindung an ans8
  const code = r.model.elements.filter((e) => e.kind === "code").map((e) => (e.kind === "code" ? e.code : "")).join("\n");
  assert.match(code, /var pq = board\.create\('point'/);
  assert.match(code, /stack_jxg\.bind_point\(ans8Ref,pq\)/);
  assert.match(code, /board\.unsuspendUpdate\(\)/);
  assert.match(code, /boundingbox:\[left, top, right, bottom\]/); // Kommentar bleibt erhalten
  assert.deepEqual(r.model.extraRefs, [{ input: "ans8", ref: "ans8Ref" }]);
  assert.deepEqual(r.model.bbox, ["-10", "10", "10", "-10"]);
  assert.equal(r.model.grid, true);
  // neu erzeugter Code: gültiges JavaScript, Bindung im Kopf, Platzhalter unverändert
  const out = generateJsx(r.model).code;
  assert.match(out, /^\[\[jsxgraph width="500px" height="400px" input-ref-ans8="ans8Ref"\]\]/);
  assert.match(out, /\{#vorf#\}/);
  assert.doesNotThrow(() => new Function("divid", "JXG", "stack_jxg", "ans8Ref", asJs(out)));
  // und lässt sich erneut einlesen, ohne sich zu verändern
  const again = parseJsxBlock(out);
  assert.ok(again.ok);
  if (again.ok) assert.equal(generateJsx(again.model).code.replace(/\/\*[^*]*stack-editor[^*]*\*\//, ""), out.replace(/\/\*[^*]*stack-editor[^*]*\*\//, ""));
});

test("every existing graph can be opened: unreadable code stays as own code", () => {
  const broken = parseJsxBlock('[[jsxgraph width="300px" input-ref-ans1="r1"]]var x = ;[[/jsxgraph]]');
  assert.ok(broken.ok && broken.note && /nicht analysieren/.test(broken.note));
  if (broken.ok) {
    assert.deepEqual(broken.model.elements.map((e) => e.kind), ["code"]);
    const out = generateJsx(broken.model).code;
    assert.match(out, /^\[\[jsxgraph width="300px" height="400px" input-ref-ans1="r1"\]\]/);
    assert.match(out, /var x = ;/); // unverändert übernommen
    assert.doesNotMatch(out, /initBoard/); // keine zusätzliche Zeichenfläche
  }
  const noBoard = parseJsxBlock("[[jsxgraph]]var b = 1;[[/jsxgraph]]");
  assert.ok(noBoard.ok && /initBoard/.test(noBoard.note ?? ""));
  if (noBoard.ok) assert.equal(noBoard.model.boardVar, "");
});

test("other board names and initBoard options that are not a form", () => {
  const named = parseJsxBlock(`[[jsxgraph]]
const brd = JXG.JSXGraph.initBoard(divid, {boundingbox: [-4, 4, 4, -4], axis: true});
let P = brd.create('point', [1, 2], {name: 'P'});
[[/jsxgraph]]`);
  assert.ok(named.ok);
  if (named.ok) {
    assert.equal(named.model.boardVar, "brd");
    assert.deepEqual(named.model.elements.map((e) => `${e.kind}:${e.name}`), ["point:P"]);
    const out = generateJsx(named.model).code;
    assert.match(out, /var brd = JXG\.JSXGraph\.initBoard/);
    assert.match(out, /var P = brd\.create\('point', \[1, 2\]/);
    assert.doesNotThrow(() => new Function("divid", "JXG", "stack_jxg", asJs(out)));
  }

  // Bereich aus Variablen: initBoard bleibt als eigener Code an seiner Stelle, Elemente danach sind trotzdem bearbeitbar
  const vars = parseJsxBlock(`[[jsxgraph input-ref-ans1="ans1Ref"]]
var xmin = -{#r#};
var board = JXG.JSXGraph.initBoard(divid, {boundingbox: [xmin, 5, -xmin, -5], axis: true});
var A = board.create('point', [1, 1], {name: 'A'});
stack_jxg.bind_point(ans1Ref, A);
[[/jsxgraph]]`);
  assert.ok(vars.ok);
  if (vars.ok) {
    assert.equal(vars.model.boardInCode, true);
    assert.ok(vars.note && /eigenen Code/.test(vars.note));
    assert.deepEqual(vars.model.elements.map((e) => e.kind), ["code", "point"]);
    const A = vars.model.elements[1];
    assert.equal(A.kind === "point" && A.input, "ans1");
    const out = generateJsx(vars.model).code;
    assert.equal((out.match(/initBoard/g) ?? []).length, 1);
    assert.ok(out.indexOf("var xmin") < out.indexOf("initBoard") && out.indexOf("initBoard") < out.indexOf("var A"));
    assert.match(out, /\{#r#\}/);
    assert.doesNotThrow(() => new Function("divid", "JXG", "stack_jxg", "ans1Ref", asJs(out)));
    // erneut einlesen: stabil
    const again = parseJsxBlock(out);
    assert.ok(again.ok);
    if (again.ok) assert.equal(generateJsx(again.model).code.replace(/\/\*[^*]*stack-editor[^*]*\*\//, ""), out.replace(/\/\*[^*]*stack-editor[^*]*\*\//, ""));
  }
});
