// Auswertung über einen echten Maxima-Server (goemaxima/MaximaPool, wie in STACK):
// erzeugt das Maxima-Programm und liest die markierte Ausgabe wieder ein. Ohne Netzwerkzugriff, daher testbar.

import { LocalizedError, type Msg } from "../i18n/index.ts";

export interface CasRequest {
  questionvariables: string;
  seed: number;
  simp: boolean;
  /** Namen, deren Wert zurückgegeben werden soll (zusätzlich zu den erkannten Zuweisungen). */
  names?: string[];
  /** Inhalte von {@…@} bzw. {#…#} (ohne Klammern), z. B. "solve(x^2=4,x)" oder "a, simp=false". */
  expressions?: string[];
}

export interface CasVariable { name: string; value: string; tex: string }
// Fehlertexte kommen unverändert vom Maxima-Server (Text); nur der eigene Rückfall ist eine Meldung.
export interface CasExpression { src: string; value: string; tex: string; error?: string | Msg }
export interface CasError { statement: number; source: string; message: string | Msg }

const EVAL_FAILED: Msg = { key: "lib.maxima.evalFailed" };

export interface CasResult {
  variables: CasVariable[];
  expressions: CasExpression[];
  errors: CasError[];
}

const MARK = "STKMARK";

/** Zerlegt Maxima-Code in Anweisungen (Trennung an ; und $ außerhalb von Strings, Kommentaren und Klammern). */
export function splitStatements(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === "\\") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if ((c === ";" || c === "$") && depth === 0) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
  }
  out.push(src.slice(start));
  return out.map((s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").trim()).filter(Boolean);
}

/** Namen, denen auf oberster Ebene ein Wert zugewiesen wird (`a: …`, nicht `f(x) := …`). */
export function assignedNames(statements: string[]): string[] {
  const out: string[] = [];
  for (const s of statements) {
    const m = /^([A-Za-z_%][A-Za-z0-9_]*)\s*:(?!=)/.exec(s);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

const NAME_RE = /^[A-Za-z_%][A-Za-z0-9_]*$/;

/** Maxima-Programm für den Server; jede Anweisung einzeln mit errcatch, Ausgabe zwischen Markierungen. */
export function buildProgram(req: CasRequest): string {
  const statements = splitStatements(req.questionvariables);
  const names = [...new Set([...assignedNames(statements), ...(req.names ?? [])])].filter((n) => NAME_RE.test(n));
  const seed = Math.trunc(Number(req.seed)) || 1;
  const lines: string[] = [
    "display2d:false$",
    "linel:100000$",
    `simp:${req.simp ? "true" : "false"}$`,
    `stack_randseed(${seed})$`,
  ];
  statements.forEach((s, i) => {
    lines.push(`print("${MARK}:S:${i}")$`);
    lines.push(`if errcatch(${s})=[] then print("${MARK}:ERR")$`);
  });
  lines.push(`print("${MARK}:S:END")$`);
  for (const n of names) {
    lines.push(`print("${MARK}:V:${n}")$`, `errcatch(print(string(${n})))$`, `print("${MARK}:T")$`, `errcatch(print(tex1(${n})))$`);
  }
  (req.expressions ?? []).forEach((e, i) => {
    lines.push(
      `print("${MARK}:E:${i}")$`,
      `stkres:errcatch(ev(${e}))$`,
      `if stkres=[] then print("${MARK}:ERR") else (print(string(first(stkres))), print("${MARK}:T"), print(tex1(first(stkres))))$`,
    );
  });
  lines.push(`print("${MARK}:END")$`);
  return lines.join("\n");
}

/** Liest die Server-Ausgabe zu einem mit buildProgram erzeugten Programm. */
export function parseOutput(output: string, req: CasRequest): CasResult {
  const statements = splitStatements(req.questionvariables);
  // Eingabeaufforderungen wie „(%i12)“ entfernen
  const lines = output.replace(/\(%[io]\d+\)/g, "").split(/\r?\n/).map((l) => l.trimEnd());
  type Section = { kind: string; key: string; body: string[] };
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = new RegExp(`^${MARK}:(S|V|E|END)(?::(.*))?$`).exec(line);
    if (m) {
      cur = { kind: m[1], key: m[2] ?? "", body: [] };
      sections.push(cur);
    } else if (cur) {
      cur.body.push(raw);
    }
  }
  if (!sections.some((s) => s.kind === "END")) {
    const tail = output.trim().split(/\r?\n/).slice(-6).join("\n");
    // 502: der Maxima-Server hat keine verwertbare Antwort geliefert
    throw tail
      ? new LocalizedError("lib.maxima.incompleteDetail", { detail: tail }, 502)
      : new LocalizedError("lib.maxima.incomplete", undefined, 502);
  }
  const clean = (body: string[]) => body.map((l) => l.trim()).filter(Boolean);
  const splitT = (body: string[]) => {
    const i = body.findIndex((l) => l.trim() === `${MARK}:T`);
    return i < 0 ? { value: clean(body).join(" "), tex: "" } : { value: clean(body.slice(0, i)).join(" "), tex: clean(body.slice(i + 1)).join(" ") };
  };

  const errors: CasError[] = [];
  const variables: CasVariable[] = [];
  const expressions: CasExpression[] = [];
  for (const s of sections) {
    if (s.kind === "S" && s.key !== "END") {
      const i = Number(s.key);
      const errAt = s.body.findIndex((l) => l.trim() === `${MARK}:ERR`);
      if (errAt >= 0) {
        const message = clean(s.body.slice(0, errAt)).join(" ").replace(/ -- an error\. To debug this try: debugmode\(true\);/, "") || EVAL_FAILED;
        errors.push({ statement: i, source: statements[i] ?? "", message });
      }
    } else if (s.kind === "V") {
      const { value, tex } = splitT(s.body);
      // nicht belegte Namen gibt Maxima unverändert zurück
      if (value && value !== s.key) variables.push({ name: s.key, value, tex });
    } else if (s.kind === "E") {
      const i = Number(s.key);
      const src = req.expressions?.[i] ?? "";
      const errAt = s.body.findIndex((l) => l.trim() === `${MARK}:ERR`);
      if (errAt >= 0) expressions.push({ src, value: "", tex: "", error: clean(s.body.slice(0, errAt)).join(" ") || EVAL_FAILED });
      else expressions.push({ src, ...splitT(s.body) });
    }
  }
  return { variables, expressions, errors };
}

/** Alle {@…@}- und {#…#}-Inhalte eines CASTextes (außerhalb von JSXGraph-Code). */
export function casExpressions(text: string): string[] {
  const plain = text.replace(/\[\[\s*(jsxgraph|javascript|comment|escape)\b[^\]]*\]\][\s\S]*?\[\[\s*\/\1\s*\]\]/gi, " ");
  const out: string[] = [];
  for (const m of plain.matchAll(/\{[@#]([\s\S]*?)[@#]\}/g)) {
    const e = m[1].trim();
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}
