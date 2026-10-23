// Grafik-Editor für [[jsxgraph]]-Blöcke: Datenmodell, Übersetzung von Termen nach JavaScript
// und Erzeugung des Blockcodes. Das Modell wird base64-kodiert als Kommentar im Block abgelegt,
// damit der Editor die Grafik später wieder öffnen kann.

import { LocalizedError, type MessageKey, type Msg, errorMsg } from "../i18n/index.ts";
import { parseExpression } from "../maxima/parser.ts";
import type { Expr } from "../maxima/types.ts";

export type JsxColor = string;

export interface JsxPoint {
  kind: "point"; id: string; name: string; x: string; y: string; color: JsxColor;
  fixed: boolean; snap: string; showLabel: boolean; input: string;
}
export interface JsxSlider {
  kind: "slider"; id: string; name: string; label: string;
  x1: string; y1: string; x2: string; y2: string;
  min: string; start: string; max: string; step: string; color: JsxColor; input: string;
}
export interface JsxFunction {
  kind: "function"; id: string; name: string; term: string; color: JsxColor; width: string; dashed: boolean;
  from: string; to: string;
  /** Verschiebung des Graphen: f(x - dx) + dy (beim Ziehen in der Vorschau gesetzt). */
  dx?: string; dy?: string;
}
export interface JsxLine {
  kind: "line"; id: string; name: string; p1: string; p2: string; type: "segment" | "line" | "arrow"; color: JsxColor; dashed: boolean;
}
export interface JsxText {
  kind: "text"; id: string; name: string; x: string; y: string; text: string; size: string;
}
/** JavaScript, das unverändert übernommen wird (z. B. aus von Hand geschriebenen Grafiken). */
export interface JsxCode {
  kind: "code"; id: string; name: string; code: string;
}
export type JsxElement = JsxPoint | JsxSlider | JsxFunction | JsxLine | JsxText | JsxCode;

export interface JsxModel {
  version: 1;
  width: string; // z. B. "500px"
  height: string;
  bbox: [string, string, string, string]; // links, oben, rechts, unten
  axis: boolean;
  grid: boolean;
  keepAspect: boolean;
  elements: JsxElement[];
  /** Weitere Board-Optionen als JavaScript, z. B. "zoom: {wheel: true}" (aus eingelesenem Code). */
  boardOptions?: string;
  /** Name der Zeichenfläche im Code (Standard „board“). Leer: unbekannt – dann nur eigener Code möglich. */
  boardVar?: string;
  /** Die Zeichenfläche wird im eigenen Code angelegt (z. B. initBoard mit Variablen) – keine erzeugte initBoard-Zeile. */
  boardInCode?: boolean;
  /** input-ref-Zuordnungen, die eigener Code benötigt. */
  extraRefs?: { input: string; ref: string }[];
  /** Weitere Attribute im Blockkopf, z. B. 'aspect-ratio="1"'. */
  extraAttrs?: string;
}

export const COLORS: { value: JsxColor; label: MessageKey }[] = [
  { value: "#1f6fb2", label: "jsx.colors.blue" },
  { value: "#c0392b", label: "jsx.colors.red" },
  { value: "#1e8449", label: "jsx.colors.green" },
  { value: "#d68910", label: "jsx.colors.orange" },
  { value: "#7d3c98", label: "jsx.colors.violet" },
  { value: "#2c3e50", label: "jsx.colors.darkGray" },
];

export function newModel(): JsxModel {
  return { version: 1, width: "500px", height: "400px", bbox: ["-5", "5", "5", "-5"], axis: true, grid: false, keepAspect: false, elements: [] };
}

let idCounter = 0;
const newId = () => `e${Date.now().toString(36)}${idCounter++}`;

/** Nächster freier Name aus einer Folge, z. B. A, B, C … oder a, b, c … */
function nextName(model: JsxModel, candidates: string[], prefix: string): string {
  const used = new Set(model.elements.map((e) => e.name));
  return candidates.find((c) => !used.has(c)) ?? (() => { let i = 1; while (used.has(`${prefix}${i}`)) i++; return `${prefix}${i}`; })();
}

export function newElement(model: JsxModel, kind: JsxElement["kind"]): JsxElement {
  const id = newId();
  const color = COLORS[model.elements.length % COLORS.length].value;
  const [l, t, r, b] = model.bbox.map(Number);
  const w = (r - l) || 10, h = (t - b) || 10;
  switch (kind) {
    case "point": {
      // neue Punkte nebeneinander statt übereinander
      const n = model.elements.filter((e) => e.kind === "point").length;
      const x = String(+(l + w * (0.6 + 0.12 * (n % 3))).toFixed(2));
      const y = String(+(b + h * (0.6 + 0.12 * Math.floor(n / 3) % 3)).toFixed(2));
      return { kind, id, name: nextName(model, "ABCDEFGHPQRSTUVW".split(""), "P"), x, y, color, fixed: false, snap: "", showLabel: true, input: "" };
    }
    case "slider": {
      const sliders = model.elements.filter((e) => e.kind === "slider").length;
      const y = String(+(b + h * (0.1 + 0.08 * sliders)).toFixed(2));
      return {
        kind, id, name: nextName(model, "abcdkmnst".split(""), "s"), label: "",
        x1: String(+(l + w * 0.55).toFixed(2)), y1: y, x2: String(+(l + w * 0.9).toFixed(2)), y2: y,
        min: "-3", start: "1", max: "3", step: "0.1", color, input: "",
      };
    }
    case "function":
      return { kind, id, name: nextName(model, ["f", "g", "h"], "f"), term: "x^2", color, width: "2", dashed: false, from: "", to: "", dx: "0", dy: "0" };
    case "line": {
      const pts = model.elements.filter((e) => e.kind === "point").map((e) => e.name);
      return { kind, id, name: nextName(model, ["s1", "s2", "s3", "s4"], "s"), p1: pts[0] ?? "", p2: pts[1] ?? "", type: "segment", color, dashed: false };
    }
    case "text":
      // Inhalt (ins XML), nicht übersetzen
      return { kind, id, name: nextName(model, ["t1", "t2", "t3"], "t"), x: String(l + w * 0.05), y: String(t - h * 0.08), text: "Text", size: "16" };
    case "code":
      // Inhalt (ins XML), nicht übersetzen
      return { kind, id, name: "", code: "// eigener JSXGraph-Code, z. B.\n// board.create('circle', [A, 2]);" };
  }
}

// ---- Terme → JavaScript ---------------------------------------------------------------------------

const MATH_FUNCS: Record<string, string> = {
  sin: "Math.sin", cos: "Math.cos", tan: "Math.tan", asin: "Math.asin", acos: "Math.acos", atan: "Math.atan",
  sinh: "Math.sinh", cosh: "Math.cosh", tanh: "Math.tanh",
  sqrt: "Math.sqrt", exp: "Math.exp", log: "Math.log", ln: "Math.log", abs: "Math.abs",
  floor: "Math.floor", ceiling: "Math.ceil", ceil: "Math.ceil", round: "Math.round", signum: "Math.sign", sign: "Math.sign",
  min: "Math.min", max: "Math.max",
};
const CONSTANTS: Record<string, string> = { "%pi": "Math.PI", pi: "Math.PI", "%e": "Math.E" };

/** Term nicht übersetzbar; `.msg` für die Anzeige, `.message` bleibt deutsch. */
export class TermError extends LocalizedError {}

export interface TermContext {
  /** Namen der Schieberegler (werden zu name.Value()). */
  sliders: string[];
  /** Namen der Punkte (P_x → P.X(), P_y → P.Y()). */
  points: string[];
  /** Erlaubte freie Variable (z. B. "x" bei Funktionsgraphen). */
  variable?: string;
}

/**
 * Übersetzt einen Term in Maxima-Schreibweise (x^2, sqrt(x), %pi …) nach JavaScript.
 * {#…#} und {@…@} bleiben als STACK-Platzhalter erhalten und werden in Klammern gesetzt.
 */
export function termToJs(term: string, ctx: TermContext): { js: string; dynamic: boolean } {
  const cas: string[] = [];
  const src = term.replace(/\{#([\s\S]*?)#\}/g, (m) => { cas.push(m); return ` __cas${cas.length - 1} `; }).trim();
  if (!src) throw new TermError("jsx.errors.emptyTerm");
  let expr: Expr;
  try {
    expr = parseExpression(src);
  } catch (e) {
    // Syntaxfehler des Parsers als Meldung: wird in der Sprache der Oberfläche eingesetzt
    throw new TermError("jsx.errors.unreadableTerm", { error: errorMsg(e) });
  }
  let dynamic = false;
  const go = (e: Expr): string => {
    switch (e.k) {
      case "num": return e.d === 1 ? String(e.n) : `(${e.n}/${e.d})`;
      case "float": return String(e.v);
      case "sym": {
        const n = e.name;
        const casM = /^__cas(\d+)$/.exec(n);
        if (casM) return `(${cas[Number(casM[1])]})`;
        if (n === ctx.variable) { dynamic = true; return n; }
        if (CONSTANTS[n]) return CONSTANTS[n];
        if (ctx.sliders.includes(n)) { dynamic = true; return `${n}.Value()`; }
        const pm = /^(\w+)_(x|y)$/.exec(n);
        if (pm && ctx.points.includes(pm[1])) { dynamic = true; return `${pm[1]}.${pm[2].toUpperCase()}()`; }
        const names = [ctx.variable, ...ctx.sliders].filter(Boolean).join(", ");
        const example = ctx.points.length ? `${ctx.points[0]}_x` : "";
        const key = names
          ? (example ? "jsx.errors.unknownNameWithPoints" : "jsx.errors.unknownName")
          : (example ? "jsx.errors.unknownNameNumbersWithPoints" : "jsx.errors.unknownNameNumbers");
        throw new TermError(key, { name: n, names, example });
      }
      case "op": {
        const [a, b] = e.args;
        switch (e.op) {
          case "neg": return `(-${go(a)})`;
          case "+": case "-": case "*": case "/": return `(${go(a)} ${e.op} ${go(b)})`;
          case "^": case "**": return `Math.pow(${go(a)}, ${go(b)})`;
        }
        throw new TermError("jsx.errors.unsupportedOperator", { op: e.op });
      }
      case "call": {
        const name = e.fn.k === "sym" ? e.fn.name : "";
        const fn = MATH_FUNCS[name];
        if (!fn) throw new TermError("jsx.errors.unsupportedFunction", { name });
        return `${fn}(${e.args.map(go).join(", ")})`;
      }
    }
    throw new TermError("jsx.errors.unsupportedExpression");
  };
  return { js: go(expr), dynamic };
}

// ---- Code-Erzeugung -------------------------------------------------------------------------------
// Der erzeugte Code geht ins XML und ist von der Sprache der Oberfläche unabhängig.

/** Meldung eines Fehlers aus termToJs (andere Fehler sollten dort nicht auftreten). */
function termErrorMsg(err: unknown): Msg {
  return err instanceof LocalizedError ? err.msg : { key: "jsx.errors.unreadableTerm", params: { error: errorMsg(err) } };
}

export interface GenerateResult {
  code: string;
  /** Fehler je Feld; `msg` wird in der Oberfläche übersetzt. */
  errors: { id: string; field: string; msg: Msg }[];
  /** An Eingaben gebundene Elemente: Eingabename → Art. */
  bindings: { input: string; kind: "point" | "slider"; element: string }[];
}

const MARKER = "stack-editor:jsx";
/** Farbattribute; leere Farbe = JSXGraph-Standard (kein Attribut). */
const colorAttrs = (color: string, keys: string[]) => (color ? keys.map((k) => `${k}: ${q(color)}`) : []);
const q = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function encodeModel(m: JsxModel): string {
  const json = JSON.stringify(m);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeModel(b64: string): JsxModel | null {
  try {
    const bin = atob(b64.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const m = JSON.parse(new TextDecoder().decode(bytes)) as JsxModel;
    return m && m.version === 1 && Array.isArray(m.elements) ? m : null;
  } catch {
    return null;
  }
}

export function generateJsx(model: JsxModel): GenerateResult {
  const errors: GenerateResult["errors"] = [];
  const bindings: GenerateResult["bindings"] = [];
  const sliders = model.elements.filter((e) => e.kind === "slider").map((e) => e.name);
  const points = model.elements.filter((e) => e.kind === "point").map((e) => e.name);
  const names = new Set<string>();
  for (const e of model.elements) {
    if (e.kind === "code") continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.name)) errors.push({ id: e.id, field: "name", msg: { key: "jsx.errors.invalidName" } });
    else if (names.has(e.name)) errors.push({ id: e.id, field: "name", msg: { key: "jsx.errors.duplicateName", params: { name: e.name } } });
    names.add(e.name);
  }

  const val = (e: JsxElement, field: string, src: string, allowDynamic = true): { js: string; dynamic: boolean } => {
    try {
      const r = termToJs(src, { sliders: allowDynamic ? sliders : [], points: allowDynamic ? points.filter((p) => p !== e.name) : [] });
      return r;
    } catch (err) {
      errors.push({ id: e.id, field, msg: termErrorMsg(err) });
      return { js: "0", dynamic: false };
    }
  };
  const num = (e: JsxElement, field: string, src: string) => val(e, field, src, false).js;
  const coord = (e: JsxElement, field: string, src: string) => {
    const r = val(e, field, src);
    return r.dynamic ? `function () { return ${r.js}; }` : r.js;
  };

  const lines: string[] = [];
  const bv = model.boardVar === undefined ? "board" : model.boardVar;
  if (!bv && model.elements.some((e) => e.kind !== "code")) {
    errors.push({ id: "board", field: "board", msg: { key: "jsx.errors.boardWithoutName" } });
  }
  const bbox = model.boardInCode ? [] : model.bbox.map((v, i) => num({ id: "board" } as JsxElement, `bbox${i}`, v));
  const extraOpts = model.boardOptions?.trim() ? `, ${model.boardOptions.trim()}` : "";
  if (!model.boardInCode) {
    lines.push(`var ${bv || "board"} = JXG.JSXGraph.initBoard(divid, {boundingbox: [${bbox.join(", ")}], axis: ${model.axis}, grid: ${model.grid}, keepaspectratio: ${model.keepAspect}, showCopyright: false, showNavigation: false${extraOpts}});`);
  }

  // Reihenfolge des Modells; jedes Element erzeugt seine Zeilen erst einmal für sich
  const out = lines;
  const chunks = new Map<string, string[]>();
  for (const e of model.elements) {
    const lines: string[] = [];
    chunks.set(e.id, lines);
    switch (e.kind) {
      case "code": {
        if (e.code.trim()) lines.push(e.code.trimEnd());
        break;
      }
      case "slider": {
        const attrs = [`name: ${q(e.label || e.name)}`, ...colorAttrs(e.color, ["strokeColor", "fillColor"])];
        if (e.step.trim()) attrs.push(`snapWidth: ${num(e, "step", e.step)}`);
        lines.push(`var ${e.name} = ${bv}.create('slider', [[${num(e, "x1", e.x1)}, ${num(e, "y1", e.y1)}], [${num(e, "x2", e.x2)}, ${num(e, "y2", e.y2)}], [${num(e, "min", e.min)}, ${num(e, "start", e.start)}, ${num(e, "max", e.max)}]], {${attrs.join(", ")}});`);
        if (e.input) bindings.push({ input: e.input, kind: "slider", element: e.name });
        break;
      }
      case "point": {
        const attrs = [`name: ${q(e.name)}`, ...colorAttrs(e.color, ["color"]), `size: 4`];
        if (!e.showLabel) attrs.push("withLabel: false");
        if (e.fixed) attrs.push("fixed: true");
        if (e.snap.trim()) attrs.push(`snapToGrid: true, snapSizeX: ${num(e, "snap", e.snap)}, snapSizeY: ${num(e, "snap", e.snap)}`);
        lines.push(`var ${e.name} = ${bv}.create('point', [${coord(e, "x", e.x)}, ${coord(e, "y", e.y)}], {${attrs.join(", ")}});`);
        if (e.input) bindings.push({ input: e.input, kind: "point", element: e.name });
        break;
      }
      case "function": {
        let body = "0";
        try {
          body = termToJs(e.term, { sliders, points, variable: "x" }).js;
        } catch (err) {
          errors.push({ id: e.id, field: "term", msg: termErrorMsg(err) });
        }
        const dx = (e.dx ?? "").trim(), dy = (e.dy ?? "").trim();
        const shiftX = dx && Number(dx) !== 0 ? num(e, "dx", dx) : "";
        const shiftY = dy && Number(dy) !== 0 ? num(e, "dy", dy) : "";
        const args = [shiftX || shiftY
          ? `function (x) { ${shiftX ? `x = x - ${shiftX}; ` : ""}return ${body}${shiftY ? ` + ${shiftY}` : ""}; }`
          : `function (x) { return ${body}; }`];
        if (e.from.trim() || e.to.trim()) args.push(e.from.trim() ? num(e, "from", e.from) : "-Infinity", e.to.trim() ? num(e, "to", e.to) : "Infinity");
        const attrs = [...colorAttrs(e.color, ["strokeColor"]), `strokeWidth: ${num(e, "width", e.width || "2")}`];
        if (e.dashed) attrs.push("dash: 2");
        lines.push(`var ${e.name} = ${bv}.create('functiongraph', [${args.join(", ")}], {${attrs.join(", ")}});`);
        break;
      }
      case "line": {
        if (!points.includes(e.p1) || !points.includes(e.p2)) {
          errors.push({ id: e.id, field: "p1", msg: { key: "jsx.errors.pickTwoPoints" } });
          break;
        }
        const type = e.type === "segment" ? "segment" : e.type === "arrow" ? "arrow" : "line";
        const attrs = [...colorAttrs(e.color, ["strokeColor"]), "strokeWidth: 2"];
        if (e.dashed) attrs.push("dash: 2");
        lines.push(`var ${e.name} = ${bv}.create('${type}', [${e.p1}, ${e.p2}], {${attrs.join(", ")}});`);
        break;
      }
      case "text": {
        lines.push(`var ${e.name} = ${bv}.create('text', [${coord(e, "x", e.x)}, ${coord(e, "y", e.y)}, ${q(e.text)}], {fontSize: ${num(e, "size", e.size || "16")}});`);
        break;
      }
    }
  }
  // Ausgeben; ein Regler, den ein früheres Element benötigt, wird direkt davor gesetzt
  const emitted = new Set<string>();
  const emit = (e: JsxElement) => {
    if (emitted.has(e.id)) return;
    emitted.add(e.id);
    const text = chunks.get(e.id)!.join("\n");
    for (const s of model.elements) {
      if (s.kind === "slider" && !emitted.has(s.id) && s.id !== e.id && new RegExp(`\\b${s.name}\\.Value\\(`).test(text)) emit(s);
    }
    out.push(...chunks.get(e.id)!);
  };
  for (const e of model.elements) emit(e);

  const refs = [...new Set(bindings.map((b) => b.input))];
  // Name der Referenzvariable: vorhandenen (aus eingelesenem Code) beibehalten, sonst „ans1Ref“
  const refName = (input: string) => model.extraRefs?.find((r) => r.input === input)?.ref ?? `${input}Ref`;
  if (bindings.length) {
    // Inhalt (ins XML), nicht übersetzen – jsxparse.ts erkennt den Kommentar an diesem Wortlaut
    lines.push("", "// Verknüpfung mit den Eingabefeldern");
    // Mehrere Objekte an derselben Eingabe werden als Liste gebunden
    for (const input of refs) {
      const bs = bindings.filter((b) => b.input === input);
      if (bs.length > 1) lines.push(`stack_jxg.bind_list_of(${refName(input)}, [${bs.map((b) => b.element).join(", ")}]);`);
      else lines.push(`stack_jxg.bind_${bs[0].kind}(${refName(input)}, ${bs[0].element});`);
    }
  }
  for (const r of model.extraRefs ?? []) if (!refs.includes(r.input)) refs.push(r.input);

  const size = (s: string, field: string) => {
    const v = s.trim();
    if (!/^\d+(\.\d+)?(px|%|em|rem|vw)?$/.test(v)) errors.push({ id: "board", field, msg: { key: "jsx.errors.size" } });
    return /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v.replace(/"/g, "");
  };
  const head = [
    `width="${size(model.width, "width")}"`, `height="${size(model.height, "height")}"`,
    ...refs.map((r) => `input-ref-${r}="${refName(r)}"`),
    ...(model.extraAttrs?.trim() ? [model.extraAttrs.trim()] : []),
  ];
  const code = [
    `[[jsxgraph ${head.join(" ")}]]`,
    `/* ${MARKER} ${encodeModel(model)} */`,
    ...lines,
    "[[/jsxgraph]]",
  ].join("\n");
  return { code, errors, bindings };
}

// ---- Bestehende Blöcke finden ------------------------------------------------------------------------

export interface JsxBlockRange { from: number; to: number; model: JsxModel | null }

/** Findet den [[jsxgraph]]-Block, in dem `pos` liegt (inklusive Start- und Endtag). */
export function findJsxBlock(text: string, pos: number): JsxBlockRange | null {
  const re = /\[\[\s*jsxgraph\b[^\]]*\]\]([\s\S]*?)\[\[\s*\/jsxgraph\s*\]\]/g;
  for (const m of text.matchAll(re)) {
    const from = m.index ?? 0, to = from + m[0].length;
    if (pos >= from && pos <= to) return { from, to, model: readModel(m[1]) };
  }
  return null;
}

export function readModel(blockBody: string): JsxModel | null {
  const m = new RegExp(`/\\*\\s*${MARKER}\\s+([A-Za-z0-9+/=]+)\\s*\\*/`).exec(blockBody);
  return m ? decodeModel(m[1]) : null;
}
