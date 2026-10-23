import { test } from "node:test";
import assert from "node:assert/strict";
import { findJsxBlock, generateJsx, newElement, newModel, readModel, termToJs } from "../lib/stack/jsxbuilder.ts";
import { parseCasText } from "../lib/stack/castext.ts";

test("terms are translated to JavaScript", () => {
  const ctx = { sliders: ["a"], points: ["P"], variable: "x" };
  assert.equal(termToJs("-x^2+3", ctx).js, "((-Math.pow(x, 2)) + 3)");
  assert.equal(termToJs("a*sin(x)", ctx).js, "(a.Value() * Math.sin(x))");
  assert.equal(termToJs("{#vorf#}*(x+a)^{#expo#}", ctx).js, "(({#vorf#}) * Math.pow((x + a.Value()), ({#expo#})))");
  assert.equal(termToJs("P_x/2", ctx).js, "(P.X() / 2)");
  assert.equal(termToJs("%pi", ctx).js, "Math.PI");
  assert.equal(termToJs("3", ctx).dynamic, false);
  assert.equal(termToJs("a+1", ctx).dynamic, true);
  assert.throws(() => termToJs("y+1", ctx), /Unbekannter Name „y“/);
  assert.throws(() => termToJs("solve(x)", ctx), /nicht unterstützt/);
});

test("generated block binds inputs, round-trips the model and is valid JS", () => {
  const m = newModel();
  const a = newElement(m, "slider"); m.elements.push(a);
  const p = newElement(m, "point"); m.elements.push(p);
  const f = newElement(m, "function"); m.elements.push(f);
  if (a.kind !== "slider" || p.kind !== "point" || f.kind !== "function") throw new Error();
  a.input = "ans2";
  p.input = "ans1";
  p.x = "a"; // abhängig vom Regler
  f.term = "a*(x-A_x)^2+{#c#}";
  const r = generateJsx(m);
  assert.deepEqual(r.errors, []);
  assert.match(r.code, /^\[\[jsxgraph width="500px" height="400px" input-ref-ans2="ans2Ref" input-ref-ans1="ans1Ref"\]\]/);
  assert.match(r.code, /stack_jxg\.bind_point\(ans1Ref, A\);/);
  assert.match(r.code, /stack_jxg\.bind_slider\(ans2Ref, a\);/);
  assert.match(r.code, /board\.create\('point', \[function \(\) \{ return a\.Value\(\); \}, 1\]/);
  // Regler vor Punkten, Punkte vor Funktionen
  assert.ok(r.code.indexOf("'slider'") < r.code.indexOf("'point'") && r.code.indexOf("'point'") < r.code.indexOf("'functiongraph'"));
  // Blockinhalt ist gültiges JavaScript (CAS-Platzhalter durch Zahl ersetzt)
  const body = r.code.replace(/^\[\[jsxgraph[^\]]*\]\]/, "").replace(/\[\[\/jsxgraph\]\]$/, "").replace(/\{#c#\}/g, "1");
  assert.doesNotThrow(() => new Function("divid", "JXG", "stack_jxg", "ans1Ref", "ans2Ref", body));
  // STACK-Parser erkennt den Block; Modell lässt sich wieder lesen
  const text = `<p>Vorher</p>\n${r.code}\n<p>Nachher</p>`;
  assert.deepEqual(parseCasText(text).errors, []);
  const found = findJsxBlock(text, text.indexOf("board.create"));
  assert.ok(found);
  assert.deepEqual(found!.model, m);
  assert.equal(text.slice(found!.from, found!.to), r.code);
  assert.equal(findJsxBlock(text, 2), null);
});

test("several objects on one input use bind_list_of; errors are reported", () => {
  const m = newModel();
  const p = newElement(m, "point"); m.elements.push(p);
  const q = newElement(m, "point"); m.elements.push(q);
  if (p.kind !== "point" || q.kind !== "point") throw new Error();
  p.input = q.input = "ans1";
  const l = newElement(m, "line"); m.elements.push(l);
  const t = newElement(m, "text"); m.elements.push(t);
  if (t.kind !== "text") throw new Error();
  t.text = "Punkt's Lage";
  const r = generateJsx(m);
  assert.match(r.code, /stack_jxg\.bind_list_of\(ans1Ref, \[A, B\]\);/);
  assert.match(r.code, /board\.create\('segment', \[A, B\]/);
  assert.match(r.code, /'Punkt\\'s Lage'/);
  q.name = "A";
  q.x = "foo";
  const bad = generateJsx(m);
  assert.ok(bad.errors.some((e) => e.msg.key === "jsx.errors.duplicateName" && e.msg.params?.name === "A"));
  assert.ok(bad.errors.some((e) => e.field === "x"));
});

test("unknown or foreign blocks have no model", () => {
  assert.equal(readModel("var board = JXG.JSXGraph.initBoard(divid, {});"), null);
  assert.equal(readModel("/* stack-editor:jsx kaputt!! */"), null);
});

test("shifted function graph", () => {
  const m = newModel();
  const f = newElement(m, "function"); m.elements.push(f);
  if (f.kind !== "function") throw new Error();
  assert.match(generateJsx(m).code, /function \(x\) \{ return Math\.pow\(x, 2\); \}/);
  f.dx = "1"; f.dy = "-2";
  const code = generateJsx(m).code;
  assert.match(code, /function \(x\) \{ x = x - 1; return Math\.pow\(x, 2\) \+ \(-2\); \}/);
  const fn = new Function(`return ${/\[(function \(x\)[^\]]*?\})\]/.exec(code)![1]};`)();
  assert.equal(fn(1), -2);
  assert.equal(fn(3), 2);
  // ältere Modelle ohne dx/dy bleiben gültig
  delete f.dx; delete f.dy;
  assert.deepEqual(generateJsx(m).errors, []);
});

test("element order is kept; a slider needed earlier is moved in front", () => {
  const m = newModel();
  const code = newElement(m, "code"); m.elements.push(code);
  const p = newElement(m, "point"); m.elements.push(p);
  const s = newElement(m, "slider"); m.elements.push(s);
  if (code.kind !== "code" || p.kind !== "point" || s.kind !== "slider") throw new Error();
  code.code = "// Kommentar zuerst";
  p.x = s.name; // Punkt hängt vom (später angelegten) Regler ab
  s.color = ""; // Standardfarbe: keine Farbattribute
  const out = generateJsx(m).code;
  const iComment = out.indexOf("// Kommentar zuerst"), iSlider = out.indexOf("'slider'"), iPoint = out.indexOf("'point'");
  assert.ok(iComment < iSlider && iSlider < iPoint, out);
  assert.doesNotMatch(out.split("\n").find((l) => l.includes("'slider'"))!, /strokeColor/);
});
