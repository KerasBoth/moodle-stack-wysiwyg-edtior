import { test } from "node:test";
import assert from "node:assert/strict";
import { assignedNames, buildProgram, casExpressions, parseOutput, splitStatements } from "../lib/stack/maximaprogram.ts";
import { buildPreview } from "../lib/stack/preview.ts";
import { newQuestion } from "../lib/stack/model.ts";

test("statements are split outside strings, comments and brackets", () => {
  const st = splitStatements('a: 1;\nb: "x;y"$ /* c; d */ f(x) := block([t:1], t+x);\nl: [1,2];');
  assert.deepEqual(st, ["a: 1", 'b: "x;y"', "f(x) := block([t:1], t+x)", "l: [1,2]"]);
  assert.deepEqual(assignedNames(st), ["a", "b", "l"]);
});

test("program uses seed, simp and errcatch per statement", () => {
  const p = buildProgram({ questionvariables: "a: rand(5); b: solve(x^2=a, x);", seed: 42, simp: false, expressions: ["b"] });
  assert.match(p, /stack_randseed\(42\)\$/);
  assert.match(p, /simp:false\$/);
  assert.match(p, /if errcatch\(a: rand\(5\)\)=\[\] then print\("STKMARK:ERR"\)\$/);
  assert.match(p, /errcatch\(print\(tex1\(b\)\)\)\$/);
  assert.match(p, /stkres:errcatch\(ev\(b\)\)\$/);
});

test("server output is parsed into values, LaTeX and errors", () => {
  const req = { questionvariables: "a: 2; bad: 1/0; l: solve(x^2=a,x);", seed: 1, simp: true, expressions: ["l", "1/0"] };
  const out = [
    "(%i5) ", "STKMARK:S:0 ", "STKMARK:S:1 ", "expt: undefined: 0 to a negative exponent.", "STKMARK:ERR ", "STKMARK:S:2 ", "STKMARK:S:END ",
    "STKMARK:V:a ", "2 ", "STKMARK:T ", "2 ",
    "STKMARK:V:bad ", "bad ", "STKMARK:T ", "bad ",
    "STKMARK:V:l ", "[x = -sqrt(2),x = sqrt(2)] ", "STKMARK:T ", "\left[ x=-\sqrt{2} , x=\sqrt{2} \right] ",
    "STKMARK:E:0 ", "[x = -sqrt(2),x = sqrt(2)] ", "STKMARK:T ", "\left[ x=-\sqrt{2} , x=\sqrt{2} \right] ",
    "STKMARK:E:1 ", "expt: undefined: 0 to a negative exponent.", "STKMARK:ERR ",
    "STKMARK:END ", "(%i20) ",
  ].join("\n");
  const r = parseOutput(out, req);
  assert.deepEqual(r.variables.map((v) => v.name), ["a", "l"]); // „bad“ ist nicht belegt
  assert.equal(r.variables[1].tex, "\left[ x=-\sqrt{2} , x=\sqrt{2} \right]");
  assert.deepEqual(r.errors, [{ statement: 1, source: "bad: 1/0", message: "expt: undefined: 0 to a negative exponent." }]);
  assert.equal(r.expressions[1].error, "expt: undefined: 0 to a negative exponent.");
  assert.throws(() => parseOutput("(%i1) maxima died", req), /Unvollständige Antwort/);
});

test("preview uses Maxima values and LaTeX when given", () => {
  const q = newQuestion();
  q.questionvariables = "a: 2; l: solve(x^2=a,x);";
  q.texts.questiontext.text = "<p>Lösungen: {@l@}, a = {#a#}</p>";
  const local = buildPreview(q, 1);
  assert.equal(local.cas, "local");
  assert.equal(local.needsMaxima, true);
  const cas = {
    variables: [{ name: "a", value: "2", tex: "2" }, { name: "l", value: "[x = -sqrt(2),x = sqrt(2)]", tex: "\left[ x=-\sqrt{2} \right]" }],
    expressions: [{ src: "l", value: "[x = -sqrt(2),x = sqrt(2)]", tex: "TEXFROMMAXIMA" }, { src: "a", value: "2", tex: "2" }],
    errors: [],
  };
  const b = buildPreview(q, 1, cas);
  assert.equal(b.cas, "maxima");
  assert.ok(b.questionHtml.includes(String.raw`\(TEXFROMMAXIMA\)`), b.questionHtml);
  assert.match(b.questionHtml, /a = 2/);
  assert.equal(b.vars.variables.find((v) => v.name === "l")?.value.k, "list");
  assert.ok(!b.issues.some((i) => /nicht ausgewertet/.test(i.message)));
  assert.deepEqual(casExpressions('{@l@} [[jsxgraph]]var x = {#a#};[[/jsxgraph]] {#a#} {@l@}'), ["l", "a"]);
});
