// Lokaler Maxima-Auswerter für die Live-Vorschau.
// Bildet die in STACK-Aufgaben üblichen Funktionen nach – kein vollständiges CAS.

import {
  type Expr, bool, call, callName, flt, int, isNumeric, isRelation, list, numValue, ONE, str, sym, ZERO,
} from "./types.ts";
import {
  add, compareForSort, div, equal, gcd, isOne, isZero, key, makeSet, mul, neg, pow, rat, simplify, sub,
} from "./simp.ts";
import { parseExpression, parseStatements } from "./parser.ts";
import { toMaxima } from "./print.ts";
import { LocalizedError, type MessageKey, type Msg, type Params, errorMsg } from "../i18n/index.ts";

/** Auswertungsfehler; `.msg` für die Anzeige, `.message` bleibt deutsch. */
export class MaximaError extends LocalizedError {
  constructor(key: MessageKey, params?: Params) {
    super(key, params);
    this.name = "MaximaError";
  }
}

const INDEX: Msg = { key: "lib.eval.index" };

// ---- Zufall -----------------------------------------------------------------

export function seededRng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Umgebung ---------------------------------------------------------------

export interface UserFunction { params: string[]; body: Expr }

export class Env {
  vars = new Map<string, Expr>();
  funcs = new Map<string, UserFunction>();
  constructor(public parent: Env | null = null) {}

  lookup(name: string): Expr | undefined {
    for (let e: Env | null = this; e; e = e.parent) {
      const v = e.vars.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  lookupFunc(name: string): UserFunction | undefined {
    for (let e: Env | null = this; e; e = e.parent) {
      const v = e.funcs.get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  /** Zuweisung: lokale Variable, falls vorhanden, sonst global. */
  assign(name: string, v: Expr) {
    for (let e: Env | null = this; e; e = e.parent) {
      if (e.vars.has(name) || !e.parent) {
        e.vars.set(name, v);
        return;
      }
    }
  }
  root(): Env {
    let e: Env = this;
    while (e.parent) e = e.parent;
    return e;
  }
  clone(): Env {
    const c = new Env(this.parent);
    c.vars = new Map(this.vars);
    c.funcs = new Map(this.funcs);
    return c;
  }
}

export interface Ctx {
  rng: () => number;
  simp: boolean;
  /** Hinweise der lokalen Vorschau, je Meldung einmal (Schlüssel: JSON der Meldung). */
  warnings: Map<string, Msg>;
  steps: number;
  depth: number;
}

export function makeCtx(seed: number, simp = true): Ctx {
  return { rng: seededRng(seed), simp, warnings: new Map(), steps: 0, depth: 0 };
}

function warn(ctx: Ctx, m: Msg) {
  ctx.warnings.set(JSON.stringify(m), m);
}

const MAX_STEPS = 500_000;

// ---- Hilfsfunktionen ----------------------------------------------------------

const asInt = (e: Expr, fn: string | Msg): number => {
  if (e.k === "num" && e.d === 1) return e.n;
  if (e.k === "float" && Number.isInteger(e.v)) return e.v;
  throw new MaximaError("lib.eval.intExpected", { fn, got: toMaxima(e) });
};
const asList = (e: Expr, fn: string): Expr[] => {
  if (e.k === "list" || e.k === "set") return e.items;
  throw new MaximaError("lib.eval.listExpected", { fn, got: toMaxima(e) });
};
const asStr = (e: Expr, fn: string): string => {
  if (e.k === "str") return e.v;
  throw new MaximaError("lib.eval.stringExpected", { fn, got: toMaxima(e) });
};
const asNum = (e: Expr, fn: string): number => {
  const v = numericValue(e);
  if (Number.isNaN(v)) throw new MaximaError("lib.eval.numberExpected", { fn, got: toMaxima(e) });
  return v;
};
const sameKind = (src: Expr, items: Expr[]): Expr => (src.k === "set" ? makeSet(items) : list(items));

function argCount(fn: string, args: Expr[], min: number, max = min) {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : `${min}–${max}`;
    throw new MaximaError("lib.eval.argCount", { fn, want, got: args.length });
  }
}

/** Numerischer Wert eines Ausdrucks (NaN, wenn nicht numerisch). */
export function numericValue(e: Expr, vars?: Map<string, number>): number {
  switch (e.k) {
    case "num": return e.n / e.d;
    case "float": return e.v;
    case "sym":
      if (vars?.has(e.name)) return vars.get(e.name)!;
      if (e.name === "%pi") return Math.PI;
      if (e.name === "%e") return Math.E;
      if (e.name === "%phi") return (1 + Math.sqrt(5)) / 2;
      if (e.name === "inf") return Infinity;
      if (e.name === "minf") return -Infinity;
      return NaN;
    case "op": {
      const a = e.args.map((x) => numericValue(x, vars));
      switch (e.op) {
        case "+": return a.reduce((s, x) => s + x, 0);
        case "*": return a.reduce((s, x) => s * x, 1);
        case "^": {
          const [b, x] = a;
          if (b < 0 && !Number.isInteger(x)) {
            // reelle ungerade Wurzeln negativer Zahlen
            const ex = e.args[1];
            if (ex.k === "num" && ex.d % 2 === 1) return -Math.pow(-b, x);
            return NaN;
          }
          return Math.pow(b, x);
        }
        case "neg": return -a[0];
        case "-": return a[0] - a[1];
        case "/": return a[0] / a[1];
        case "!": return factorialNum(a[0]);
      }
      return NaN;
    }
    case "call": {
      const name = callName(e);
      const a = e.args.map((x) => numericValue(x, vars));
      const f = name ? NUM_FUNCS[name] : undefined;
      return f ? f(...a) : NaN;
    }
    default: return NaN;
  }
}

function factorialNum(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

const NUM_FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  cot: (x) => 1 / Math.tan(x), sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, lg: (x, b = 10) => Math.log(x) / Math.log(b),
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceiling: Math.ceil, round: Math.round,
  signum: Math.sign, max: Math.max, min: Math.min, factorial: factorialNum,
  binomial: (n, k) => factorialNum(n) / (factorialNum(k) * factorialNum(n - k)),
};

function freeSymbols(e: Expr, out = new Set<string>()): Set<string> {
  switch (e.k) {
    case "sym": if (!["%pi", "%e", "%i", "inf", "minf", "%phi"].includes(e.name)) out.add(e.name); break;
    case "list": case "set": e.items.forEach((x) => freeSymbols(x, out)); break;
    case "op": e.args.forEach((x) => freeSymbols(x, out)); break;
    case "call": e.args.forEach((x) => freeSymbols(x, out)); break;
    case "index": freeSymbols(e.target, out); break;
  }
  return out;
}
export { freeSymbols };

// ---- Prädikate --------------------------------------------------------------

/** Wahrheitswert wie Maximas is(): true, false oder null (unbekannt). */
export function truth(e: Expr): boolean | null {
  if (e.k === "bool") return e.v;
  if (e.k === "op") {
    switch (e.op) {
      case "and": {
        let unknown = false;
        for (const a of e.args) {
          const t = truth(a);
          if (t === false) return false;
          if (t === null) unknown = true;
        }
        return unknown ? null : true;
      }
      case "or": {
        let unknown = false;
        for (const a of e.args) {
          const t = truth(a);
          if (t === true) return true;
          if (t === null) unknown = true;
        }
        return unknown ? null : false;
      }
      case "not": {
        const t = truth(e.args[0]);
        return t === null ? null : !t;
      }
      case "=": case "#": {
        const [l, r] = e.args;
        const lv = numericValue(l), rv = numericValue(r);
        let eq: boolean;
        if (!Number.isNaN(lv) && !Number.isNaN(rv) && isNumeric(l) && isNumeric(r)) eq = lv === rv;
        else eq = equal(l, r);
        return e.op === "=" ? eq : !eq;
      }
      case "<": case ">": case "<=": case ">=": {
        const lv = numericValue(e.args[0]), rv = numericValue(e.args[1]);
        if (Number.isNaN(lv) || Number.isNaN(rv)) return null;
        switch (e.op) {
          case "<": return lv < rv;
          case ">": return lv > rv;
          case "<=": return lv <= rv;
          default: return lv >= rv;
        }
      }
    }
  }
  return null;
}

// ---- Auswertung --------------------------------------------------------------

export function evaluate(e: Expr, env: Env, ctx: Ctx): Expr {
  if (++ctx.steps > MAX_STEPS) throw new MaximaError("lib.eval.tooManySteps");
  switch (e.k) {
    case "num": case "float": case "str": case "bool":
      return e;
    case "sym": {
      const v = env.lookup(e.name);
      if (v !== undefined) return v;
      if (e.name === "simp") return bool(ctx.simp);
      return e;
    }
    case "list":
      return list(e.items.map((x) => evaluate(x, env, ctx)));
    case "set":
      return makeSet(e.items.map((x) => evaluate(x, env, ctx)));
    case "quote":
      return e.e;
    case "seq": {
      let r: Expr = ZERO;
      for (const it of e.items) r = evaluate(it, env, ctx);
      return r;
    }
    case "index": {
      const t = evaluate(e.target, env, ctx);
      const idx = e.idx.map((x) => evaluate(x, env, ctx));
      return indexInto(t, idx, e);
    }
    case "if": {
      for (let i = 0; i < e.conds.length; i++) {
        const c = evaluate(e.conds[i], env, ctx);
        const t = truth(c);
        if (t === null) {
          throw new MaximaError("lib.eval.ifUndecidable", { cond: toMaxima(c) });
        }
        if (t) return evaluate(e.thens[i], env, ctx);
      }
      return e.els ? evaluate(e.els, env, ctx) : bool(false);
    }
    case "for":
      return evalFor(e, env, ctx);
    case "op":
      return evalOp(e, env, ctx);
    case "call":
      return evalCall(e, env, ctx);
  }
}

function indexInto(t: Expr, idx: Expr[], orig: Expr): Expr {
  if (t.k === "list" && idx.length >= 1) {
    const i = asInt(idx[0], INDEX);
    if (i < 1 || i > t.items.length) {
      throw new MaximaError("lib.eval.indexOutOfList", { i, length: t.items.length });
    }
    const v = t.items[i - 1];
    return idx.length > 1 ? indexInto(v, idx.slice(1), orig) : v;
  }
  if (callName(t) === "matrix" && t.k === "call") {
    const i = asInt(idx[0], INDEX);
    const row = t.args[i - 1];
    if (!row) throw new MaximaError("lib.eval.rowOutOfMatrix", { i });
    return idx.length > 1 ? indexInto(row, idx.slice(1), orig) : row;
  }
  if (t.k === "sym") return { k: "index", target: t, idx };
  throw new MaximaError("lib.eval.notIndexable", { expr: toMaxima(t) });
}

function evalFor(e: Extract<Expr, { k: "for" }>, env: Env, ctx: Ctx): Expr {
  const local = new Env(env);
  const check = () => {
    if (e.whileC && truth(evaluate(e.whileC, local, ctx)) !== true) return false;
    if (e.unless && truth(evaluate(e.unless, local, ctx)) === true) return false;
    return true;
  };
  if (e.inList && e.v) {
    const l = evaluate(e.inList, env, ctx);
    for (const it of asList(l, "for ... in")) {
      local.vars.set(e.v, it);
      if (!check()) break;
      const r = evaluate(e.body, local, ctx);
      if (callName(r) === "return") return (r as { args: Expr[] }).args[0] ?? bool(true);
    }
    return sym("done");
  }
  let cur: Expr = e.from ? evaluate(e.from, env, ctx) : ONE;
  const step = e.step ? evaluate(e.step, env, ctx) : ONE;
  const thru = e.thru ? evaluate(e.thru, env, ctx) : null;
  let guard = 0;
  for (;;) {
    if (e.v) local.vars.set(e.v, cur);
    if (thru) {
      const s = numericValue(step);
      const c = numericValue(cur), tv = numericValue(thru);
      if (s >= 0 ? c > tv : c < tv) break;
    }
    if (!check()) break;
    const r = evaluate(e.body, local, ctx);
    if (callName(r) === "return") return (r as { args: Expr[] }).args[0] ?? bool(true);
    cur = add([cur, step]);
    if (++guard > 100_000) throw new MaximaError("lib.eval.forTooMany");
  }
  return sym("done");
}

function arith(opName: string, args: Expr[], ctx: Ctx): Expr {
  if (!ctx.simp) return { k: "op", op: opName, args };
  switch (opName) {
    case "+": return add(args);
    case "*": return mul(args);
    case "-": return sub(args[0], args[1]);
    case "/": return div(args[0], args[1]);
    case "^": return pow(args[0], args[1]);
    case "neg": return neg(args[0]);
  }
  return { k: "op", op: opName, args };
}

function evalOp(e: Extract<Expr, { k: "op" }>, env: Env, ctx: Ctx): Expr {
  const o = e.op;
  if (o === ":") {
    const [lhs, rhs] = e.args;
    const v = evaluate(rhs, env, ctx);
    if (lhs.k === "sym") {
      if (lhs.name === "simp") { ctx.simp = v.k === "bool" ? v.v : true; return v; }
      env.assign(lhs.name, v);
      return v;
    }
    if (lhs.k === "index" && lhs.target.k === "sym") {
      const cur = env.lookup(lhs.target.name);
      const idx = lhs.idx.map((x) => evaluate(x, env, ctx));
      if (cur && cur.k === "list") {
        const i = asInt(idx[0], INDEX);
        const items = [...cur.items];
        if (i < 1 || i > items.length) throw new MaximaError("lib.eval.indexOutOfListShort", { i });
        items[i - 1] = v;
        env.assign(lhs.target.name, list(items));
        return v;
      }
      throw new MaximaError("lib.eval.indexAssignListsOnly", { name: lhs.target.name });
    }
    throw new MaximaError("lib.eval.invalidAssignTarget", { expr: toMaxima(lhs) });
  }
  if (o === ":=") {
    const [lhs, body] = e.args;
    if (lhs.k === "call" && lhs.fn.k === "sym") {
      const params = lhs.args.map((a) => {
        if (a.k !== "sym") throw new MaximaError("lib.eval.paramsMustBeNames");
        return a.name;
      });
      env.root().funcs.set(lhs.fn.name, { params, body });
      return lhs;
    }
    throw new MaximaError("lib.eval.invalidFunctionDef", { expr: toMaxima(lhs) });
  }
  if (o === "and" || o === "or") {
    // Kurzschlussauswertung wie Maxima
    const results: Expr[] = [];
    for (const a of e.args) {
      const v = evaluate(a, env, ctx);
      const t = truth(v);
      if (o === "and" && t === false) return bool(false);
      if (o === "or" && t === true) return bool(true);
      results.push(t === null ? v : bool(t));
    }
    const unknown = results.filter((r) => r.k !== "bool");
    if (!unknown.length) return bool(o === "and");
    return unknown.length === 1 ? unknown[0] : { k: "op", op: o, args: unknown };
  }
  const args = e.args.map((a) => evaluate(a, env, ctx));
  if (o === "not") {
    const t = truth(args[0]);
    return t === null ? { k: "op", op: "not", args } : bool(!t);
  }
  if (["+", "*", "-", "/", "^", "neg"].includes(o)) {
    if (args.some((a) => a.k === "str")) {
      throw new MaximaError("lib.eval.stringArithmetic", { op: o === "neg" ? "-" : o });
    }
    return arith(o, args, ctx);
  }
  if (o === "!") {
    const a = args[0];
    if (a.k === "num" && a.d === 1 && a.n >= 0) return int(factorialNum(a.n));
    return { k: "op", op: "!", args };
  }
  // Relationen, ".", "^^" bleiben symbolisch
  return { k: "op", op: o, args };
}

function applyFunction(f: UserFunction, args: Expr[], env: Env, ctx: Ctx, name: string): Expr {
  if (args.length !== f.params.length) {
    throw new MaximaError("lib.eval.argCount", { fn: name, want: f.params.length, got: args.length });
  }
  if (++ctx.depth > 200) throw new MaximaError("lib.eval.recursionTooDeep");
  const local = new Env(env.root());
  f.params.forEach((p, i) => local.vars.set(p, args[i]));
  try {
    return evaluate(f.body, local, ctx);
  } finally {
    ctx.depth--;
  }
}

/** Ruft eine Funktion (Name, Lambda oder Operator-String) mit ausgewerteten Argumenten auf. */
export function applyAny(fn: Expr, args: Expr[], env: Env, ctx: Ctx): Expr {
  if (fn.k === "str") {
    const o = fn.v;
    if (o === "+") return args.length ? arith("+", args, ctx) : ZERO;
    if (o === "*") return args.length ? arith("*", args, ctx) : ONE;
    if (["-", "/", "^", "=", "#", "<", ">", "<=", ">=", "and", "or"].includes(o)) {
      return evalOp({ k: "op", op: o, args: args.map((a) => ({ k: "quote", e: a }) as Expr) }, env, ctx);
    }
    return applyAny(sym(o), args, env, ctx);
  }
  if (fn.k === "call" && callName(fn) === "lambda") {
    const [params, ...body] = fn.args;
    const names = asList(params, "lambda").map((p) => (p.k === "sym" ? p.name : "_"));
    const local = new Env(env);
    names.forEach((p, i) => local.vars.set(p, args[i] ?? ZERO));
    let r: Expr = ZERO;
    for (const b of body) r = evaluate(b, local, ctx);
    return r;
  }
  if (fn.k === "sym") {
    return evalCall({ k: "call", fn, args: args.map((a) => ({ k: "quote", e: a }) as Expr) }, env, ctx);
  }
  throw new MaximaError("lib.eval.notCallable", { expr: toMaxima(fn) });
}

function evalCall(e: Extract<Expr, { k: "call" }>, env: Env, ctx: Ctx): Expr {
  if (e.fn.k !== "sym") {
    const f = evaluate(e.fn, env, ctx);
    return applyAny(f, e.args.map((a) => evaluate(a, env, ctx)), env, ctx);
  }
  const name = e.fn.name;
  const special = SPECIAL[name];
  if (special) return special(e.args, env, ctx);

  const user = env.lookupFunc(name);
  const args = e.args.map((a) => evaluate(a, env, ctx));
  if (user) return applyFunction(user, args, env, ctx, name);

  // Variable, die ein Lambda enthält
  const v = env.lookup(name);
  if (v && callName(v) === "lambda") return applyAny(v, args, env, ctx);

  const builtin = BUILTINS[name];
  if (builtin) return builtin(args, ctx, env);
  if (!KNOWN_SYMBOLIC.has(name)) {
    warn(ctx, { key: "lib.eval.notEvaluatedLocally", params: { name } });
  }
  return { k: "call", fn: e.fn, args };
}

// Funktionen, die bewusst symbolisch bleiben (keine Warnung)
const KNOWN_SYMBOLIC = new Set([
  "f", "g", "h", "u", "v", "y", "matrix", "stackunits", "nounint", "noundiff", "limit", "integrate_noun",
  "sin", "cos", "tan", "cot", "sec", "csc", "asin", "acos", "atan", "sinh", "cosh", "tanh",
  "exp", "log", "ln", "lg", "sqrt", "abs", "floor", "ceiling", "signum", "return", "texsub", "stack_disp",
  "dispdp", "displaydp", "dispsf",
]);

// ---- Spezialformen (Argumente werden nicht vorab ausgewertet) ---------------

type Special = (raw: Expr[], env: Env, ctx: Ctx) => Expr;

function iterValues(spec: Expr[], env: Env, ctx: Ctx, fn: string): { v: string; values: Expr[] } {
  const [vRaw, a, b, step] = spec;
  if (!vRaw || vRaw.k !== "sym") throw new MaximaError("lib.eval.loopVariableExpected", { fn });
  if (b === undefined) {
    const l = evaluate(a, env, ctx);
    if (l.k === "num") {
      const n = asInt(l, fn);
      return { v: vRaw.name, values: Array.from({ length: n }, (_, i) => int(i + 1)) };
    }
    return { v: vRaw.name, values: asList(l, fn) };
  }
  const from = evaluate(a, env, ctx);
  const to = evaluate(b, env, ctx);
  const st = step ? evaluate(step, env, ctx) : ONE;
  const values: Expr[] = [];
  const s = asNum(st, fn);
  if (s === 0) throw new MaximaError("lib.eval.zeroStep", { fn });
  let cur = from;
  for (let i = 0; i < 100_000; i++) {
    const c = asNum(cur, fn), t = asNum(to, fn);
    if (s > 0 ? c > t + 1e-12 : c < t - 1e-12) break;
    values.push(cur);
    cur = add([cur, st]);
  }
  return { v: vRaw.name, values };
}

const SPECIAL: Record<string, Special> = {
  block(raw, env, ctx) {
    const local = new Env(env);
    let body = raw;
    if (raw[0]?.k === "list") {
      for (const v of raw[0].items) {
        if (v.k === "sym") local.vars.set(v.name, v);
        else if (v.k === "op" && v.op === ":" && v.args[0].k === "sym") {
          local.vars.set(v.args[0].name, evaluate(v.args[1], env, ctx));
        }
      }
      body = raw.slice(1);
    }
    let r: Expr = ZERO;
    for (const b of body) {
      r = evaluate(b, local, ctx);
      if (callName(r) === "return") return (r as { args: Expr[] }).args[0] ?? bool(true);
    }
    return r;
  },
  lambda(raw) {
    return { k: "call", fn: sym("lambda"), args: raw };
  },
  makelist(raw, env, ctx) {
    if (raw.length === 0) return list([]);
    if (raw.length === 1) return list([evaluate(raw[0], env, ctx)]);
    if (raw.length === 2) {
      const n = asInt(evaluate(raw[1], env, ctx), "makelist");
      return list(Array.from({ length: n }, () => evaluate(raw[0], env, ctx)));
    }
    const { v, values } = iterValues(raw.slice(1), env, ctx, "makelist");
    const local = new Env(env);
    return list(values.map((x) => {
      local.vars.set(v, x);
      return evaluate(raw[0], local, ctx);
    }));
  },
  create_list(raw, env, ctx) {
    return SPECIAL.makelist(raw, env, ctx);
  },
  sum(raw, env, ctx) {
    argCount("sum", raw, 4);
    const lo = evaluate(raw[2], env, ctx), hi = evaluate(raw[3], env, ctx);
    if (!isNumeric(lo) || !isNumeric(hi)) {
      return { k: "call", fn: sym("sum"), args: [raw[0], raw[1], lo, hi] };
    }
    const { v, values } = iterValues(raw.slice(1), env, ctx, "sum");
    const local = new Env(env);
    return add(values.map((x) => { local.vars.set(v, x); return evaluate(raw[0], local, ctx); }));
  },
  product(raw, env, ctx) {
    argCount("product", raw, 4);
    const lo = evaluate(raw[2], env, ctx), hi = evaluate(raw[3], env, ctx);
    if (!isNumeric(lo) || !isNumeric(hi)) {
      return { k: "call", fn: sym("product"), args: [raw[0], raw[1], lo, hi] };
    }
    const { v, values } = iterValues(raw.slice(1), env, ctx, "product");
    const local = new Env(env);
    return mul(values.map((x) => { local.vars.set(v, x); return evaluate(raw[0], local, ctx); }));
  },
  is(raw, env, ctx) {
    const v = evaluate(raw[0], env, ctx);
    const t = truth(v);
    return t === null ? sym("unknown") : bool(t);
  },
  ev(raw, env, ctx) {
    const flags = new Set<string>();
    const local = new Env(env);
    for (const r of raw.slice(1)) {
      if (r.k === "sym") flags.add(r.name);
      else if (r.k === "op" && (r.op === "=" || r.op === ":") && r.args[0].k === "sym") {
        local.vars.set(r.args[0].name, evaluate(r.args[1], env, ctx));
      } else if (r.k === "list") {
        for (const it of r.items) {
          if (it.k === "op" && it.op === "=" && it.args[0].k === "sym") {
            local.vars.set(it.args[0].name, evaluate(it.args[1], env, ctx));
          }
        }
      }
    }
    const prevSimp = ctx.simp;
    if (flags.has("simp")) ctx.simp = true;
    try {
      let v = evaluate(raw[0], local, ctx);
      if (local.vars.size) v = evaluate(v, local, ctx);
      if (flags.has("simp")) v = simplify(v);
      if (flags.has("expand")) v = expand(v);
      if (flags.has("numer") || flags.has("float")) v = toFloat(v);
      return v;
    } finally {
      ctx.simp = prevSimp;
    }
  },
  define(raw, env, ctx) {
    const [lhs, body] = raw;
    if (lhs?.k === "call" && lhs.fn.k === "sym") {
      const params = lhs.args.map((a) => (a.k === "sym" ? a.name : "_"));
      env.root().funcs.set(lhs.fn.name, { params, body: evaluate(body, env, ctx) });
      return lhs;
    }
    throw new MaximaError("lib.eval.defineHeadExpected");
  },
  subst(raw, env, ctx) {
    const args = raw.map((r) => evaluate(r, env, ctx));
    let pairs: [Expr, Expr][] = [];
    let target: Expr;
    if (args.length === 3) {
      pairs = [[args[1], args[0]]];
      target = args[2];
    } else {
      argCount("subst", args, 2);
      const eqs = args[0].k === "list" ? args[0].items : [args[0]];
      pairs = eqs.map((q) => {
        if (q.k !== "op" || q.op !== "=") throw new MaximaError("lib.eval.substEquationExpected");
        return [q.args[0], q.args[1]];
      });
      target = args[1];
    }
    let r = target;
    for (const [from, to] of pairs) r = substitute(r, from, to);
    return ctx.simp ? simplify(r) : r;
  },
  at(raw, env, ctx) {
    return SPECIAL.subst([raw[1], raw[0]], env, ctx);
  },
  errcatch(raw, env, ctx) {
    try {
      let r: Expr = ZERO;
      for (const x of raw) r = evaluate(x, env, ctx);
      return list([r]);
    } catch {
      return list([]);
    }
  },
};

export function substitute(e: Expr, from: Expr, to: Expr): Expr {
  if (equal(e, from)) return to;
  switch (e.k) {
    case "list": return list(e.items.map((x) => substitute(x, from, to)));
    case "set": return { k: "set", items: e.items.map((x) => substitute(x, from, to)) };
    case "op": return { k: "op", op: e.op, args: e.args.map((x) => substitute(x, from, to)) };
    case "call": return { k: "call", fn: e.fn, args: e.args.map((x) => substitute(x, from, to)) };
    default: return e;
  }
}

// ---- Algebraische Werkzeuge -----------------------------------------------------

function distribute(a: Expr, b: Expr): Expr {
  const as = a.k === "op" && a.op === "+" ? a.args : [a];
  const bs = b.k === "op" && b.op === "+" ? b.args : [b];
  const terms: Expr[] = [];
  for (const x of as) for (const y of bs) terms.push(mul([x, y]));
  return add(terms);
}

export function expand(e: Expr): Expr {
  switch (e.k) {
    case "list": return list(e.items.map(expand));
    case "op": {
      if (e.op === "+") return add(e.args.map(expand));
      if (e.op === "*") {
        let r: Expr = ONE;
        for (const f of e.args.map(expand)) {
          r = distribute(r, f);
          if (r.k === "op" && r.args.length > 5000) throw new MaximaError("lib.eval.expandTooLarge");
        }
        return r;
      }
      if (e.op === "^") {
        const b = expand(e.args[0]);
        const ex = e.args[1];
        if (b.k === "op" && b.op === "+" && ex.k === "num" && ex.d === 1 && ex.n > 1 && ex.n <= 30) {
          let r: Expr = b;
          for (let i = 1; i < ex.n; i++) r = distribute(r, b);
          return r;
        }
        if (b.k === "op" && b.op === "+" && ex.k === "num" && ex.d === 1 && ex.n < -1 && ex.n >= -30) {
          return pow(expand(pow(b, int(-ex.n))), int(-1));
        }
        return pow(b, ex);
      }
      return { k: "op", op: e.op, args: e.args.map(expand) };
    }
    case "call": return { k: "call", fn: e.fn, args: e.args.map(expand) };
    default: return e;
  }
}

function dependsOn(e: Expr, v: string): boolean {
  return freeSymbols(e).has(v);
}

export function diff(e: Expr, v: string): Expr {
  if (!dependsOn(e, v)) return ZERO;
  switch (e.k) {
    case "sym": return e.name === v ? ONE : ZERO;
    case "list": return list(e.items.map((x) => diff(x, v)));
    case "op": {
      const a = e.args;
      switch (e.op) {
        case "+": return add(a.map((x) => diff(x, v)));
        case "*": {
          const terms: Expr[] = [];
          a.forEach((f, i) => {
            const df = diff(f, v);
            if (isZero(df)) return;
            terms.push(mul([...a.slice(0, i), df, ...a.slice(i + 1)]));
          });
          return add(terms);
        }
        case "^": {
          const [b, ex] = a;
          if (!dependsOn(ex, v)) return mul([ex, pow(b, add([ex, int(-1)])), diff(b, v)]);
          // d/dx b^ex = b^ex * (ex' ln b + ex b'/b)
          return mul([e, add([mul([diff(ex, v), call("log", b)]), mul([ex, diff(b, v), pow(b, int(-1))])])]);
        }
        case "=": return { k: "op", op: "=", args: a.map((x) => diff(x, v)) };
      }
      break;
    }
    case "call": {
      const n = callName(e);
      const u = e.args[0];
      const du = u ? diff(u, v) : ZERO;
      const chain = (outer: Expr) => mul([outer, du]);
      switch (n) {
        case "sin": return chain(call("cos", u));
        case "cos": return chain(neg(call("sin", u)));
        case "tan": return chain(pow(call("cos", u), int(-2)));
        case "exp": return chain(pow(sym("%e"), u));
        case "log": case "ln": return chain(pow(u, int(-1)));
        case "sqrt": return chain(div(ONE, mul([int(2), pow(u, rat(1, 2))])));
        case "asin": return chain(pow(sub(ONE, pow(u, int(2))), rat(-1, 2)));
        case "acos": return chain(neg(pow(sub(ONE, pow(u, int(2))), rat(-1, 2))));
        case "atan": return chain(pow(add([ONE, pow(u, int(2))]), int(-1)));
        case "sinh": return chain(call("cosh", u));
        case "cosh": return chain(call("sinh", u));
        case "abs": return chain(call("signum", u));
      }
      return { k: "call", fn: sym("diff"), args: [e, sym(v)] };
    }
  }
  return { k: "call", fn: sym("diff"), args: [e, sym(v)] };
}

/** Sehr einfache Integration für Polynome und Grundfunktionen. */
function integrate(e: Expr, v: string): Expr | null {
  if (!dependsOn(e, v)) return mul([e, sym(v)]);
  if (e.k === "sym" && e.name === v) return mul([rat(1, 2), pow(e, int(2))]);
  if (e.k === "op" && e.op === "+") {
    const parts = e.args.map((t) => integrate(t, v));
    return parts.every(Boolean) ? add(parts as Expr[]) : null;
  }
  if (e.k === "op" && e.op === "*") {
    const c = e.args.filter((f) => !dependsOn(f, v));
    const rest = e.args.filter((f) => dependsOn(f, v));
    if (c.length && rest.length) {
      const r = integrate(rest.length === 1 ? rest[0] : mul(rest), v);
      return r ? mul([...c, r]) : null;
    }
    return null;
  }
  if (e.k === "op" && e.op === "^" && e.args[0].k === "sym" && e.args[0].name === v && !dependsOn(e.args[1], v)) {
    const ex = e.args[1];
    if (ex.k === "num" && ex.n === -1 && ex.d === 1) return call("log", e.args[0]);
    const n1 = add([ex, ONE]);
    return mul([pow(n1, int(-1)), pow(e.args[0], n1)]);
  }
  if (e.k === "op" && e.op === "^" && e.args[0].k === "sym" && e.args[0].name === "%e") {
    const ex = e.args[1];
    const d = diff(ex, v);
    if (!dependsOn(d, v)) return mul([pow(d, int(-1)), e]);
  }
  const n = callName(e);
  if (e.k === "call" && e.args[0]?.k === "sym" && e.args[0].name === v) {
    const x = e.args[0];
    if (n === "sin") return neg(call("cos", x));
    if (n === "cos") return call("sin", x);
    if (n === "exp") return pow(sym("%e"), x);
  }
  return null;
}

/** Wandelt alle numerisch auswertbaren Teilausdrücke in Gleitkommazahlen. */
export function toFloat(e: Expr): Expr {
  switch (e.k) {
    case "num": return flt(e.n / e.d);
    case "sym": {
      const v = numericValue(e);
      return Number.isNaN(v) || !Number.isFinite(v) ? e : flt(v);
    }
    case "list": return list(e.items.map(toFloat));
    case "set": return { k: "set", items: e.items.map(toFloat) };
    case "op": case "call": {
      const v = numericValue(e);
      if (!Number.isNaN(v) && Number.isFinite(v)) return flt(v);
      if (e.k === "op") {
        const args = e.args.map(toFloat);
        return simplify({ k: "op", op: e.op, args });
      }
      return { k: "call", fn: e.fn, args: e.args.map(toFloat) };
    }
    default: return e;
  }
}

function roundTo(x: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f;
}
function sigFigs(x: number, n: number): number {
  if (x === 0) return 0;
  return Number(x.toPrecision(n));
}

function mcqFilter(ta: Expr, want: boolean): Expr {
  const items = asList(ta, "mcq");
  return list(items.filter((it) => {
    const parts = asList(it, "mcq");
    return truth(parts[1] ?? bool(false)) === want;
  }).map((it) => asList(it, "mcq")[0]));
}

function ifactors(n: number): Expr {
  const res: Expr[] = [];
  let m = Math.abs(n);
  for (let p = 2; p * p <= m; p++) {
    let c = 0;
    while (m % p === 0) { m /= p; c++; }
    if (c) res.push(list([int(p), int(c)]));
  }
  if (m > 1) res.push(list([int(m), ONE]));
  return list(res);
}
function isPrime(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return false;
  return true;
}

function evalTrig(name: string, args: Expr[], ctx: Ctx): Expr {
  const a = args[0];
  if (a && a.k === "float") return flt(NUM_FUNCS[name](a.v));
  if (a && isZero(a)) {
    if (["sin", "tan", "asin", "atan", "sinh", "tanh"].includes(name)) return ZERO;
    if (["cos", "cosh", "exp"].includes(name)) return ONE;
  }
  if (a && a.k === "sym" && a.name === "%pi") {
    if (name === "sin" || name === "tan") return ZERO;
    if (name === "cos") return int(-1);
  }
  if (name === "log" && a) {
    if (isOne(a) && a.k === "num") return ZERO;
    if (a.k === "sym" && a.name === "%e") return ONE;
    if (a.k === "op" && a.op === "^" && a.args[0].k === "sym" && a.args[0].name === "%e") return a.args[1];
  }
  if (name === "exp" && a && ctx.simp) return pow(sym("%e"), a);
  return { k: "call", fn: sym(name), args };
}

type Builtin = (args: Expr[], ctx: Ctx, env: Env) => Expr;

const BUILTINS: Record<string, Builtin> = {
  // ---- Zufall
  rand(args, ctx) {
    argCount("rand", args, 1);
    const a = args[0];
    if (a.k === "num" && a.d === 1) {
      if (a.n <= 0) throw new MaximaError("lib.eval.randPositive");
      return int(Math.floor(ctx.rng() * a.n));
    }
    if (a.k === "float") return flt(ctx.rng() * a.v);
    if (a.k === "list" || a.k === "set") {
      if (!a.items.length) throw new MaximaError("lib.eval.randEmptyList");
      return a.items[Math.floor(ctx.rng() * a.items.length)];
    }
    if (callName(a) === "matrix" && a.k === "call") {
      return { k: "call", fn: a.fn, args: a.args.map((r) => list(asList(r, "rand").map((x) => BUILTINS.rand([x], ctx, null as unknown as Env)))) };
    }
    throw new MaximaError("lib.eval.randInvalid", { expr: toMaxima(a) });
  },
  rand_with_step(args, ctx) {
    argCount("rand_with_step", args, 3);
    const [lo, hi, st] = args;
    const n = Math.floor((asNum(hi, "rand_with_step") - asNum(lo, "rand_with_step")) / asNum(st, "rand_with_step") + 1e-9);
    if (n < 0) throw new MaximaError("lib.eval.randStepBounds");
    return add([lo, mul([st, int(Math.floor(ctx.rng() * (n + 1)))])]);
  },
  rand_with_prohib(args, ctx) {
    argCount("rand_with_prohib", args, 3);
    const lo = asInt(args[0], "rand_with_prohib"), hi = asInt(args[1], "rand_with_prohib");
    const prohib = asList(args[2], "rand_with_prohib").map((x) => numericValue(x));
    const choices: number[] = [];
    for (let i = lo; i <= hi; i++) if (!prohib.some((p) => Math.abs(p - i) < 1e-12)) choices.push(i);
    if (!choices.length) throw new MaximaError("lib.eval.randProhibNone");
    return int(choices[Math.floor(ctx.rng() * choices.length)]);
  },
  rand_selection(args, ctx) {
    argCount("rand_selection", args, 2);
    const items = [...asList(args[0], "rand_selection")];
    const n = asInt(args[1], "rand_selection");
    if (n > items.length) throw new MaximaError("lib.eval.randSelectionTooMany");
    const out: Expr[] = [];
    for (let i = 0; i < n; i++) out.push(items.splice(Math.floor(ctx.rng() * items.length), 1)[0]);
    return list(out);
  },
  rand_selection_with_replacement(args, ctx) {
    const items = asList(args[0], "rand_selection_with_replacement");
    const n = asInt(args[1], "rand_selection_with_replacement");
    return list(Array.from({ length: n }, () => items[Math.floor(ctx.rng() * items.length)]));
  },
  random_permutation(args, ctx) {
    const items = [...asList(args[0], "random_permutation")];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return list(items);
  },
  random(args, ctx) { return BUILTINS.rand(args, ctx, null as unknown as Env); },

  // ---- Arithmetik
  abs(args) {
    const a = args[0];
    if (a.k === "num") return rat(Math.abs(a.n), a.d);
    if (a.k === "float") return flt(Math.abs(a.v));
    if (a.k === "list") return list(a.items.map((x) => BUILTINS.abs([x], null as unknown as Ctx, null as unknown as Env)));
    return call("abs", a);
  },
  sqrt(args) { argCount("sqrt", args, 1); return pow(args[0], rat(1, 2)); },
  floor(args) { const v = numericValue(args[0]); return Number.isNaN(v) ? call("floor", args[0]) : int(Math.floor(v)); },
  ceiling(args) { const v = numericValue(args[0]); return Number.isNaN(v) ? call("ceiling", args[0]) : int(Math.ceil(v)); },
  round(args) { const v = numericValue(args[0]); return Number.isNaN(v) ? call("round", args[0]) : int(Math.round(v)); },
  truncate(args) { const v = numericValue(args[0]); return Number.isNaN(v) ? call("truncate", args[0]) : int(Math.trunc(v)); },
  fix(args) { return BUILTINS.truncate(args, null as unknown as Ctx, null as unknown as Env); },
  signum(args) { const v = numericValue(args[0]); return Number.isNaN(v) ? call("signum", args[0]) : int(Math.sign(v)); },
  mod(args) {
    argCount("mod", args, 2);
    const [a, b] = args;
    if (a.k === "num" && b.k === "num" && a.d === 1 && b.d === 1) {
      if (b.n === 0) return a;
      return int(((a.n % b.n) + b.n) % b.n);
    }
    const x = numericValue(a), y = numericValue(b);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return flt(((x % y) + y) % y);
    return call("mod", a, b);
  },
  max(args) {
    const flat = args.flatMap((a) => (a.k === "list" || a.k === "set" ? a.items : [a]));
    if (flat.every(isNumeric)) return flat.reduce((m, x) => (numValue(x) > numValue(m) ? x : m));
    return { k: "call", fn: sym("max"), args };
  },
  min(args) {
    const flat = args.flatMap((a) => (a.k === "list" || a.k === "set" ? a.items : [a]));
    if (flat.every(isNumeric)) return flat.reduce((m, x) => (numValue(x) < numValue(m) ? x : m));
    return { k: "call", fn: sym("min"), args };
  },
  lmax(args) { return BUILTINS.max(asList(args[0], "lmax"), null as unknown as Ctx, null as unknown as Env); },
  lmin(args) { return BUILTINS.min(asList(args[0], "lmin"), null as unknown as Ctx, null as unknown as Env); },
  gcd(args) { return int(args.map((a) => asInt(a, "gcd")).reduce((a, b) => gcd(a, b))); },
  lcm(args) {
    return int(args.map((a) => asInt(a, "lcm")).reduce((a, b) => Math.abs(a * b) / (gcd(a, b) || 1)));
  },
  factorial(args) { const n = asInt(args[0], "factorial"); return int(factorialNum(n)); },
  binomial(args) {
    const n = args[0], k = args[1];
    if (n.k === "num" && k.k === "num") return int(Math.round(NUM_FUNCS.binomial(n.n, k.n)));
    return call("binomial", n, k);
  },
  num(args) { const a = args[0]; if (a.k === "num") return int(a.n); return a; },
  denom(args) { const a = args[0]; if (a.k === "num") return int(a.d); return ONE; },
  float(args) { return toFloat(args[0]); },
  numer(args) { return toFloat(args[0]); },
  ifactors(args) { return ifactors(asInt(args[0], "ifactors")); },
  primep(args) { return bool(isPrime(asInt(args[0], "primep"))); },
  next_prime(args) { let n = asInt(args[0], "next_prime") + 1; while (!isPrime(n)) n++; return int(n); },
  prev_prime(args) { let n = asInt(args[0], "prev_prime") - 1; while (n > 1 && !isPrime(n)) n--; return int(n); },
  divisors(args) {
    const n = Math.abs(asInt(args[0], "divisors"));
    const ds: Expr[] = [];
    for (let i = 1; i <= n; i++) if (n % i === 0) ds.push(int(i));
    return makeSet(ds);
  },
  significantfigures(args) {
    const v = asNum(args[0], "significantfigures");
    return flt(sigFigs(v, asInt(args[1], "significantfigures")));
  },
  decimalplaces(args) {
    const v = asNum(args[0], "decimalplaces");
    return flt(roundTo(v, asInt(args[1], "decimalplaces")));
  },
  dispdp(args) {
    const v = asNum(args[0], "dispdp");
    return { k: "call", fn: sym("dispdp"), args: [flt(roundTo(v, asInt(args[1], "dispdp"))), args[1]] };
  },
  dispsf(args) {
    const v = asNum(args[0], "dispsf");
    return { k: "call", fn: sym("dispsf"), args: [flt(sigFigs(v, asInt(args[1], "dispsf"))), args[1]] };
  },

  // ---- Algebra / Analysis
  expand(args) { return expand(args[0]); },
  ratsimp(args) { return simplify(args[0]); },
  fullratsimp(args) { return simplify(args[0]); },
  radcan(args) { return simplify(args[0]); },
  trigsimp(args) { return simplify(args[0]); },
  factor(args, ctx) {
    const a = args[0];
    if (a.k === "num" && a.d === 1) return a;
    warn(ctx, { key: "lib.eval.factorNotLocal" });
    return a;
  },
  diff(args) {
    argCount("diff", args, 1, 3);
    const v = args[1] ?? sym("x");
    if (v.k !== "sym") throw new MaximaError("lib.eval.variableExpected", { fn: "diff" });
    const n = args[2] ? asInt(args[2], "diff") : 1;
    let r = args[0];
    for (let i = 0; i < n; i++) r = diff(r, v.name);
    return r;
  },
  integrate(args, ctx) {
    argCount("integrate", args, 2, 4);
    const v = args[1];
    if (v.k !== "sym") throw new MaximaError("lib.eval.variableExpected", { fn: "integrate" });
    const F = integrate(expand(args[0]), v.name);
    if (!F) {
      warn(ctx, { key: "lib.eval.integrateNotLocal" });
      return { k: "call", fn: sym("integrate"), args };
    }
    if (args.length === 4) return simplify(sub(substitute(F, v, args[3]), substitute(F, v, args[2])));
    return F;
  },
  coeff(args) {
    const e = expand(args[0]);
    const v = args[1];
    const n = args[2] ? numValue(args[2]) : 1;
    const terms = e.k === "op" && e.op === "+" ? e.args : [e];
    const out: Expr[] = [];
    for (const t of terms) {
      const fs = t.k === "op" && t.op === "*" ? t.args : [t];
      let deg = 0;
      const rest: Expr[] = [];
      for (const f of fs) {
        if (equal(f, v)) deg += 1;
        else if (f.k === "op" && f.op === "^" && equal(f.args[0], v) && isNumeric(f.args[1])) deg += numValue(f.args[1]);
        else rest.push(f);
      }
      if (deg === n) out.push(mul(rest));
    }
    return add(out);
  },
  hipow(args) {
    const e = expand(args[0]);
    const terms = e.k === "op" && e.op === "+" ? e.args : [e];
    let m = 0;
    for (const t of terms) {
      const fs = t.k === "op" && t.op === "*" ? t.args : [t];
      let deg = 0;
      for (const f of fs) {
        if (equal(f, args[1])) deg += 1;
        else if (f.k === "op" && f.op === "^" && equal(f.args[0], args[1]) && isNumeric(f.args[1])) deg += numValue(f.args[1]);
      }
      m = Math.max(m, deg);
    }
    return int(m);
  },
  sin(a, c) { return evalTrig("sin", a, c); },
  cos(a, c) { return evalTrig("cos", a, c); },
  tan(a, c) { return evalTrig("tan", a, c); },
  asin(a, c) { return evalTrig("asin", a, c); },
  acos(a, c) { return evalTrig("acos", a, c); },
  atan(a, c) { return evalTrig("atan", a, c); },
  sinh(a, c) { return evalTrig("sinh", a, c); },
  cosh(a, c) { return evalTrig("cosh", a, c); },
  tanh(a, c) { return evalTrig("tanh", a, c); },
  exp(a, c) { return evalTrig("exp", a, c); },
  log(a, c) { return evalTrig("log", a, c); },
  ln(a, c) { return evalTrig("log", a, c); },
  lhs(args) { const a = args[0]; return a.k === "op" && isRelation(a) ? a.args[0] : a; },
  rhs(args) { const a = args[0]; return a.k === "op" && isRelation(a) ? a.args[1] : ZERO; },
  part(args) {
    let e = args[0];
    for (const i of args.slice(1).map((x) => asInt(x, "part"))) {
      const parts = e.k === "list" || e.k === "set" ? e.items : e.k === "op" ? e.args : e.k === "call" ? e.args : null;
      if (!parts || i < 0 || i > parts.length) throw new MaximaError("lib.eval.partOutOfRange");
      e = i === 0 ? (e.k === "op" ? str(e.op) : e.k === "call" ? e.fn : sym("[")) : parts[i - 1];
    }
    return e;
  },
  args(args) {
    const e = args[0];
    if (e.k === "op" || e.k === "call") return list(e.args);
    if (e.k === "list" || e.k === "set") return list(e.items);
    return list([]);
  },
  op(args) {
    const e = args[0];
    if (e.k === "op") return str(e.op);
    if (e.k === "call") return e.fn;
    if (e.k === "list") return str("[");
    if (e.k === "set") return str("{");
    throw new MaximaError("lib.eval.opNotCompound");
  },

  // ---- Prädikate
  numberp(a) { return bool(isNumeric(a[0])); },
  integerp(a) { return bool(a[0].k === "num" && a[0].d === 1); },
  floatnump(a) { return bool(a[0].k === "float"); },
  ratnump(a) { return bool(a[0].k === "num"); },
  listp(a) { return bool(a[0].k === "list"); },
  setp(a) { return bool(a[0].k === "set"); },
  stringp(a) { return bool(a[0].k === "str"); },
  symbolp(a) { return bool(a[0].k === "sym"); },
  atom(a) { return bool(!["list", "set", "op", "call"].includes(a[0].k)); },
  evenp(a) { return bool(a[0].k === "num" && a[0].d === 1 && a[0].n % 2 === 0); },
  oddp(a) { return bool(a[0].k === "num" && a[0].d === 1 && Math.abs(a[0].n % 2) === 1); },
  emptyp(a) { return bool((a[0].k === "list" || a[0].k === "set") && a[0].items.length === 0); },
  freeof(a) { return bool(!a.slice(0, -1).some((x) => key(a[a.length - 1]).includes(key(x)))); },
  equationp(a) { return bool(a[0].k === "op" && a[0].op === "="); },
  inequalityp(a) { return bool(a[0].k === "op" && ["<", ">", "<=", ">="].includes(a[0].op)); },

  // ---- Listen & Mengen
  length(args) {
    const a = args[0];
    if (a.k === "list" || a.k === "set") return int(a.items.length);
    if (a.k === "op" || a.k === "call") return int(a.args.length);
    if (a.k === "str") return int(a.v.length);
    throw new MaximaError("lib.eval.lengthAtomic", { expr: toMaxima(a) });
  },
  first(a) { return nth(a[0], 1, "first"); },
  second(a) { return nth(a[0], 2, "second"); },
  third(a) { return nth(a[0], 3, "third"); },
  fourth(a) { return nth(a[0], 4, "fourth"); },
  fifth(a) { return nth(a[0], 5, "fifth"); },
  last(a) {
    const items = partsOf(a[0], "last");
    if (!items.length) throw new MaximaError("lib.eval.lastEmpty");
    return items[items.length - 1];
  },
  rest(args) {
    const items = asList(args[0], "rest");
    const n = args[1] ? asInt(args[1], "rest") : 1;
    return list(n >= 0 ? items.slice(n) : items.slice(0, items.length + n));
  },
  append(args) { return list(args.flatMap((a) => asList(a, "append"))); },
  cons(args) { return list([args[0], ...asList(args[1], "cons")]); },
  endcons(args) { return list([...asList(args[1], "endcons"), args[0]]); },
  reverse(args) { return list([...asList(args[0], "reverse")].reverse()); },
  sort(args, ctx, env) {
    const items = [...asList(args[0], "sort")];
    if (args[1]) {
      const f = args[1];
      items.sort((x, y) => (truth(applyAny(f, [x, y], env, ctx)) ? -1 : 1));
    } else items.sort(compareForSort);
    return list(items);
  },
  unique(args) { return list((makeSet(asList(args[0], "unique")) as { items: Expr[] }).items); },
  flatten(args) {
    const out: Expr[] = [];
    const walk = (e: Expr) => (e.k === "list" ? e.items.forEach(walk) : out.push(e));
    walk(args[0]);
    return list(out);
  },
  member(args) { return bool(asList(args[1], "member").some((x) => equal(x, args[0]))); },
  delete(args) { return list(asList(args[1], "delete").filter((x) => !equal(x, args[0]))); },
  sublist(args, ctx, env) { return list(asList(args[0], "sublist").filter((x) => truth(applyAny(args[1], [x], env, ctx)) === true)); },
  sublist_indices(args, ctx, env) {
    const out: Expr[] = [];
    asList(args[0], "sublist_indices").forEach((x, i) => { if (truth(applyAny(args[1], [x], env, ctx)) === true) out.push(int(i + 1)); });
    return list(out);
  },
  map(args, ctx, env) {
    const [f, ...ls] = args;
    const lists = ls.map((l) => asList(l, "map"));
    const n = Math.min(...lists.map((l) => l.length));
    const out = Array.from({ length: n }, (_, i) => applyAny(f, lists.map((l) => l[i]), env, ctx));
    return sameKind(ls[0], out);
  },
  apply(args, ctx, env) { return applyAny(args[0], asList(args[1], "apply"), env, ctx); },
  lsum(args) { return add(asList(args[0], "lsum")); },
  zip_with(args, ctx, env) {
    const a = asList(args[1], "zip_with"), b = asList(args[2], "zip_with");
    return list(a.slice(0, Math.min(a.length, b.length)).map((x, i) => applyAny(args[0], [x, b[i]], env, ctx)));
  },
  listify(args) { return list(asList(args[0], "listify")); },
  setify(args) { return makeSet(asList(args[0], "setify")); },
  set(args) { return makeSet(args); },
  union(args) { return makeSet(args.flatMap((a) => asList(a, "union"))); },
  intersection(args) {
    const [first, ...rest] = args.map((a) => asList(a, "intersection"));
    return makeSet(first.filter((x) => rest.every((r) => r.some((y) => equal(x, y)))));
  },
  setdifference(args) {
    const b = asList(args[1], "setdifference");
    return makeSet(asList(args[0], "setdifference").filter((x) => !b.some((y) => equal(x, y))));
  },
  elementp(args) { return bool(asList(args[1], "elementp").some((x) => equal(x, args[0]))); },
  subsetp(args) {
    const b = asList(args[1], "subsetp");
    return bool(asList(args[0], "subsetp").every((x) => b.some((y) => equal(x, y))));
  },
  cardinality(args) { return int(asList(args[0], "cardinality").length); },
  mcq_correct(args) { return mcqFilter(args[0], true); },
  mcq_incorrect(args) { return mcqFilter(args[0], false); },
  zeromatrix(args) {
    const r = asInt(args[0], "zeromatrix"), c = asInt(args[1], "zeromatrix");
    return { k: "call", fn: sym("matrix"), args: Array.from({ length: r }, () => list(Array(c).fill(ZERO))) };
  },
  ident(args) {
    const n = asInt(args[0], "ident");
    return { k: "call", fn: sym("matrix"), args: Array.from({ length: n }, (_, i) => list(Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)))) };
  },
  transpose(args) {
    const m = args[0];
    if (callName(m) !== "matrix" || m.k !== "call") return call("transpose", m);
    const rows = m.args.map((r) => asList(r, "transpose"));
    const cols = rows[0]?.length ?? 0;
    return { k: "call", fn: sym("matrix"), args: Array.from({ length: cols }, (_, j) => list(rows.map((r) => r[j]))) };
  },
  determinant(args) {
    const m = args[0];
    if (callName(m) !== "matrix" || m.k !== "call") return call("determinant", m);
    const rows = m.args.map((r) => asList(r, "determinant"));
    const det = (a: Expr[][]): Expr => {
      if (a.length === 1) return a[0][0];
      if (a.length === 2) return sub(mul([a[0][0], a[1][1]]), mul([a[0][1], a[1][0]]));
      return add(a[0].map((x, j) => mul([j % 2 ? int(-1) : ONE, x, det(a.slice(1).map((r) => r.filter((_, k) => k !== j)))])));
    };
    return det(rows);
  },

  // ---- Zeichenketten
  string(args) { return args[0].k === "str" ? args[0] : str(toMaxima(args[0])); },
  sconcat(args) { return str(args.map((a) => (a.k === "str" ? a.v : toMaxima(a))).join("")); },
  simplode(args) {
    const sep = args[1] ? asStr(args[1], "simplode") : "";
    return str(asList(args[0], "simplode").map((a) => (a.k === "str" ? a.v : toMaxima(a))).join(sep));
  },
  slength(args) { return int(asStr(args[0], "slength").length); },
  strlen(args) { return int(asStr(args[0], "strlen").length); },
  sdowncase(args) { return str(asStr(args[0], "sdowncase").toLowerCase()); },
  supcase(args) { return str(asStr(args[0], "supcase").toUpperCase()); },
  ssubst(args) { return str(asStr(args[2], "ssubst").split(asStr(args[1], "ssubst")).join(asStr(args[0], "ssubst"))); },
  split(args) { return list(asStr(args[0], "split").split(args[1] ? asStr(args[1], "split") : " ").map(str)); },
  substring(args) {
    const s = asStr(args[0], "substring");
    const a = asInt(args[1], "substring");
    const b = args[2] ? asInt(args[2], "substring") : s.length + 1;
    return str(s.slice(a - 1, b - 1));
  },
  sposition(args) { const i = asStr(args[1], "sposition").indexOf(asStr(args[0], "sposition")); return i < 0 ? bool(false) : int(i + 1); },
  parse_string(args) { return parseExpression(asStr(args[0], "parse_string")); },
  eval_string(args, ctx, env) { return evaluate(parseExpression(asStr(args[0], "eval_string")), env, ctx); },
  castext(args) { return args[0]; },

  // ---- Sonstiges / bewusst ignoriert
  print(args) { return args[args.length - 1] ?? ZERO; },
  texput() { return sym("done"); },
  declare() { return sym("done"); },
  assume() { return sym("done"); },
  forget() { return sym("done"); },
  orderless() { return sym("done"); },
  ordergreat() { return sym("done"); },
  stack_include() { return sym("done"); },
  load() { return sym("done"); },
  kill() { return sym("done"); },
  return(args) { return { k: "call", fn: sym("return"), args }; },
  // Text aus dem Aufgabencode: unverändert anzeigen
  error(args) { throw new MaximaError("lib.text", { text: args.map((a) => (a.k === "str" ? a.v : toMaxima(a))).join(" ") }); },
};

function partsOf(e: Expr, fn: string): Expr[] {
  if (e.k === "list" || e.k === "set") return e.items;
  if (e.k === "op" || e.k === "call") return e.args;
  throw new MaximaError("lib.eval.listExpected", { fn, got: toMaxima(e) });
}
function nth(e: Expr, n: number, fn: string): Expr {
  const items = partsOf(e, fn);
  if (items.length < n) throw new MaximaError("lib.eval.listTooShort", { fn, n });
  return items[n - 1];
}

/** Namen aller lokal ausgewerteten Funktionen (für Hinweise im Editor). */
export const EVALUATED_FUNCTIONS = new Set([...Object.keys(BUILTINS), ...Object.keys(SPECIAL)]);

// ---- Fragevariablen auswerten ---------------------------------------------------

export interface VariableResult {
  name: string;
  value: Expr;
  start: number;
  end: number;
}
export interface StatementError {
  /** Meldung mit Schlüssel – die Oberfläche übersetzt sie. */
  message: Msg;
  from: number;
  to: number;
  severity: "error" | "warning" | "info";
}
export interface EvalResult {
  env: Env;
  variables: VariableResult[];
  errors: StatementError[];
  warnings: Msg[];
  simp: boolean;
}

export function evaluateBlock(src: string, env: Env, ctx: Ctx): { variables: VariableResult[]; errors: StatementError[] } {
  const parsed = parseStatements(src);
  const errors: StatementError[] = parsed.errors.map((e) => ({ ...e }));
  const assigned = new Map<string, VariableResult>();
  for (const st of parsed.statements) {
    const before = new Map(env.vars);
    try {
      evaluate(st.expr, env, ctx);
    } catch (e) {
      errors.push({ message: errorMsg(e), from: st.start, to: st.end, severity: "error" });
    }
    // Auch Zuweisungen innerhalb von if/for/block erfassen
    for (const [name, value] of env.vars) {
      if (before.get(name) !== value) {
        assigned.delete(name);
        assigned.set(name, { name, value, start: st.start, end: st.end });
      }
    }
  }
  return { variables: [...assigned.values()], errors };
}

export function evaluateQuestionVariables(src: string, seed: number, simp = true): EvalResult {
  const env = new Env();
  const ctx = makeCtx(seed, simp);
  const { variables, errors } = evaluateBlock(src, env, ctx);
  variables.sort((a, b) => a.start - b.start);
  return { env, variables, errors, warnings: [...ctx.warnings.values()], simp: ctx.simp };
}

export { parseExpression };
