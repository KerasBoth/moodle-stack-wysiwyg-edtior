// Näherungsweise Nachbildung der STACK-Antworttests für die lokale Vorschau.
// Algebraische Äquivalenz wird numerisch an Zufallsstellen geprüft.

import { diff, expand, freeSymbols, numericValue, truth } from "../maxima/eval.ts";
import { equal, key, simplify } from "../maxima/simp.ts";
import { toMaxima } from "../maxima/print.ts";
import { type Expr, isNumeric, isRelation, numValue } from "../maxima/types.ts";

export interface AnswerTestResult {
  result: boolean;
  /** Fehler bei der Ausführung (z. B. fehlende Option) */
  error?: string;
  feedback?: string;
  /** Test wird lokal nur angenähert */
  approximate?: boolean;
}

const SAMPLE_POINTS = 12;

function samplePoints(vars: string[], n: number): Map<string, number>[] {
  // deterministisch, damit die Vorschau stabil bleibt
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, () => new Map(vars.map((v) => [v, rnd() * 4 - 1.7 + (rnd() < 0.3 ? 3 : 0)])));
}

function close(a: number, b: number, tol = 1e-8): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Numerische Gleichheit zweier skalarer Ausdrücke. */
function numericEquiv(a: Expr, b: Expr): boolean | null {
  const vars = [...new Set([...freeSymbols(a), ...freeSymbols(b)])];
  if (!vars.length) {
    const x = numericValue(a), y = numericValue(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    return close(x, y);
  }
  let valid = 0;
  for (const pt of samplePoints(vars, SAMPLE_POINTS)) {
    const x = numericValue(a, pt), y = numericValue(b, pt);
    if (Number.isNaN(x) && Number.isNaN(y)) continue;
    if (Number.isNaN(x) !== Number.isNaN(y)) {
      // unterschiedliche Definitionsbereiche – noch nicht entscheiden
      continue;
    }
    valid++;
    if (!close(x, y, 1e-7)) return false;
  }
  return valid > 0 ? true : null;
}

function relationTruthEquiv(a: Expr, b: Expr): boolean | null {
  const vars = [...new Set([...freeSymbols(a), ...freeSymbols(b)])];
  const evalRel = (r: Expr, pt: Map<string, number>): boolean | null => {
    if (r.k === "op" && (r.op === "and" || r.op === "or" || r.op === "not")) {
      const parts = r.args.map((x) => evalRel(x, pt));
      if (parts.some((p) => p === null)) return null;
      if (r.op === "not") return !parts[0];
      return r.op === "and" ? parts.every(Boolean) : parts.some(Boolean);
    }
    if (r.k !== "op" || !isRelation(r)) return truth(r);
    const l = numericValue(r.args[0], pt), rr = numericValue(r.args[1], pt);
    if (Number.isNaN(l) || Number.isNaN(rr)) return null;
    switch (r.op) {
      case "<": return l < rr;
      case ">": return l > rr;
      case "<=": return l <= rr;
      case ">=": return l >= rr;
      case "=": return close(l, rr);
      case "#": return !close(l, rr);
    }
    return null;
  };
  // Grenzwerte (ganze Zahlen) sind für Ungleichungen entscheidend – mitprüfen
  const pts = samplePoints(vars, 40);
  for (let k = -6; k <= 6; k++) pts.push(new Map(vars.map((v) => [v, k])));
  let valid = 0;
  for (const pt of pts) {
    const x = evalRel(a, pt), y = evalRel(b, pt);
    if (x === null || y === null) continue;
    valid++;
    if (x !== y) return false;
  }
  return valid ? true : null;
}

/** Algebraische Äquivalenz (Näherung von STACKs AlgEquiv). */
export function algEquiv(a: Expr, b: Expr): boolean {
  if (a.k === "list" || b.k === "list") {
    if (a.k !== "list" || b.k !== "list" || a.items.length !== b.items.length) return false;
    return a.items.every((x, i) => algEquiv(x, b.items[i]));
  }
  if (a.k === "set" || b.k === "set") {
    if (a.k !== "set" || b.k !== "set") return false;
    return a.items.every((x) => b.items.some((y) => algEquiv(x, y))) &&
      b.items.every((y) => a.items.some((x) => algEquiv(x, y)));
  }
  if (a.k === "str" || b.k === "str") return a.k === "str" && b.k === "str" && a.v === b.v;
  if (a.k === "bool" || b.k === "bool") return a.k === "bool" && b.k === "bool" && a.v === b.v;
  if (equal(simplify(a), simplify(b))) return true;

  const relA = a.k === "op" && (isRelation(a) || ["and", "or", "not"].includes(a.op));
  const relB = b.k === "op" && (isRelation(b) || ["and", "or", "not"].includes(b.op));
  if (relA || relB) {
    if (!(relA && relB)) return false;
    // Gleichungen: l-r bis auf konstanten Faktor gleich
    if (a.k === "op" && b.k === "op" && a.op === "=" && b.op === "=") {
      return equationEquiv(a, b);
    }
    return relationTruthEquiv(a, b) === true;
  }
  if (a.k === "call" && b.k === "call" && key(a.fn) === "matrix" && key(b.fn) === "matrix") {
    if (a.args.length !== b.args.length) return false;
    return a.args.every((r, i) => algEquiv(r, b.args[i]));
  }
  return numericEquiv(a, b) === true;
}

function equationEquiv(a: Extract<Expr, { k: "op" }>, b: Extract<Expr, { k: "op" }>): boolean {
  const da: Expr = { k: "op", op: "+", args: [a.args[0], { k: "op", op: "*", args: [{ k: "num", n: -1, d: 1 }, a.args[1]] }] };
  const db: Expr = { k: "op", op: "+", args: [b.args[0], { k: "op", op: "*", args: [{ k: "num", n: -1, d: 1 }, b.args[1]] }] };
  const vars = [...new Set([...freeSymbols(da), ...freeSymbols(db)])];
  let ratio: number | null = null;
  let valid = 0;
  for (const pt of samplePoints(vars, SAMPLE_POINTS)) {
    const x = numericValue(da, pt), y = numericValue(db, pt);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) continue;
    if (Math.abs(y) < 1e-12) return false;
    const r = x / y;
    if (ratio === null) ratio = r;
    else if (!close(r, ratio, 1e-6)) return false;
    valid++;
  }
  return valid > 0 && ratio !== 0;
}

function optNumber(opt: Expr | null, def: number): number {
  if (!opt) return def;
  const v = numericValue(opt);
  return Number.isNaN(v) ? def : v;
}

function countSigFigs(s: string): number {
  const t = s.replace(/^[-+]/, "").replace(/e.*$/i, "").replace(".", "");
  return t.replace(/^0+/, "").length;
}

export interface AnswerTestInfo {
  name: string;
  label: string;
  needsOptions: boolean;
  optionHint?: string;
  description: string;
}

export const ANSWER_TESTS: AnswerTestInfo[] = [
  { name: "AlgEquiv", label: "AlgEquiv – algebraisch äquivalent", needsOptions: false, description: "Prüft, ob sa und ta algebraisch äquivalent sind (z. B. (x+1)^2 und x^2+2*x+1). Funktioniert für Ausdrücke, Gleichungen, Ungleichungen, Listen, Mengen und Matrizen." },
  { name: "AlgEquivNouns", label: "AlgEquivNouns – äquivalent, Nomenformen bleiben", needsOptions: false, description: "Wie AlgEquiv, aber nicht ausgewertete Operatoren (z. B. 'diff) werden nicht ausgeführt." },
  { name: "CasEqual", label: "CasEqual – identisch im CAS", needsOptions: false, description: "Prüft, ob die Ausdrücke im CAS (ohne weitere Vereinfachung) identisch sind." },
  { name: "SameType", label: "SameType – gleicher Typ", needsOptions: false, description: "Prüft, ob beide Ausdrücke denselben Typ haben (Liste, Menge, Gleichung, Matrix …)." },
  { name: "SubstEquiv", label: "SubstEquiv – äquivalent bis auf Variablentausch", needsOptions: false, description: "Äquivalent bis auf Umbenennung der Variablen." },
  { name: "SysEquiv", label: "SysEquiv – Gleichungssysteme", needsOptions: false, description: "Vergleicht Listen von Polynomgleichungen auf gleiche Lösungsmengen." },
  { name: "Sets", label: "Sets – Mengenvergleich", needsOptions: false, description: "Vergleicht zwei Mengen und gibt Rückmeldung zu fehlenden/überzähligen Elementen." },
  { name: "EqualComAss", label: "EqualComAss – gleich bis auf Kommutativ-/Assoziativgesetz", needsOptions: false, description: "Gleich, wenn nur Kommutativ- und Assoziativgesetz angewendet werden. Prüft z. B. ob vereinfacht wurde." },
  { name: "EqualComAssRules", label: "EqualComAssRules – mit Zusatzregeln", needsOptions: true, optionHint: "Liste von Regeln, z. B. [ID_TRANS]", description: "Wie EqualComAss, mit zusätzlichen Termersetzungsregeln." },
  { name: "Expanded", label: "Expanded – ausmultipliziert", needsOptions: false, description: "Prüft, ob sa ausmultipliziert ist (ta wird ignoriert)." },
  { name: "FacForm", label: "FacForm – faktorisiert", needsOptions: true, optionHint: "Variable, z. B. x", description: "Prüft, ob sa äquivalent zu ta und faktorisiert ist." },
  { name: "PartFrac", label: "PartFrac – Partialbruchzerlegung", needsOptions: true, optionHint: "Variable, z. B. x", description: "Prüft, ob sa eine Partialbruchzerlegung von ta ist." },
  { name: "CompSquare", label: "CompSquare – quadratische Ergänzung", needsOptions: true, optionHint: "Variable, z. B. x", description: "Prüft, ob sa in Scheitelpunktform vorliegt und äquivalent zu ta ist." },
  { name: "LowestTerms", label: "LowestTerms – gekürzt", needsOptions: false, description: "Prüft, ob alle Brüche in sa vollständig gekürzt sind." },
  { name: "Diff", label: "Diff – Ableitung", needsOptions: true, optionHint: "Variable, z. B. x", description: "Prüft, ob sa die Ableitung ta ist (Äquivalenz)." },
  { name: "Int", label: "Int – Stammfunktion", needsOptions: true, optionHint: "Variable, z. B. x", description: "Prüft, ob sa eine Stammfunktion ist: diff(sa,x) = diff(ta,x). Konstante +c wird geprüft." },
  { name: "GT", label: "GT – größer als", needsOptions: false, description: "Numerisch: sa > ta." },
  { name: "GTE", label: "GTE – größer oder gleich", needsOptions: false, description: "Numerisch: sa ≥ ta." },
  { name: "NumAbsolute", label: "NumAbsolute – absolute Toleranz", needsOptions: true, optionHint: "Toleranz, z. B. 0.05", description: "Numerisch: |sa − ta| ≤ Toleranz (Standard 0.05)." },
  { name: "NumRelative", label: "NumRelative – relative Toleranz", needsOptions: true, optionHint: "Toleranz, z. B. 0.05", description: "Numerisch: |sa − ta| ≤ Toleranz·|ta| (Standard 0.05)." },
  { name: "NumSigFigs", label: "NumSigFigs – signifikante Stellen", needsOptions: true, optionHint: "Anzahl, z. B. 3 oder [3,2]", description: "Prüft Anzahl signifikanter Stellen und Übereinstimmung mit ta." },
  { name: "NumDecPlaces", label: "NumDecPlaces – Nachkommastellen", needsOptions: true, optionHint: "Anzahl, z. B. 2", description: "Prüft, ob sa genau die angegebenen Nachkommastellen hat und mit ta übereinstimmt." },
  { name: "NumDecPlacesWrong", label: "NumDecPlacesWrong – Stellen falsch", needsOptions: true, optionHint: "Anzahl", description: "Erkennt Zahlen mit vertauschten/falschen Ziffern." },
  { name: "SigFigsStrict", label: "SigFigsStrict – exakt n sign. Stellen", needsOptions: true, optionHint: "Anzahl", description: "Prüft nur, ob sa genau n signifikante Stellen hat." },
  { name: "Units", label: "Units – Einheiten", needsOptions: true, optionHint: "sig. Stellen", description: "Vergleicht Zahlen mit Einheiten (stackunits)." },
  { name: "UnitsStrict", label: "UnitsStrict – Einheiten exakt", needsOptions: true, optionHint: "sig. Stellen", description: "Wie Units, ohne Umrechnung von Einheiten." },
  { name: "UnitsAbsolute", label: "UnitsAbsolute", needsOptions: true, optionHint: "Toleranz", description: "Einheiten mit absoluter Toleranz." },
  { name: "UnitsRelative", label: "UnitsRelative", needsOptions: true, optionHint: "Toleranz", description: "Einheiten mit relativer Toleranz." },
  { name: "String", label: "String – exakter Textvergleich", needsOptions: false, description: "Textvergleich der Zeichenketten (Groß-/Kleinschreibung relevant)." },
  { name: "StringSloppy", label: "StringSloppy – toleranter Textvergleich", needsOptions: false, description: "Textvergleich ohne Leerzeichen und Groß-/Kleinschreibung." },
  { name: "SRegExp", label: "SRegExp – regulärer Ausdruck", needsOptions: false, description: "ta ist ein regulärer Ausdruck (als String), der auf sa passen muss." },
  { name: "Levenshtein", label: "Levenshtein – Ähnlichkeit", needsOptions: true, optionHint: "Ähnlichkeit 0..1", description: "Ähnlichkeit von Zeichenketten über die Levenshtein-Distanz." },
  { name: "Validator", label: "Validator – eigene Prüffunktion", needsOptions: true, optionHint: "Funktionsname", description: "Ruft eine eigene Maxima-Funktion zur Prüfung auf." },
  { name: "Equiv", label: "Equiv – Äquivalenzumformungen", needsOptions: false, description: "Prüft eine Kette von Äquivalenzumformungen (Eingabetyp equiv)." },
  { name: "EquivFirst", label: "EquivFirst – Umformungen, erste Zeile", needsOptions: false, description: "Wie Equiv, die erste Zeile muss mit ta übereinstimmen." },
];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function typeOf(e: Expr): string {
  if (e.k === "op" && isRelation(e)) return e.op === "=" ? "equation" : "inequality";
  if (e.k === "call" && key(e.fn) === "matrix") return "matrix";
  if (isNumeric(e) || e.k === "sym" || e.k === "op" || e.k === "call") return "expression";
  return e.k;
}

export function runAnswerTest(
  test: string,
  sa: Expr,
  ta: Expr,
  opt: Expr | null,
  rawSa?: string,
): AnswerTestResult {
  try {
    switch (test) {
      case "AlgEquiv":
      case "AlgEquivNouns":
      case "SubstEquiv":
      case "SysEquiv":
      case "Equiv":
      case "EquivFirst":
        return { result: algEquiv(sa, ta), approximate: test !== "AlgEquiv" };
      case "Sets": {
        const r = algEquiv(sa, ta);
        let feedback: string | undefined;
        if (!r && sa.k === "set" && ta.k === "set") {
          const missing = ta.items.filter((y) => !sa.items.some((x) => algEquiv(x, y)));
          const extra = sa.items.filter((x) => !ta.items.some((y) => algEquiv(x, y)));
          feedback = [
            missing.length ? `Es fehlen ${missing.length} Element(e).` : "",
            extra.length ? `Folgende Elemente sind zu viel: ${extra.map(toMaxima).join(", ")}` : "",
          ].filter(Boolean).join(" ");
        }
        return { result: r, feedback };
      }
      case "CasEqual":
        return { result: equal(sa, ta) };
      case "EqualComAss":
      case "EqualComAssRules":
        return { result: equal(simplify(sa), simplify(ta)) && algEquiv(sa, ta), approximate: true };
      case "SameType":
        return { result: typeOf(sa) === typeOf(ta) };
      case "Expanded":
        return { result: equal(expand(sa), simplify(sa)), approximate: true };
      case "FacForm":
      case "PartFrac":
      case "CompSquare":
      case "LowestTerms":
        return { result: algEquiv(sa, ta), approximate: true };
      case "Diff":
        return { result: algEquiv(sa, ta) };
      case "Int": {
        const v = opt && opt.k === "sym" ? opt.name : "x";
        return { result: algEquiv(diff(sa, v), diff(ta, v)), approximate: true };
      }
      case "GT":
      case "GTE": {
        const x = numericValue(sa), y = numericValue(ta);
        if (Number.isNaN(x) || Number.isNaN(y)) return { result: false, error: "GT/GTE: numerische Werte erforderlich" };
        return { result: test === "GT" ? x > y : x >= y };
      }
      case "NumAbsolute":
      case "UnitsAbsolute": {
        const tol = optNumber(opt, 0.05);
        const x = numericValue(sa), y = numericValue(ta);
        if (Number.isNaN(x)) return { result: false, feedback: "Ihre Antwort ist keine Zahl." };
        return { result: Math.abs(x - y) <= tol + 1e-12 };
      }
      case "NumRelative":
      case "UnitsRelative": {
        const tol = optNumber(opt, 0.05);
        const x = numericValue(sa), y = numericValue(ta);
        if (Number.isNaN(x)) return { result: false, feedback: "Ihre Antwort ist keine Zahl." };
        return { result: Math.abs(x - y) <= tol * Math.abs(y) + 1e-12 };
      }
      case "NumSigFigs":
      case "SigFigsStrict":
      case "Units":
      case "UnitsStrict": {
        const n = opt ? (opt.k === "list" ? numValue(opt.items[0]) : numValue(opt)) : 3;
        const raw = rawSa ?? toMaxima(sa);
        const x = numericValue(sa), y = numericValue(ta);
        const figsOk = countSigFigs(raw) === n || test === "Units" || test === "UnitsStrict";
        if (test === "SigFigsStrict") return { result: countSigFigs(raw) === n };
        const valOk = !Number.isNaN(x) && Number(x.toPrecision(n)) === Number(y.toPrecision(n));
        return {
          result: figsOk && valOk,
          feedback: !figsOk ? `Die Antwort sollte ${n} signifikante Stellen haben.` : undefined,
          approximate: test.startsWith("Units"),
        };
      }
      case "NumDecPlaces":
      case "NumDecPlacesWrong": {
        const n = optNumber(opt, 2);
        const raw = rawSa ?? toMaxima(sa);
        const dp = (raw.split(".")[1] ?? "").replace(/e.*$/i, "").length;
        const x = numericValue(sa), y = numericValue(ta);
        const ok = Math.abs(Number(x.toFixed(n)) - Number(y.toFixed(n))) < 1e-12;
        if (test === "NumDecPlacesWrong") return { result: ok, approximate: true };
        return { result: dp === n && ok, feedback: dp !== n ? `Die Antwort sollte ${n} Nachkommastellen haben.` : undefined };
      }
      case "String": {
        const a = sa.k === "str" ? sa.v : toMaxima(sa), b = ta.k === "str" ? ta.v : toMaxima(ta);
        return { result: a === b };
      }
      case "StringSloppy": {
        const norm = (e: Expr) => (e.k === "str" ? e.v : toMaxima(e)).replace(/\s+/g, "").toLowerCase();
        return { result: norm(sa) === norm(ta) };
      }
      case "SRegExp": {
        const a = sa.k === "str" ? sa.v : toMaxima(sa);
        const pattern = ta.k === "str" ? ta.v : toMaxima(ta);
        return { result: new RegExp(pattern).test(a) };
      }
      case "Levenshtein": {
        const a = sa.k === "str" ? sa.v : toMaxima(sa);
        const targets = ta.k === "list" ? ta.items : [ta];
        const thr = opt ? numericValue(opt.k === "list" ? opt.items[0] : opt) : 0.9;
        const best = Math.max(...targets.map((t) => {
          const b = t.k === "str" ? t.v : toMaxima(t);
          return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
        }));
        return { result: best >= thr, approximate: true };
      }
      default:
        return { result: algEquiv(sa, ta), approximate: true, error: `Antworttest ${test} wird lokal wie AlgEquiv behandelt` };
    }
  } catch (e) {
    return { result: false, error: e instanceof Error ? e.message : String(e) };
  }
}
