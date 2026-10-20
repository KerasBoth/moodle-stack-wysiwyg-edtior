// Liest einen [[jsxgraph]]-Block (auch von Hand geschrieben) in das Modell des Grafik-Editors ein.
// Erkannt werden initBoard, Punkte, Schieberegler, Funktionsgraphen, Strecken/Geraden/Pfeile, Texte und
// stack_jxg.bind_*. Alles andere bleibt als „eigener Code“ unverändert erhalten.

import { parse } from "acorn";
import type * as ESTree from "estree";
import {
  type JsxElement, type JsxModel, TermError, generateJsx, newModel, termToJs,
} from "./jsxbuilder.ts";

export type ParseResult =
  | { ok: true; model: JsxModel; /** Anzahl der als eigener Code übernommenen Abschnitte */ custom: number; /** Hinweis für den Dialog */ note?: string }
  | { ok: false; error: string };

type Node = ESTree.Node & { start: number; end: number };

const MARKER_RE = /\/\*\s*stack-editor:jsx\s+[A-Za-z0-9+/=]+\s*\*\/\s*/g;
const GENERATED_COMMENT = /^\s*\/\/ Verknüpfung mit den Eingabefeldern\s*$/gm;

let idCounter = 0;
const newId = () => `p${Date.now().toString(36)}${idCounter++}`;

// ---- JavaScript-Ausdruck → Term in Maxima-Schreibweise --------------------------------------------

const MATH_TO_TERM: Record<string, string> = {
  sin: "sin", cos: "cos", tan: "tan", asin: "asin", acos: "acos", atan: "atan", sinh: "sinh", cosh: "cosh", tanh: "tanh",
  sqrt: "sqrt", exp: "exp", log: "log", abs: "abs", floor: "floor", ceil: "ceiling", round: "round", sign: "signum", min: "min", max: "max",
};

class Unsupported extends Error {}

interface TermCtx {
  cas: string[]; // Platzhalter __casN__ → {#…#}
  sliders: Set<string>;
  points: Set<string>;
  variable?: string;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4 };

/** Übersetzt einen JS-Ausdruck in einen Term; liefert [Text, Rang] für die Klammerung. */
function toTerm(n: ESTree.Node, ctx: TermCtx): [string, number] {
  switch (n.type) {
    case "Literal":
      if (typeof n.value === "number") return [String(n.value), 9];
      break;
    case "Identifier": {
      const cas = /^__cas(\d+)__$/.exec(n.name);
      if (cas) return [ctx.cas[Number(cas[1])], 9];
      if (n.name === ctx.variable) return [n.name, 9];
      break;
    }
    case "UnaryExpression":
      if (n.operator === "-") {
        const [a, p] = toTerm(n.argument, ctx);
        return [`-${p < PREC.neg ? `(${a})` : a}`, PREC.neg];
      }
      if (n.operator === "+") return toTerm(n.argument, ctx);
      break;
    case "BinaryExpression": {
      const op = n.operator === "**" ? "^" : n.operator;
      if (!(op in PREC)) break;
      const p = PREC[op];
      const [l, lp] = toTerm(n.left as ESTree.Expression, ctx);
      const [r, rp] = toTerm(n.right, ctx);
      // links: bei ^ (rechtsassoziativ) auch gleicher Rang klammern; rechts bei - und / gleichen Rang klammern
      const lw = lp < p || (op === "^" && lp <= p) ? `(${l})` : l;
      const rw = rp < p || (rp === p && (op === "-" || op === "/")) ? `(${r})` : r;
      return [op === "^" ? `${lw}^${rw}` : `${lw}${op === "*" || op === "/" ? op : ` ${op} `}${rw}`, p];
    }
    case "CallExpression": {
      const c = n.callee;
      if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier") {
        const obj = c.object.type === "Identifier" ? c.object.name : "";
        const prop = c.property.name;
        if (obj === "Math" && prop === "pow" && n.arguments.length === 2) {
          const [b, bp] = toTerm(n.arguments[0] as ESTree.Expression, ctx);
          const [e, ep] = toTerm(n.arguments[1] as ESTree.Expression, ctx);
          return [`${bp <= PREC["^"] ? `(${b})` : b}^${ep < 9 ? `(${e})` : e}`, PREC["^"]];
        }
        if (obj === "Math" && MATH_TO_TERM[prop]) {
          return [`${MATH_TO_TERM[prop]}(${n.arguments.map((a) => toTerm(a as ESTree.Expression, ctx)[0]).join(", ")})`, 9];
        }
        if (n.arguments.length === 0 && prop === "Value" && ctx.sliders.has(obj)) return [obj, 9];
        if (n.arguments.length === 0 && (prop === "X" || prop === "Y") && ctx.points.has(obj)) return [`${obj}_${prop.toLowerCase()}`, 9];
      }
      break;
    }
    case "MemberExpression":
      if (!n.computed && n.object.type === "Identifier" && n.object.name === "Math" && n.property.type === "Identifier") {
        if (n.property.name === "PI") return ["%pi", 9];
        if (n.property.name === "E") return ["%e", 9];
      }
      break;
  }
  throw new Unsupported("nicht abbildbar");
}

/** Term prüfen: muss sich wieder in gültiges JavaScript übersetzen lassen. */
function term(n: ESTree.Node, ctx: TermCtx): string {
  const t = toTerm(n, ctx)[0];
  try {
    termToJs(t, { sliders: [...ctx.sliders], points: [...ctx.points], variable: ctx.variable });
  } catch (e) {
    if (e instanceof TermError) throw new Unsupported(e.message);
    throw e;
  }
  return t;
}

/** Koordinate: Zahl/Term oder function () { return …; } */
function coordinate(n: ESTree.Node, ctx: TermCtx): string {
  if (n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
    if (n.params.length) throw new Unsupported("Funktion mit Parametern");
    return term(returnedExpression(n), ctx);
  }
  return term(n, ctx);
}

function returnedExpression(fn: ESTree.FunctionExpression | ESTree.ArrowFunctionExpression): ESTree.Expression {
  if (fn.body.type !== "BlockStatement") return fn.body;
  const [st, ...rest] = fn.body.body;
  if (rest.length || st?.type !== "ReturnStatement" || !st.argument) throw new Unsupported("Funktionskörper zu komplex");
  return st.argument;
}

// ---- Attribute -------------------------------------------------------------------------------------------

type Attrs = Map<string, ESTree.Expression>;

function attrsOf(n: ESTree.Node | undefined): Attrs {
  const out: Attrs = new Map();
  if (!n) return out;
  if (n.type !== "ObjectExpression") throw new Unsupported("Attribute sind kein Objekt");
  for (const p of n.properties) {
    if (p.type !== "Property" || p.computed || p.kind !== "init") throw new Unsupported("Attribut nicht lesbar");
    const key = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : "";
    out.set(key, p.value as ESTree.Expression);
  }
  return out;
}

function onlyAttrs(a: Attrs, allowed: string[]) {
  for (const k of a.keys()) if (!allowed.includes(k)) throw new Unsupported(`Attribut ${k}`);
}

const str = (n: ESTree.Expression | undefined) => {
  if (!n) return undefined;
  if (n.type === "Literal" && typeof n.value === "string") return n.value;
  throw new Unsupported("kein Text");
};
const bool = (n: ESTree.Expression | undefined) => {
  if (!n) return undefined;
  if (n.type === "Literal" && typeof n.value === "boolean") return n.value;
  throw new Unsupported("kein Wahrheitswert");
};
const plainNum = (n: ESTree.Expression | undefined, ctx: TermCtx) => (n ? term(n, { ...ctx, sliders: new Set(), points: new Set(), variable: undefined }) : undefined);

function colorOf(a: Attrs, fallback: string): string {
  const c = str(a.get("color")) ?? str(a.get("strokeColor")) ?? str(a.get("fillColor"));
  return c ?? fallback;
}

// ---- Elemente ------------------------------------------------------------------------------------------------

function element(name: string, type: string, args: ESTree.Node[], rawAttrs: ESTree.Node | undefined, ctx: TermCtx): JsxElement {
  const a = attrsOf(rawAttrs);
  // ohne Farbangabe: JSXGraph-Standard beibehalten
  const defaultColor = "";
  const id = newId();
  switch (type) {
    case "point": {
      onlyAttrs(a, ["name", "color", "strokeColor", "fillColor", "size", "fixed", "withLabel", "snapToGrid", "snapSizeX", "snapSizeY"]);
      if (args.length !== 2) throw new Unsupported("Punkt");
      const label = str(a.get("name"));
      if (label !== undefined && label !== name) throw new Unsupported("Beschriftung weicht vom Namen ab");
      const snap = bool(a.get("snapToGrid")) ? plainNum(a.get("snapSizeX"), ctx) ?? "1" : "";
      return {
        kind: "point", id, name, x: coordinate(args[0], ctx), y: coordinate(args[1], ctx), color: colorOf(a, defaultColor),
        fixed: bool(a.get("fixed")) ?? false, snap, showLabel: bool(a.get("withLabel")) ?? true, input: "",
      };
    }
    case "slider": {
      onlyAttrs(a, ["name", "color", "strokeColor", "fillColor", "snapWidth"]);
      const [p1, p2, range] = args;
      if (args.length !== 3 || p1?.type !== "ArrayExpression" || p2?.type !== "ArrayExpression" || range?.type !== "ArrayExpression"
        || p1.elements.length !== 2 || p2.elements.length !== 2 || range.elements.length !== 3) throw new Unsupported("Regler");
      const n = (e: ESTree.Node | null | ESTree.SpreadElement) => { if (!e || e.type === "SpreadElement") throw new Unsupported("Regler"); return plainNum(e as ESTree.Expression, ctx)!; };
      const label = str(a.get("name"));
      return {
        kind: "slider", id, name, label: label && label !== name ? label : "",
        x1: n(p1.elements[0]), y1: n(p1.elements[1]), x2: n(p2.elements[0]), y2: n(p2.elements[1]),
        min: n(range.elements[0]), start: n(range.elements[1]), max: n(range.elements[2]),
        step: plainNum(a.get("snapWidth"), ctx) ?? "", color: colorOf(a, defaultColor), input: "",
      };
    }
    case "functiongraph": {
      onlyAttrs(a, ["color", "strokeColor", "strokeWidth", "dash"]);
      const [fn, from, to] = args;
      if (!fn || (fn.type !== "FunctionExpression" && fn.type !== "ArrowFunctionExpression") || fn.params.length !== 1 || fn.params[0].type !== "Identifier") {
        throw new Unsupported("Funktionsgraph");
      }
      const v = fn.params[0].name;
      const fctx = { ...ctx, variable: v };
      let body: ESTree.Expression;
      let dx = "0";
      let dy = "0";
      // vom Editor erzeugte Verschiebung: x = x - dx; return … + dy;
      if (fn.body.type === "BlockStatement" && fn.body.body.length === 2) {
        const [shift, ret] = fn.body.body;
        if (shift.type !== "ExpressionStatement" || shift.expression.type !== "AssignmentExpression" || ret.type !== "ReturnStatement" || !ret.argument) throw new Unsupported("Funktionskörper");
        const asg = shift.expression;
        if (asg.left.type !== "Identifier" || asg.left.name !== v || asg.right.type !== "BinaryExpression" || asg.right.operator !== "-"
          || asg.right.left.type !== "Identifier" || asg.right.left.name !== v) throw new Unsupported("Funktionskörper");
        dx = plainNum(asg.right.right, ctx)!;
        body = ret.argument;
      } else {
        body = returnedExpression(fn);
      }
      const termText = term(body, fctx);
      const fnEl: JsxElement = {
        kind: "function", id, name, term: termText, color: colorOf(a, defaultColor),
        width: plainNum(a.get("strokeWidth"), ctx) ?? "2", dashed: !!a.get("dash"),
        from: from ? fromTo(from, ctx, "-Infinity") : "", to: to ? fromTo(to, ctx, "Infinity") : "", dx, dy,
      };
      if (dx !== "0") {
        // bei Verschiebung endet der Term mit „+ dy“ – abtrennen, wenn es eine reine Zahl ist
        const m = /^(.*) \+ (-?\d+(?:\.\d+)?|\(-?\d+(?:\.\d+)?\))$/.exec(termText);
        if (m) { fnEl.term = m[1]; fnEl.dy = m[2].replace(/[()]/g, ""); }
      }
      return fnEl;
    }
    case "segment":
    case "line":
    case "arrow": {
      onlyAttrs(a, ["color", "strokeColor", "strokeWidth", "dash"]);
      const [p, q] = args;
      if (args.length !== 2 || p?.type !== "Identifier" || q?.type !== "Identifier" || !ctx.points.has(p.name) || !ctx.points.has(q.name)) throw new Unsupported("Linie");
      return { kind: "line", id, name, p1: p.name, p2: q.name, type, color: colorOf(a, defaultColor), dashed: !!a.get("dash") };
    }
    case "text": {
      onlyAttrs(a, ["fontSize"]);
      const [x, y, t] = args;
      if (args.length !== 3 || !x || !y || t?.type !== "Literal" || typeof t.value !== "string") throw new Unsupported("Text");
      return { kind: "text", id, name, x: coordinate(x, ctx), y: coordinate(y, ctx), text: t.value, size: plainNum(a.get("fontSize"), ctx) ?? "16" };
    }
  }
  throw new Unsupported(`Elementtyp ${type}`);
}

function fromTo(n: ESTree.Node, ctx: TermCtx, inf: string): string {
  if (n.type === "Identifier" && n.name === "Infinity") return "";
  if (n.type === "UnaryExpression" && n.operator === "-" && n.argument.type === "Identifier" && n.argument.name === "Infinity") return inf === "-Infinity" ? "" : "";
  return plainNum(n as ESTree.Expression, ctx)!;
}

// ---- Block ------------------------------------------------------------------------------------------------------

export function parseJsxBlock(block: string): ParseResult {
  const head = /^\s*\[\[\s*jsxgraph\b([^\]]*)\]\]/.exec(block);
  const tail = /\[\[\s*\/jsxgraph\s*\]\]\s*$/.exec(block);
  if (!head || !tail) return { ok: false, error: "Kein [[jsxgraph]]-Block" };
  const body = block.slice(head[0].length, tail.index).replace(MARKER_RE, "").replace(GENERATED_COMMENT, "");

  const model = newModel();
  model.elements = [];
  const refs = new Map<string, string>(); // Referenzvariable → Eingabe
  const extraAttrs: string[] = [];
  for (const m of head[1].matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) {
    const ref = /^input-ref-(\w+)$/.exec(m[1]);
    if (m[1] === "width") model.width = m[2];
    else if (m[1] === "height") model.height = m[2];
    else if (ref) refs.set(m[2], ref[1]);
    else extraAttrs.push(m[0]);
  }
  if (extraAttrs.length) model.extraAttrs = extraAttrs.join(" ");

  // STACK-Platzhalter {#…#} sind kein JavaScript – für den Parser durch Namen ersetzen
  const cas: string[] = [];
  const js = body.replace(/\{#[\s\S]*?#\}/g, (m) => { cas.push(m); return `__cas${cas.length - 1}__`.padEnd(m.length, " "); });
  const restore = (s: string) => s.replace(/__cas(\d+)__ */g, (_, i: string) => cas[Number(i)]);

  // Rückfall: der ganze Code bleibt als eigener Code – die Grafik lässt sich trotzdem öffnen und erhalten
  const wholeAsCode = (note: string): ParseResult => {
    const m = newModel();
    m.width = model.width;
    m.height = model.height;
    if (model.extraAttrs) m.extraAttrs = model.extraAttrs;
    m.boardInCode = true;
    m.boardVar = "";
    const code = body.replace(/^\s*\n/, "").trimEnd();
    m.elements = code.trim() ? [{ kind: "code", id: newId(), name: "", code }] : [];
    if (refs.size) m.extraRefs = [...refs].map(([ref, input]) => ({ input, ref }));
    return { ok: true, model: m, custom: m.elements.length, note };
  };

  let program: ESTree.Program;
  try {
    program = parse(js, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as ESTree.Program;
  } catch (e) {
    return wholeAsCode(`Der JavaScript-Code ließ sich nicht analysieren (${e instanceof Error ? e.message : e}) und bleibt vollständig als „Eigener Code“ erhalten.`);
  }

  const ctx: TermCtx = { cas, sliders: new Set(), points: new Set() };
  let boardFound = false;
  let boardVar = "";
  let custom = 0;
  let pendingCode = "";
  let lastEnd = 0;
  const flushCode = () => {
    const code = restore(pendingCode).replace(/^\s*\n/, "").trimEnd();
    if (code.trim()) { model.elements.push({ kind: "code", id: newId(), name: "", code }); custom++; }
    pendingCode = "";
  };
  const elements = new Map<string, JsxElement>();
  const usedRefs = new Set<string>();

  /** `var X = JXG.JSXGraph.initBoard(…)` (auch let/const) oder `X = JXG.JSXGraph.initBoard(…)` */
  const initBoardOf = (st: Node): { name: string; call: ESTree.CallExpression } | null => {
    let name = "";
    let call: ESTree.Expression | null | undefined = null;
    if (st.type === "VariableDeclaration" && st.declarations.length === 1 && st.declarations[0].id.type === "Identifier") {
      name = st.declarations[0].id.name;
      call = st.declarations[0].init;
    } else if (st.type === "ExpressionStatement" && st.expression.type === "AssignmentExpression" && st.expression.operator === "="
      && st.expression.left.type === "Identifier") {
      name = st.expression.left.name;
      call = st.expression.right;
    }
    if (!name || call?.type !== "CallExpression") return null;
    const callee = js.slice((call.callee as Node).start, (call.callee as Node).end).replace(/\s+/g, "");
    return /(^|\.)JSXGraph\.initBoard$/.test(callee) ? { name, call } : null;
  };

  for (const st of program.body as Node[]) {
    const gap = js.slice(lastEnd, st.start);
    const source = js.slice(st.start, st.end);
    lastEnd = st.end;
    const asCode = () => { pendingCode += gap + source; for (const r of refs.keys()) if (new RegExp(`\\b${r}\\b`).test(source)) usedRefs.add(r); };

    // Zeichenfläche
    const ib = !boardFound ? initBoardOf(st) : null;
    if (ib) {
      boardFound = true;
      boardVar = ib.name;
      try {
        const [div, optsNode] = ib.call.arguments;
        if (div?.type !== "Identifier" || div.name !== "divid" || ib.call.arguments.length > 2) throw new Unsupported("initBoard");
        const opts = attrsOf(optsNode as ESTree.Node | undefined);
        const extra: string[] = [];
        let bbox: JsxModel["bbox"] | null = null;
        let axis = false, grid = false, keep = false;
        for (const [k, v] of opts) {
          const vs = js.slice((v as Node).start, (v as Node).end);
          if (k === "boundingbox") {
            if (v.type !== "ArrayExpression" || v.elements.length !== 4) throw new Unsupported("boundingbox");
            bbox = v.elements.map((e) => plainNum(e as ESTree.Expression, ctx)!) as JsxModel["bbox"];
          } else if (k === "axis") axis = bool(v)!;
          else if (k === "grid") grid = bool(v)!;
          else if (k === "keepaspectratio" || k === "keepAspectRatio") keep = bool(v)!;
          else if (k === "showCopyright" || k === "showNavigation") { if (bool(v)) extra.push(`${k}: ${vs}`); }
          else extra.push(`${k}: ${restore(vs)}`);
        }
        if (bbox) model.bbox = bbox;
        model.axis = axis; model.grid = grid; model.keepAspect = keep;
        if (extra.length) model.boardOptions = extra.join(", ");
        if (gap.trim()) { pendingCode += gap; flushCode(); }
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e;
        // Optionen nicht als Formular abbildbar: initBoard bleibt unverändert im eigenen Code
        model.boardInCode = true;
        asCode();
      }
      continue;
    }

    // var X = <board>.create('typ', [...], {...});
    if (boardFound && boardVar && st.type === "VariableDeclaration" && st.declarations.length === 1) {
      const d = st.declarations[0];
      const init = d.init;
      if (d.id.type === "Identifier" && init?.type === "CallExpression" && init.callee.type === "MemberExpression"
        && init.callee.object.type === "Identifier" && init.callee.object.name === boardVar
        && init.callee.property.type === "Identifier" && init.callee.property.name === "create"
        && init.arguments[0]?.type === "Literal" && typeof init.arguments[0].value === "string"
        && init.arguments[1]?.type === "ArrayExpression" && !elements.has(d.id.name)) {
        try {
          const args = init.arguments[1].elements.map((e) => { if (!e || e.type === "SpreadElement") throw new Unsupported("Argument"); return e as ESTree.Node; });
          const el = element(d.id.name, init.arguments[0].value, args, init.arguments[2] as ESTree.Node | undefined, ctx);
          if (gap.trim()) { pendingCode += gap; }
          flushCode();
          model.elements.push(el);
          elements.set(el.name, el);
          if (el.kind === "slider") ctx.sliders.add(el.name);
          if (el.kind === "point") ctx.points.add(el.name);
          continue;
        } catch (e) {
          if (!(e instanceof Unsupported)) throw e;
        }
      }
    }

    // stack_jxg.bind_point(ref, P); bind_slider(ref, a); bind_list_of(ref, [A, B])
    if (st.type === "ExpressionStatement" && st.expression.type === "CallExpression") {
      const c = st.expression;
      const callee = js.slice((c.callee as Node).start, (c.callee as Node).end);
      const m = /^stack_jxg\.bind_(point|slider|list_of)$/.exec(callee);
      const refArg = c.arguments[0];
      if (m && refArg?.type === "Identifier" && refs.has(refArg.name)) {
        const input = refs.get(refArg.name)!;
        const targets = m[1] === "list_of"
          ? (c.arguments[1]?.type === "ArrayExpression" ? c.arguments[1].elements : [])
          : [c.arguments[1]];
        const els = targets.map((t) => (t?.type === "Identifier" ? elements.get(t.name) : undefined));
        const kindOk = els.length > 0 && els.every((el, i) =>
          el && (el.kind === "point" || el.kind === "slider") && !el.input
          && (m[1] === "list_of" || el.kind === m[1]) && targets[i]?.type === "Identifier");
        if (kindOk && c.arguments.length === 2) {
          for (const el of els) if (el && (el.kind === "point" || el.kind === "slider")) el.input = input;
          if (refArg.name !== `${input}Ref`) (model.extraRefs ??= []).push({ input, ref: refArg.name });
          if (gap.trim()) pendingCode += gap;
          continue;
        }
      }
    }

    asCode();
  }
  pendingCode += js.slice(lastEnd);
  flushCode();

  if (!boardFound) {
    return wholeAsCode("Im Code wurde kein „JXG.JSXGraph.initBoard(divid, …)“ gefunden. Die Grafik bleibt vollständig als „Eigener Code“ erhalten.");
  }
  model.boardVar = boardVar;

  // input-refs, die nur eigener Code verwendet, im Blockkopf erhalten
  for (const ref of usedRefs) {
    const input = refs.get(ref)!;
    if (!(model.extraRefs ?? []).some((r) => r.input === input)) (model.extraRefs ??= []).push({ input, ref });
  }

  // Abschließend: der erzeugte Code muss fehlerfrei sein – sonst sicherheitshalber alles als eigenen Code übernehmen
  const gen = generateJsx(model);
  if (gen.errors.length) return wholeAsCode(`Teile der Grafik ließen sich nicht sicher abbilden (${gen.errors[0].message}). Sie bleibt vollständig als „Eigener Code“ erhalten.`);
  const note = model.boardInCode
    ? "Die Zeichenfläche wird im eigenen Code angelegt (ihre Optionen lassen sich nicht als Formular darstellen). Elemente können trotzdem ergänzt und bearbeitet werden."
    : undefined;
  return { ok: true, model, custom, note };
}
