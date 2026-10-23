// Näherungsweise Nachbildung der STACK-Antworttests für die lokale Vorschau.
// Algebraische Äquivalenz wird numerisch an Zufallsstellen geprüft.

import { diff, expand, freeSymbols, numericValue, truth } from "../maxima/eval.ts";
import { equal, key, simplify } from "../maxima/simp.ts";
import { toMaxima } from "../maxima/print.ts";
import { type Expr, isNumeric, isRelation, numValue } from "../maxima/types.ts";
import { type MessageKey, type Msg, type Translator, errorMsg } from "../i18n/index.ts";

export interface AnswerTestResult {
  result: boolean;
  /** Fehler bei der Ausführung (z. B. fehlende Option); die Oberfläche übersetzt ihn. */
  error?: Msg;
  /** Rückmeldung des Antworttests für die Vorschau; die Oberfläche übersetzt sie. */
  feedback?: Msg;
  /** Test wird lokal nur angenähert */
  approximate?: boolean;
}

const SAMPLE_POINTS = 12;

const NOT_A_NUMBER: Msg = { key: "lib.answertest.notANumber" };

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

// Kurzbeschreibung, Beschreibung und Hinweis zur Testoption liegen unter `reference.answerTests.<name>`
// in lib/i18n/messages; `name` geht unverändert ins XML.
export interface AnswerTestInfo {
  name: string;
  needsOptions: boolean;
}

const at = (name: string, needsOptions = false): AnswerTestInfo => ({ name, needsOptions });

export const ANSWER_TESTS: AnswerTestInfo[] = [
  at("AlgEquiv"),
  at("AlgEquivNouns"),
  at("CasEqual"),
  at("SameType"),
  at("SubstEquiv"),
  at("SysEquiv"),
  at("Sets"),
  at("EqualComAss"),
  at("EqualComAssRules", true),
  at("Expanded"),
  at("FacForm", true),
  at("PartFrac", true),
  at("CompSquare", true),
  at("LowestTerms"),
  at("Diff", true),
  at("Int", true),
  at("GT"),
  at("GTE"),
  at("NumAbsolute", true),
  at("NumRelative", true),
  at("NumSigFigs", true),
  at("NumDecPlaces", true),
  at("NumDecPlacesWrong", true),
  at("SigFigsStrict", true),
  at("Units", true),
  at("UnitsStrict", true),
  at("UnitsAbsolute", true),
  at("UnitsRelative", true),
  at("String"),
  at("StringSloppy"),
  at("SRegExp"),
  at("Levenshtein", true),
  at("Validator", true),
  at("Equiv"),
  at("EquivFirst"),
];

/** Beschriftung („Name – Kurzbeschreibung“), Beschreibung und Hinweis zur Testoption in der Sprache von `t`. */
export function answerTestText(a: AnswerTestInfo, t: Translator): { label: string; description: string; optionHint?: string } {
  const k = `reference.answerTests.${a.name}` as const;
  return {
    label: `${a.name} – ${t(`${k}.short` as MessageKey)}`,
    description: t(`${k}.description` as MessageKey),
    optionHint: a.needsOptions ? t(`${k}.optionHint` as MessageKey) : undefined,
  };
}

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
        let feedback: Msg | undefined;
        if (!r && sa.k === "set" && ta.k === "set") {
          const missing = ta.items.filter((y) => !sa.items.some((x) => algEquiv(x, y)));
          const extra = sa.items.filter((x) => !ta.items.some((y) => algEquiv(x, y)));
          const parts: Msg[] = [];
          if (missing.length) parts.push({ key: "lib.answertest.missingElements", params: { count: missing.length } });
          if (extra.length) parts.push({ key: "lib.answertest.extraElements", params: { items: extra.map(toMaxima).join(", ") } });
          feedback = parts.length === 2 ? { key: "lib.answertest.both", params: { first: parts[0], second: parts[1] } } : parts[0];
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
        if (Number.isNaN(x) || Number.isNaN(y)) return { result: false, error: { key: "lib.answertest.numericRequired" } };
        return { result: test === "GT" ? x > y : x >= y };
      }
      case "NumAbsolute":
      case "UnitsAbsolute": {
        const tol = optNumber(opt, 0.05);
        const x = numericValue(sa), y = numericValue(ta);
        if (Number.isNaN(x)) return { result: false, feedback: NOT_A_NUMBER };
        return { result: Math.abs(x - y) <= tol + 1e-12 };
      }
      case "NumRelative":
      case "UnitsRelative": {
        const tol = optNumber(opt, 0.05);
        const x = numericValue(sa), y = numericValue(ta);
        if (Number.isNaN(x)) return { result: false, feedback: NOT_A_NUMBER };
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
          feedback: !figsOk ? { key: "lib.answertest.sigFigs", params: { n } } : undefined,
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
        return { result: dp === n && ok, feedback: dp !== n ? { key: "lib.answertest.decimalPlaces", params: { n } } : undefined };
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
        return { result: algEquiv(sa, ta), approximate: true, error: { key: "lib.answertest.treatedAsAlgEquiv", params: { test } } };
    }
  } catch (e) {
    return { result: false, error: errorMsg(e) };
  }
}
