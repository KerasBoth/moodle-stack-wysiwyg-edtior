import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseStatements, parseExpression } from "../lib/maxima/parser.ts";
import { evaluateQuestionVariables, evaluate, Env, makeCtx } from "../lib/maxima/eval.ts";
import { toMaxima, toTex } from "../lib/maxima/print.ts";

const ev = (s: string, simp = true) => evaluate(parseExpression(s), new Env(), makeCtx(1, simp));
const m = (s: string) => toMaxima(ev(s));
const tex = (s: string) => toTex(ev(s));

test("arithmetic simplification", () => {
  assert.equal(m("1+2*3"), "7");
  assert.equal(m("1/3+1/6"), "1/2");
  assert.equal(m("x+x"), "2*x");
  assert.equal(m("x*x^2"), "x^3");
  assert.equal(m("-2*(x+3)^(-2)+1"), "-2/(x+3)^2+1");
  assert.equal(m("sqrt(12)"), "2*sqrt(3)");
  assert.equal(m("2^10"), "1024");
  assert.equal(m("x - x"), "0");
  assert.equal(m("expand((x+1)^2)"), "x^2+2*x+1");
  assert.equal(m("diff(x^3+2*x,x)"), "3*x^2+2");
  assert.equal(m("x#-3"), "x#-3");
  assert.equal(m("[1,2]*2"), "[2,4]");
});

test("tex output", () => {
  assert.equal(tex("-2*(x+3)^(-2)+1"), String.raw`-\frac{2}{\left(x+3\right)^{2}}+1`);
  assert.equal(tex("x#-3"), String.raw`x\neq -3`);
  assert.equal(tex("1/2*x"), String.raw`\frac{x}{2}`);
  assert.equal(tex("sqrt(x)"), String.raw`\sqrt{x}`);
  assert.equal(tex("-(x+1)"), String.raw`-\left(x+1\right)`);
});

test("control flow and lists", () => {
  assert.equal(m("block([a:2],a^2)"), "4");
  assert.equal(m("makelist(i^2,i,1,4)"), "[1,4,9,16]");
  assert.equal(m("if 3>2 and 1<2 then 1 else 2"), "1");
  assert.equal(m("first(mcq_correct([[a,false],[b,true]]))"), "b");
  assert.equal(m("apply(\"+\",[1,2,3])"), "6");
  assert.equal(m("map(lambda([t],t+1),[1,2])"), "[2,3]");
  assert.equal(m("sum(k,k,1,10)"), "55");
});

test("simp:false keeps structure", () => {
  assert.equal(toMaxima(ev("2+3", false)), "2+3");
});

test("missing semicolon is tolerated", () => {
  const r = parseStatements("a: 1\nb: 2;");
  assert.equal(r.statements.length, 2);
  assert.ok(r.errors.every((e) => e.severity === "info"));
});

test("sample question variables evaluate", () => {
  const dir = "xml";
  const f = readdirSync(dir).find((x) => x.endsWith(".xml"))!;
  const xml = readFileSync(`${dir}/${f}`, "utf8");
  const src = /<questionvariables>\s*<text><!\[CDATA\[([\s\S]*?)\]\]><\/text>/.exec(xml)![1];
  for (const seed of [1, 2, 3, 42, 455498905]) {
    const r = evaluateQuestionVariables(src, seed);
    const errs = r.errors.filter((e) => e.severity === "error");
    assert.deepEqual(errs, [], `seed ${seed}`);
    const names = r.variables.map((v) => v.name);
    for (const n of ["fun", "ta3", "ta6", "ta9", "ta10"]) assert.ok(names.includes(n), n);
  }
});

test("incomplete input yields errors, keeps earlier statements", () => {
  for (const src of ["a: 1;\nb: rand_with_prohib(-3, 3, ", "a: 1;\nb: (", "a: 1;\nif x then", "a:1; b: [1,2"]) {
    const r = parseStatements(src);
    assert.ok(r.errors.some((e) => e.severity === "error"), src);
    assert.equal(r.statements[0].assigns, "a");
    const ev = evaluateQuestionVariables(src, 1);
    assert.ok(ev.variables.some((v) => v.name === "a"));
  }
});
