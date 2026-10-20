import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTES, matrixLatex } from "../components/editors/formulaPalettes.ts";
import { casToMathLive } from "../lib/editor/formula.ts";

test("Gruppen in der Reihenfolge der Spec", () => {
  assert.deepEqual(PALETTES.map((g) => g.label), [
    "Wurzeln & Brüche", "Analysis", "Matrizen & Vektoren", "Griechisch", "Logik & Mengen", "Funktionen", "Relationen", "Maxima",
  ]);
  assert.equal(new Set(PALETTES.map((g) => g.id)).size, PALETTES.length);
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
