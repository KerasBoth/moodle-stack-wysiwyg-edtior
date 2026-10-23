// Das Moodle-XML hängt nicht von der Sprache der Oberfläche ab.
//
// Mechanismus: `translate` ist eine reine Funktion ohne globale Sprache. Sprachabhängig ist im Editor nur
// der globale Übersetzer der Code-Editoren (`editorContext.t`) und die Übersetzung der Vorschau-Meldungen
// (`localizeHtml`). Der Test schaltet beides je Sprache um, baut die Vorschau (damit alle übersetzenden
// Bibliothekspfade laufen) und erzeugt dann das XML. Zusätzlich prüft er statisch, dass der XML-Pfad
// (xml.ts, model.ts samt allen Importen) weder `translate` noch die Übersetzungen der Fremdsprachen lädt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LOCALES, type Locale, type MessageKey, type Msg, type Params, germanT } from "../lib/i18n/index.ts";
import { translate } from "../lib/i18n/translate.ts";
import { editorContext } from "../lib/editor/context.ts";
import { type Quiz, newQuestion } from "../lib/stack/model.ts";
import { buildPreview } from "../lib/stack/preview.ts";
import { localizeHtml } from "../lib/stack/msghtml.ts";
import { parseQuiz, writeQuiz } from "../lib/stack/xml.ts";

const sampleFile = `xml/${readdirSync("xml").find((x) => x.endsWith(".xml"))!}`;
const sample = readFileSync(sampleFile, "utf8");

function translatorFor(locale: Locale) {
  return (key: MessageKey | Msg, params?: Params) =>
    typeof key === "string" ? translate(locale, key, params) : translate(locale, key.key, key.params ?? params);
}

/** XML einer Aufgabe, nachdem die Vorschau in der Sprache gebaut und übersetzt wurde. */
function xmlIn(locale: Locale | null, quiz: () => Quiz): string {
  const t = locale ? translatorFor(locale) : germanT;
  editorContext.t = t;
  try {
    const qz = quiz();
    for (const it of qz.items) {
      if (it.kind !== "stack") continue;
      const b = buildPreview(it.q, 1);
      // Übersetzte Vorschau darf nichts am Modell ändern
      localizeHtml(b.questionHtml, t);
      for (const i of b.issues) t(i.message);
    }
    return writeQuiz(qz);
  } finally {
    editorContext.t = germanT;
  }
}

const cases: [string, () => Quiz][] = [
  ["neue Aufgabe", () => ({ items: [{ kind: "stack", q: newQuestion() }] })],
  [sampleFile, () => parseQuiz(sample)],
];

for (const [name, quiz] of cases) {
  test(`XML ist in allen Sprachen byte-gleich: ${name}`, () => {
    const baseline = writeQuiz(quiz()); // ohne jede i18n-Beteiligung
    assert.equal(xmlIn(null, quiz), baseline);
    for (const locale of LOCALES) assert.equal(xmlIn(locale, quiz), baseline, locale);
  });
}

test("Übersetzer wirkt: Vorschau-Meldungen unterscheiden sich je Sprache", () => {
  const q = newQuestion();
  q.questionvariables = "a: 1/;";
  const b = buildPreview(q, 1);
  const err = b.issues.find((i) => i.severity === "error");
  assert.ok(err, "Syntaxfehler erwartet");
  assert.notEqual(translatorFor("en")(err.message), translatorFor("de")(err.message));
});

// Alle relativen Importe einer Datei, rekursiv
function importClosure(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+"(\.[^"]+)"/gms)) {
    importClosure(resolve(dirname(file), m[1]), seen);
  }
  return seen;
}

test("XML-Pfad lädt weder translate noch fremdsprachige Texte", () => {
  const files = [...importClosure(resolve("lib/stack/xml.ts")), ...importClosure(resolve("lib/stack/model.ts"))]
    .map((f) => f.replace(/\\/g, "/"));
  assert.ok(files.some((f) => f.endsWith("lib/stack/model.ts")));
  const forbidden = files.filter((f) =>
    /lib\/i18n\/(translate|server|loaders)\.ts$/.test(f) ||
    /lib\/i18n\/messages\/index\.ts$/.test(f) ||
    /lib\/i18n\/messages\/(en|fr|es|it|sk)\//.test(f));
  assert.deepEqual(forbidden, []);
});
