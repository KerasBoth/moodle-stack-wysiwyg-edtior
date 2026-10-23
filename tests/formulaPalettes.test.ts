import { test } from "node:test";
import assert from "node:assert/strict";
import { DIFFERENTIAL_SHORTCUTS, PALETTES, matrixLatex } from "../components/editors/formulaPalettes.ts";
import { casToMathLive, mathLiveToCas } from "../lib/editor/formula.ts";
import { LOCALES, type Msg, translateWith } from "../lib/i18n/index.ts";
import { MESSAGES } from "../lib/i18n/messages/index.ts";

test("Gruppen in der Reihenfolge der Spec", () => {
  assert.deepEqual(PALETTES.map((g) => g.label), [
    "formula.groups.roots", "formula.groups.analysis", "formula.groups.matrix", "formula.groups.greek",
    "formula.groups.logic", "formula.groups.functions", "formula.groups.relations", "formula.groups.maxima",
  ]);
  assert.equal(new Set(PALETTES.map((g) => g.id)).size, PALETTES.length);
});

test("Beschriftungen und Tooltips: Schlüssel existieren in allen Sprachen", () => {
  const msgs = PALETTES.flatMap((g) => [{ key: g.label }, ...g.keys.flatMap((k) => [k.label, k.title])])
    .filter((v): v is Msg => typeof v !== "string");
  assert.ok(msgs.length > 80);
  for (const locale of LOCALES) {
    for (const m of msgs) assert.notEqual(translateWith(MESSAGES, locale, m.key), m.key, `${locale}: ${m.key}`);
  }
});

test("matrixLatex: #0 zuerst, sonst #?", () => {
  assert.equal(matrixLatex("pmatrix", 2, 2), String.raw`\begin{pmatrix}#0&#?\\#?&#?\end{pmatrix}`);
  assert.equal(matrixLatex("vmatrix", 1, 3), String.raw`\begin{vmatrix}#0&#?&#?\end{vmatrix}`);
  assert.equal(matrixLatex("bmatrix", 3, 1), String.raw`\begin{bmatrix}#0\\#?\\#?\end{bmatrix}`);
});

test("Tasten: Einfügen, Befehl oder Sonderfunktion, nie ein Kästchen-Konstrukt", () => {
  for (const g of PALETTES) {
    assert.ok(g.keys.length > 0, g.id);
    for (const k of g.keys) {
      assert.ok(k.label && k.title, `${g.id}: ${k.label}`);
      if (k.command) assert.equal(k.latex, "");
      else assert.ok(k.latex, `${g.id}: ${k.label}`);
      // \texttt bzw. \bbox in Kästchenfarbe würde der Rückweg als Kästchen lesen
      if (!k.special) assert.ok(!/\\texttt|\\bbox/.test(k.latex), `${g.id}: ${k.label}`);
    }
  }
});

test("Maxima-Tasten ergeben ein darstellbares Kästchen", () => {
  const keys = PALETTES.find((g) => g.id === "maxima")!.keys;
  assert.deepEqual(keys.map((k) => k.latex), ["{@expr@}", "{#expr#}"]);
  for (const k of keys) {
    assert.equal(k.special, "cas");
    assert.ok(casToMathLive(k.latex));
  }
});

test("Freie Matrizen: Umgebung als latex", () => {
  const free = PALETTES.flatMap((g) => g.keys).filter((k) => k.special === "matrix");
  assert.deepEqual(free.map((k) => k.latex), ["pmatrix", "bmatrix", "vmatrix"]);
});

test("Differential-Kürzel: dx & Co. mit halbem Abstand, nur hinter einem Integranden", () => {
  assert.deepEqual(DIFFERENTIAL_SHORTCUTS.dx, { value: String.raw`\,\mathrm{d}x`, after: "letter+digit+frac+surd+closefence+array" });
  assert.equal(DIFFERENTIAL_SHORTCUTS.dt.value, String.raw`\,\mathrm{d}t`);
  for (const s of Object.values(DIFFERENTIAL_SHORTCUTS)) {
    assert.doesNotMatch(s.after, /nothing|operator|openfence|relop|binop|space/);
    assert.equal(mathLiveToCas(String.raw`\int x^2` + s.value), String.raw`\int x^2` + s.value);
  }
});
