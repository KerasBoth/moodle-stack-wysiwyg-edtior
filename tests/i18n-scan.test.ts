// Prüftest gegen übersehene deutsche Oberflächentexte.
//
// Liest alle .ts/.tsx unter components/, app/ und lib/ (ohne lib/i18n/messages/ und ohne Testdateien) mit dem
// TypeScript-Parser und meldet Stringliterale, Template-Teile und JSX-Text mit deutschen Sonderzeichen oder
// typischen deutschen Oberflächenwörtern. Kommentare zählen nicht (der Parser liefert sie nicht als Text).
//
// Ausgenommen ist alles, was unter dem Marker „Inhalt (ins XML), nicht übersetzen“ steht: der Marker in einem
// Kommentar vor einer Anweisung, Deklaration, Eigenschaft oder einem Ausdruck nimmt diesen ganzen Block aus; als
// Kommentar am Ende einer Zeile nimmt er die Zeile aus. Dazu kommt die kleine, begründete Erlaubnisliste unten.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "..");
const DIRS = ["components", "app", "lib"];
const SKIP_DIRS = [join("lib", "i18n", "messages")];
const MARKER = "Inhalt (ins XML), nicht übersetzen";
const GERMAN = /[äöüÄÖÜß]|\b(?:Bitte|Fehler|Speichern|Abbrechen|Löschen|nicht|wird)\b/;

/**
 * Erlaubte Funde: Datei (relativ, mit „/“) und der gemeldete Text. Jeder Eintrag mit Begründung.
 */
const ALLOWED: { file: string; text: string; why: string }[] = [
  // Zeichentabelle, kein Text: \ss aus MathLive wird zum Buchstaben ß
  { file: "lib/editor/formula.ts", text: "ß", why: "Zeichen in der Tabelle der Text-Makros" },
  // Ladefehler von MathJax landen nur in der Konsole (VisualEditor zeigt dann den Code, keine Meldung)
  { file: "lib/editor/mathjax.ts", text: "MathJax konnte nicht geladen werden", why: "nur Konsole" },
  { file: "lib/editor/mathjax.ts", text: "MathJax konnte nicht gestartet werden", why: "nur Konsole" },
  // Start des Servers: Protokoll bzw. Abbruch der Migration, nie in der Oberfläche
  { file: "lib/server/db.ts", text: "Migration verletzt Fremdschlüssel (PRAGMA foreign_key_check)", why: "Serverstart" },
  { file: "lib/server/db.ts", text: " übernommen (", why: "Serverprotokoll" },
  { file: "lib/server/db.ts", text: " konnte nicht übernommen werden:", why: "Serverprotokoll" },
  // Interne Gründe von `Unsupported`: werden abgefangen (Abschnitt wird eigener Code) und nie angezeigt
  { file: "lib/stack/jsxparse.ts", text: "nicht abbildbar", why: "intern, nie angezeigt" },
  { file: "lib/stack/jsxparse.ts", text: "Funktionskörper zu komplex", why: "intern, nie angezeigt" },
  { file: "lib/stack/jsxparse.ts", text: "Attribut nicht lesbar", why: "intern, nie angezeigt" },
  { file: "lib/stack/jsxparse.ts", text: "Funktionskörper", why: "intern, nie angezeigt" },
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p);
    if (SKIP_DIRS.some((s) => rel === s || rel.startsWith(s + sep))) continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

type Finding = { file: string; line: number; text: string };

function scan(path: string): Finding[] {
  const src = readFileSync(path, "utf8");
  const file = relative(ROOT, path).split(sep).join("/");
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = src.split(/\r?\n/);
  const found: Finding[] = [];

  /** Kommentare unmittelbar vor dem Knoten enthalten den Marker. */
  const marked = (node: ts.Node) =>
    (ts.getLeadingCommentRanges(src, node.getFullStart()) ?? []).some((r) => src.slice(r.pos, r.end).includes(MARKER));

  const visit = (node: ts.Node, exempt: boolean) => {
    if (exempt || marked(node)) return;
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (ts.isJsxText(node)) text = node.text.trim();
    if (text && GERMAN.test(text)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      if (!lines[line].includes(MARKER)) found.push({ file, line: line + 1, text });
    }
    ts.forEachChild(node, (c) => visit(c, false));
  };
  visit(sf, false);
  return found;
}

test("keine deutschen Oberflächentexte außerhalb der Übersetzungen", () => {
  const findings = DIRS.flatMap((d) => files(join(ROOT, d))).flatMap(scan);
  const unused = ALLOWED.filter((a) => !findings.some((f) => f.file === a.file && f.text === a.text));
  const left = findings.filter((f) => !ALLOWED.some((a) => a.file === f.file && a.text === f.text));
  assert.deepEqual(
    left.map((f) => `${f.file}:${f.line}: ${JSON.stringify(f.text)}`),
    [],
    "Deutsche Texte gefunden – übersetzen (lib/i18n/messages) oder als Inhalt markieren",
  );
  assert.deepEqual(unused.map((a) => `${a.file}: ${JSON.stringify(a.text)}`), [], "Erlaubnisliste enthält veraltete Einträge");
});
