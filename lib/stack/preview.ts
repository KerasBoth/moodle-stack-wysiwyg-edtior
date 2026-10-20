// Baut die Live-Vorschau einer STACK-Aufgabe und wertet Eingaben/PRTs lokal aus.

import {
  Env, type EvalResult, evaluate, evaluateBlock, evaluateQuestionVariables, makeCtx,
} from "../maxima/eval.ts";
import { parseExpression } from "../maxima/parser.ts";
import { type PrintOptions, defaultPrintOptions, toMaxima, toTex } from "../maxima/print.ts";
import { simplify } from "../maxima/simp.ts";
import { type Expr, callName } from "../maxima/types.ts";
import { runAnswerTest } from "./answertests.ts";
import { type JsxBlock, escapeHtml, findPlaceholders, renderCasText } from "./castext.ts";
import type { Prt, StackInput, StackQuestion } from "./model.ts";
import type { CasResult } from "./maximaprogram.ts";

export type RawAnswer = string | string[] | string[][];

export interface InputInfo {
  name: string;
  type: string;
  boxsize: number;
  tans: Expr | null;
  tansError?: string;
  /** Auswahloptionen für dropdown/radio/checkbox */
  choices?: { value: Expr; correct: boolean; label: string }[];
  matrixSize?: [number, number];
  input: StackInput;
}

export interface Issue {
  severity: "error" | "warning" | "info";
  where: string;
  message: string;
}

export interface PreviewBuild {
  seed: number;
  print: PrintOptions;
  vars: EvalResult;
  env: Env;
  inputs: Record<string, InputInfo>;
  questionHtml: string;
  specificFeedbackHtml: string;
  generalFeedbackHtml: string;
  noteHtml: string;
  jsx: JsxBlock[];
  issues: Issue[];
  /** Herkunft der Werte: lokale Nachbildung oder echter Maxima-Server. */
  cas: "local" | "maxima";
  /** Lokal nicht vollständig berechenbar (nicht unterstützte Funktionen oder Fehler). */
  needsMaxima: boolean;
}

export function printOptionsOf(q: StackQuestion): PrintOptions {
  const s = q.scalars;
  return {
    ...defaultPrintOptions,
    multiplicationsign: s.multiplicationsign || "dot",
    sqrtsign: s.sqrtsign !== "0",
    complexno: s.complexno || "i",
    inversetrig: s.inversetrig || "cos-1",
    logicsymbol: s.logicsymbol || "lang",
    matrixparens: s.matrixparens ?? "[",
    decimals: s.decimals || ".",
  };
}

const TEXT_INPUTS = new Set(["algebraic", "numerical", "units", "singlechar", "string", "varmatrix"]);

function texInline(e: Expr, p: PrintOptions) {
  return `\\(${toTex(e, p)}\\)`;
}

function inputInfo(inp: StackInput, env: Env, p: PrintOptions): InputInfo {
  const f = inp.fields;
  const info: InputInfo = {
    name: f.name,
    type: f.type || "algebraic",
    boxsize: Number(f.boxsize) || 15,
    tans: null,
    input: inp,
  };
  try {
    if (f.tans.trim()) info.tans = evaluate(parseExpression(f.tans), env, makeCtx(1));
  } catch (e) {
    info.tansError = e instanceof Error ? e.message : String(e);
  }
  if (["dropdown", "radio", "checkbox"].includes(info.type) && info.tans) {
    const t = info.tans;
    if (t.k === "list") {
      info.choices = t.items.map((it) => {
        const parts = it.k === "list" ? it.items : [it];
        const value = parts[0];
        const correct = parts[1]?.k === "bool" ? parts[1].v : false;
        const disp = parts[2];
        const label = disp
          ? disp.k === "str" ? escapeHtml(disp.v) : texInline(disp, p)
          : value.k === "str" ? escapeHtml(value.v) : texInline(value, p);
        return { value, correct, label };
      });
    } else {
      info.tansError = "Für Auswahl-Eingaben muss die Musterlösung eine Liste [[Wert, true/false, (Anzeige)], …] sein";
    }
  }
  if (info.type === "matrix" && info.tans && callName(info.tans) === "matrix" && info.tans.k === "call") {
    const rows = info.tans.args.length;
    const cols = info.tans.args[0]?.k === "list" ? info.tans.args[0].items.length : 1;
    info.matrixSize = [rows, cols];
  }
  return info;
}

function inputWidget(info: InputInfo): string {
  const n = escapeHtml(info.name);
  const base = `data-stack-input="${n}" name="${n}"`;
  const id = `id="stackinput_${n}"`;
  switch (info.type) {
    case "dropdown": {
      const opts = (info.choices ?? []).map((c, i) => `<option value="${i}">${c.label}</option>`).join("");
      return `<select class="stack-select" ${id} ${base}><option value="">(Keine Auswahl)</option>${opts}</select>`;
    }
    case "radio": {
      const opts = (info.choices ?? [])
        .map((c, i) => `<label class="stack-choice"><input type="radio" ${base} value="${i}"> ${c.label}</label>`)
        .join("");
      return `<div class="stack-choices">${opts}</div>`;
    }
    case "checkbox": {
      const opts = (info.choices ?? [])
        .map((c, i) => `<label class="stack-choice"><input type="checkbox" ${base} value="${i}"> ${c.label}</label>`)
        .join("");
      return `<div class="stack-choices">${opts}</div>`;
    }
    case "boolean":
      return `<select class="stack-select" ${id} ${base}><option value="">(Keine Auswahl)</option><option value="true">Wahr</option><option value="false">Falsch</option></select>`;
    case "textarea":
    case "equiv":
    case "notes":
      return `<textarea class="stack-textarea" ${id} ${base} rows="4" cols="${info.boxsize + 10}"></textarea>`;
    case "matrix": {
      const [r, c] = info.matrixSize ?? [2, 2];
      let s = `<table class="stack-matrix" data-stack-matrix="${n}" data-rows="${r}" data-cols="${c}">`;
      for (let i = 0; i < r; i++) {
        s += "<tr>";
        for (let j = 0; j < c; j++) s += `<td><input type="text" size="${Math.max(3, info.boxsize)}" data-matrix-cell="${n}" data-r="${i}" data-c="${j}"></td>`;
        s += "</tr>";
      }
      return s + "</table>";
    }
    default:
      return `<input type="text" class="stack-input" ${id} ${base} size="${info.boxsize}" autocomplete="off" spellcheck="false">`;
  }
}

/** Erzeugt die komplette Vorschau für einen Seed. */
/** Lokale Auswertung reicht nicht (Funktion nicht nachgebildet, Fehler oder Hinweis der Vorschau). */
function localNeedsMaxima(vars: EvalResult, texts: string[]): boolean {
  if (vars.warnings.length || vars.errors.some((e) => e.severity === "error")) return true;
  return texts.some((t) => /\b(solve|factor|limit|ratsimp|fullratsimp|partfrac|taylor|realroots|allroots|algsys|linsolve|find_root|ode2|integrate|sum|product)\s*\(/.test(t));
}

export function buildPreview(q: StackQuestion, seed: number, cas?: CasResult | null): PreviewBuild {
  const print = printOptionsOf(q);
  const simp = q.scalars.questionsimplify !== "0";
  const vars = evaluateQuestionVariables(q.questionvariables, seed, simp);
  const env = vars.env;
  const issues: Issue[] = [];
  const needsMaxima = localNeedsMaxima(vars, [q.texts.questiontext.text, q.texts.specificfeedback.text, q.texts.generalfeedback.text]);
  if (cas) {
    // Werte vom Maxima-Server ersetzen die lokal berechneten
    for (const v of cas.variables) {
      let value: Expr;
      try { value = parseExpression(v.value); } catch { value = { k: "sym", name: v.value }; }
      env.vars.set(v.name, value);
      const existing = vars.variables.find((x) => x.name === v.name);
      if (existing) existing.value = value;
      else vars.variables.push({ name: v.name, value, start: Number.MAX_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER });
    }
    vars.warnings = [];
    vars.errors = cas.errors.map((e) => ({ message: `${e.source}: ${e.message}`, from: 0, to: 0, severity: "error" as const }));
    for (const e of cas.errors) issues.push({ severity: "error", where: "Fragevariablen", message: `Maxima: ${e.source} – ${e.message}` });
    for (const e of cas.expressions) if (e.error) issues.push({ severity: "error", where: "Fragetext", message: `Maxima: {@${e.src}@} – ${e.error}` });
  } else {
    for (const e of vars.errors) {
      if (e.severity === "error") issues.push({ severity: "error", where: "Fragevariablen", message: e.message });
    }
    for (const w of vars.warnings) issues.push({ severity: "info", where: "Fragevariablen", message: w });
  }
  const casMap = cas ? new Map(cas.expressions.filter((e) => !e.error).map((e) => [e.src, { value: e.value, tex: e.tex }])) : undefined;

  const inputs: Record<string, InputInfo> = {};
  for (const inp of q.inputs) {
    const info = inputInfo(inp, env, print);
    inputs[info.name] = info;
    if (info.tansError) issues.push({ severity: "error", where: `Eingabe ${info.name}`, message: info.tansError });
  }

  const prtNames = new Set(q.prts.map((p) => p.name));
  const placeholder = (kind: "input" | "validation" | "feedback", name: string) => {
    const n = escapeHtml(name);
    if (kind === "input") {
      const info = inputs[name];
      if (!info) return `<span class="stack-error">⚠ Eingabe „${n}“ existiert nicht</span>`;
      return `<span class="stack-input-wrap">${inputWidget(info)}</span>`;
    }
    if (kind === "validation") {
      if (!inputs[name]) return `<span class="stack-error">⚠ Eingabe „${n}“ existiert nicht</span>`;
      return `<div class="stack-validation" data-validation="${n}"></div>`;
    }
    if (!prtNames.has(name)) return `<span class="stack-error">⚠ PRT „${n}“ existiert nicht</span>`;
    return `<div class="stack-feedback" data-feedback="${n}"></div>`;
  };

  const ctx = makeCtx(seed, simp);
  const render = (src: string, where: string, idPrefix: string) => {
    const r = renderCasText(src, env, ctx, { print, placeholder, idPrefix, cas: casMap });
    for (const e of r.errors) issues.push({ severity: "error", where, message: e });
    return r;
  };
  const qt = render(q.texts.questiontext.text, "Fragetext", "qt");
  const sf = render(q.texts.specificfeedback.text, "Spezifisches Feedback", "sf");
  const gf = render(q.texts.generalfeedback.text, "Allgemeines Feedback", "gf");
  const note = render(q.texts.questionnote.text, "Fragenotiz", "qn");

  // Konsistenzprüfungen
  const allText = q.texts.questiontext.text + q.texts.specificfeedback.text;
  const ph = findPlaceholders(allText);
  for (const inp of q.inputs) {
    const name = inp.fields.name;
    if (!ph.some((p) => p.kind === "input" && p.name === name)) {
      issues.push({ severity: "warning", where: `Eingabe ${name}`, message: `[[input:${name}]] fehlt im Fragetext` });
    }
    if (inp.fields.showvalidation !== "0" && !ph.some((p) => p.kind === "validation" && p.name === name)) {
      issues.push({ severity: "warning", where: `Eingabe ${name}`, message: `[[validation:${name}]] fehlt im Fragetext` });
    }
  }
  for (const p of q.prts) {
    if (!ph.some((x) => x.kind === "feedback" && x.name === p.name)) {
      issues.push({ severity: "warning", where: `PRT ${p.name}`, message: `[[feedback:${p.name}]] fehlt in Fragetext/spez. Feedback` });
    }
    if (!usedInputs(p, q).length) {
      issues.push({ severity: "warning", where: `PRT ${p.name}`, message: "PRT verwendet keine Eingabe" });
    }
  }
  if (!q.texts.questionnote.text.trim() && /rand/.test(q.questionvariables)) {
    issues.push({ severity: "info", where: "Fragenotiz", message: "Zufallsvariablen ohne Fragenotiz – STACK kann Varianten nicht unterscheiden" });
  }

  return {
    seed, print, vars, env, inputs,
    questionHtml: qt.html,
    specificFeedbackHtml: sf.html,
    generalFeedbackHtml: gf.html,
    noteHtml: note.html,
    jsx: [...qt.jsx, ...sf.jsx, ...gf.jsx],
    issues,
    cas: cas ? "maxima" : "local",
    needsMaxima,
  };
}

// ---- Schülereingaben ---------------------------------------------------------------

/** Fügt fehlende Malzeichen ein (vereinfachte Version von STACKs insertstars). */
function insertStars(s: string): string {
  return s
    .replace(/(\d)\s*([A-Za-z(])/g, "$1*$2")
    .replace(/\)\s*([A-Za-z0-9(])/g, ")*$1");
}

export interface ValidationResult {
  html: string;
  valid: boolean;
  value?: Expr;
  /** Maxima-Text der Antwort (für PRT/Rohwerte) */
  source?: string;
  empty: boolean;
}

export function answerSource(info: InputInfo, raw: RawAnswer): string | null {
  switch (info.type) {
    case "dropdown":
    case "radio": {
      const i = typeof raw === "string" ? raw : "";
      if (i === "") return null;
      const c = info.choices?.[Number(i)];
      return c ? toMaxima(c.value) : null;
    }
    case "checkbox": {
      const sel = Array.isArray(raw) ? (raw as string[]) : [];
      if (!sel.length) return null;
      return `[${sel.map((i) => info.choices?.[Number(i)]).filter(Boolean).map((c) => toMaxima(c!.value)).join(",")}]`;
    }
    case "matrix": {
      const m = raw as string[][];
      if (!Array.isArray(m) || m.every((r) => r.every((c) => !c.trim()))) return null;
      return `matrix(${m.map((r) => `[${r.map((c) => c.trim() || "?").join(",")}]`).join(",")})`;
    }
    case "string":
    case "notes": {
      const s = typeof raw === "string" ? raw : "";
      return s === "" ? null : JSON.stringify(s);
    }
    default: {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return null;
      if (info.type === "textarea" || info.type === "equiv") {
        return `[${s.split(/\n+/).map((l) => l.trim()).filter(Boolean).join(",")}]`;
      }
      return info.input.fields.insertstars && info.input.fields.insertstars !== "0" ? insertStars(s) : s;
    }
  }
}

export function validateInput(build: PreviewBuild, name: string, raw: RawAnswer): ValidationResult {
  const info = build.inputs[name];
  if (!info) return { html: "", valid: false, empty: true };
  const src = answerSource(info, raw);
  if (src === null) return { html: "", valid: false, empty: true };
  const f = info.input.fields;
  try {
    const parsed = parseExpression(src);
    if (f.forbidfloat === "1" && /\d\.\d|\d\.(?!\d)|\.\d/.test(src) && TEXT_INPUTS.has(info.type)) {
      throw new Error("Gleitkommazahlen sind in dieser Eingabe nicht erlaubt.");
    }
    // Schülerantworten dürfen keine Fragevariablen verwenden
    const used = new Set<string>();
    const collect = (e: Expr) => {
      if (e.k === "sym") used.add(e.name);
      if (e.k === "op" || e.k === "call") (e.k === "op" ? e.args : e.args).forEach(collect);
      if (e.k === "list" || e.k === "set") e.items.forEach(collect);
    };
    collect(parsed);
    const forbidden = [...used].filter((u) => build.env.vars.has(u));
    if (TEXT_INPUTS.has(info.type) && forbidden.length) {
      throw new Error(`Verbotene Variable oder Konstante: ${forbidden.join(", ")}`);
    }
    const forbidWords = (f.forbidwords || "").split(",").map((w) => w.trim()).filter(Boolean);
    const bad = forbidWords.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(src));
    if (bad.length) throw new Error(`Nicht erlaubt: ${bad.join(", ")}`);

    const value = evaluate(parsed, new Env(), makeCtx(1, false));
    const shown = ["dropdown", "radio", "checkbox", "boolean"].includes(info.type);
    const varsUsed = [...used].filter((u) => !/^%/.test(u));
    let html = "";
    if (!shown && f.showvalidation !== "0") {
      html = `<div class="stack-valid">Ihre letzte Antwort wurde folgendermaßen interpretiert: \\[ ${toTex(value, build.print)} \\]`;
      if (f.showvalidation === "1" && varsUsed.length && TEXT_INPUTS.has(info.type)) {
        html += `<div class="stack-vars">Die in Ihrer Antwort gefundenen Variablen: \\( \\left[ ${varsUsed.join(" , ")} \\right] \\)</div>`;
      }
      html += "</div>";
    }
    return { html, valid: true, value, source: src, empty: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      html: `<div class="stack-invalid">Diese Antwort ist ungültig. ${escapeHtml(msg)}<br><code>${escapeHtml(src)}</code></div>`,
      valid: false,
      source: src,
      empty: false,
    };
  }
}

// ---- PRT-Auswertung -------------------------------------------------------------------

export interface PrtResult {
  name: string;
  status: "notanswered" | "invalid" | "evaluated" | "error";
  score: number;
  penalty: number;
  weight: number;
  notes: string[];
  html: string;
  errors: string[];
  approximate: boolean;
  path: { node: string; result: boolean }[];
}

function wordRe(name: string) {
  return new RegExp(`(^|[^A-Za-z0-9_%])${name}(?![A-Za-z0-9_%])`);
}

export function usedInputs(p: Prt, q: StackQuestion): string[] {
  const text = [p.feedbackvariables, ...p.nodes.flatMap((n) => [n.fields.sans, n.fields.tans, n.fields.testoptions])].join(" \n ");
  return q.inputs.map((i) => i.fields.name).filter((n) => wordRe(n).test(text));
}

export function evaluatePrt(
  build: PreviewBuild,
  q: StackQuestion,
  p: Prt,
  answers: Record<string, { value: Expr; source: string } | null>,
): PrtResult {
  const res: PrtResult = {
    name: p.name, status: "notanswered", score: 0, penalty: 0, weight: Number(p.value) || 1,
    notes: [], html: "", errors: [], approximate: false, path: [],
  };
  const needed = usedInputs(p, q);
  if (needed.some((n) => !answers[n])) return res;

  const env = new Env(build.env);
  const simp = p.autosimplify !== "0";
  const ctx = makeCtx(build.seed, simp);
  for (const n of needed) {
    const a = answers[n]!;
    env.vars.set(n, simp ? simplify(a.value) : a.value);
  }
  const fv = evaluateBlock(p.feedbackvariables, env, ctx);
  for (const e of fv.errors) if (e.severity === "error") res.errors.push(`Feedback-Variablen: ${e.message}`);

  const feedback: string[] = [];
  const byName = new Map(p.nodes.map((n) => [n.fields.name, n]));
  let node = p.nodes[0];
  const visited = new Set<string>();
  let penalty: number | null = null;
  const qPenalty = Number(q.scalars.penalty) || 0;
  const render = (src: string) => {
    if (!src.trim()) return "";
    const r = renderCasText(src, env, ctx, { print: build.print, placeholder: () => "", idPrefix: `${p.name}fb` });
    res.errors.push(...r.errors);
    return r.html;
  };

  while (node) {
    const nf = node.fields;
    if (visited.has(nf.name)) { res.errors.push(`Endlosschleife bei Knoten ${nf.name}`); break; }
    visited.add(nf.name);
    let ok = false;
    try {
      const sa = evaluate(parseExpression(nf.sans), env, ctx);
      const ta = evaluate(parseExpression(nf.tans), env, ctx);
      const opt = nf.testoptions?.trim() ? evaluate(parseExpression(nf.testoptions), env, ctx) : null;
      const rawSa = needed.includes(nf.sans.trim()) ? answers[nf.sans.trim()]?.source : undefined;
      const at = runAnswerTest(nf.answertest, sa, ta, opt, rawSa);
      if (at.error) res.errors.push(`Knoten ${Number(nf.name) + 1}: ${at.error}`);
      if (at.approximate) res.approximate = true;
      ok = at.result;
      if (at.feedback && nf.quiet !== "1") feedback.push(escapeHtml(at.feedback));
    } catch (e) {
      res.errors.push(`Knoten ${Number(nf.name) + 1}: ${e instanceof Error ? e.message : e}`);
      res.status = "error";
      return res;
    }
    res.path.push({ node: nf.name, result: ok });
    const b = ok ? "true" : "false";
    const mode = nf[`${b}scoremode`] || "=";
    const sc = Number(nf[`${b}score`]) || 0;
    if (mode === "=") res.score = sc;
    else if (mode === "+") res.score += sc;
    else if (mode === "-") res.score -= sc;
    const pen = nf[`${b}penalty`];
    if (pen !== undefined && pen !== "") penalty = Number(pen);
    if (nf[`${b}answernote`]) res.notes.push(nf[`${b}answernote`]);
    const fbHtml = render((ok ? node.truefeedback : node.falsefeedback).text);
    if (fbHtml) feedback.push(fbHtml);
    const next = nf[`${b}nextnode`];
    node = next && next !== "-1" ? byName.get(next)! : (undefined as never);
  }
  res.score = Math.min(1, Math.max(0, res.score));
  res.penalty = penalty ?? qPenalty;
  if (res.status !== "error") res.status = "evaluated";

  const head =
    res.score >= 0.999 ? q.texts.prtcorrect.text :
    res.score > 0 ? q.texts.prtpartiallycorrect.text :
    q.texts.prtincorrect.text;
  const cls = res.score >= 0.999 ? "correct" : res.score > 0 ? "partially" : "incorrect";
  const style = p.feedbackstyle;
  const headHtml = render(head);
  let html = "";
  if (style === "0") html = feedback.join(" ");
  else if (style === "2" || style === "3") html = headHtml;
  else html = `${headHtml}${feedback.length ? `<div class="stack-prt-fb">${feedback.join(" ")}</div>` : ""}`;
  res.html = `<div class="stack-prt ${cls}">${html}</div>`;
  return res;
}

export function evaluateAllPrts(
  build: PreviewBuild,
  q: StackQuestion,
  raw: Record<string, RawAnswer>,
): { prts: PrtResult[]; validations: Record<string, ValidationResult> } {
  const validations: Record<string, ValidationResult> = {};
  const answers: Record<string, { value: Expr; source: string } | null> = {};
  for (const inp of q.inputs) {
    const n = inp.fields.name;
    const v = validateInput(build, n, raw[n] ?? "");
    validations[n] = v;
    answers[n] = v.valid && v.value ? { value: v.value, source: v.source ?? "" } : null;
  }
  const prts = q.prts.map((p) => {
    const needed = usedInputs(p, q);
    const anyInvalid = needed.some((n) => !validations[n]?.valid && !validations[n]?.empty);
    const r = evaluatePrt(build, q, p, answers);
    if (anyInvalid) r.status = "invalid";
    return r;
  });
  return { prts, validations };
}

// ---- Fragetests ----------------------------------------------------------------------

export interface QTestOutcome {
  testcase: string;
  passed: boolean;
  rows: {
    prt: string;
    expectedScore: string;
    expectedNote: string;
    actualScore: number | null;
    actualNote: string;
    passed: boolean;
    errors: string[];
  }[];
  inputErrors: string[];
}

export function runQuestionTests(q: StackQuestion, build: PreviewBuild): QTestOutcome[] {
  return q.qtests.map((t) => {
    const answers: Record<string, { value: Expr; source: string } | null> = {};
    const inputErrors: string[] = [];
    for (const inp of q.inputs) answers[inp.fields.name] = null;
    for (const ti of t.inputs) {
      try {
        const value = evaluate(parseExpression(ti.value), build.env, makeCtx(build.seed));
        answers[ti.name] = { value, source: toMaxima(value) };
      } catch (e) {
        inputErrors.push(`${ti.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    const rows = t.expected.map((ex) => {
      const p = q.prts.find((x) => x.name === ex.name);
      if (!p) {
        return { prt: ex.name, expectedScore: ex.expectedscore, expectedNote: ex.expectedanswernote, actualScore: null, actualNote: "", passed: false, errors: ["PRT existiert nicht"] };
      }
      const r = evaluatePrt(build, q, p, answers);
      const actualNote = r.status === "notanswered" ? "NULL" : r.notes[r.notes.length - 1] ?? "";
      const expNote = ex.expectedanswernote || "";
      const scoreOk = r.status === "notanswered"
        ? ex.expectedscore === "" || expNote === "NULL"
        : Math.abs(r.score - Number(ex.expectedscore || 0)) < 1e-6;
      const noteOk = !expNote || actualNote === expNote || (expNote === "NULL" && r.status === "notanswered");
      return {
        prt: ex.name,
        expectedScore: ex.expectedscore,
        expectedNote: expNote,
        actualScore: r.status === "notanswered" ? null : r.score,
        actualNote,
        passed: scoreOk && noteOk && r.errors.length === 0,
        errors: r.errors,
      };
    });
    return { testcase: t.testcase, passed: rows.every((r) => r.passed) && !inputErrors.length, rows, inputErrors };
  });
}

/** Musterlösung für die Vorschau (Tabelle Eingabe -> Wert). */
export function teacherAnswers(build: PreviewBuild): { name: string; html: string; source: string }[] {
  return Object.values(build.inputs).map((info) => {
    if (info.choices) {
      const correct = info.choices.filter((c) => c.correct);
      return { name: info.name, html: correct.map((c) => c.label).join(", ") || "–", source: correct.map((c) => toMaxima(c.value)).join(", ") };
    }
    if (!info.tans) return { name: info.name, html: "–", source: "" };
    return { name: info.name, html: texInline(info.tans, build.print), source: toMaxima(info.tans) };
  });
}
