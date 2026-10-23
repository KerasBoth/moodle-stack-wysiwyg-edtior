// Algebraische Grundvereinfachung, angelehnt an Maximas simp:true.

import { LocalizedError } from "../i18n/index.ts";
import { type Expr, int, isNumeric, numValue, ONE, ZERO, callName } from "./types.ts";

// ---- Rationale Zahlen ------------------------------------------------------

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export { gcd };

export function rat(n: number, d = 1): Expr {
  if (d === 0) throw new LocalizedError("lib.eval.divisionByZero");
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return { k: "float", v: n / d };
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { k: "num", n: n / g, d: d / g };
}

function numAdd(a: Expr, b: Expr): Expr {
  if (a.k === "num" && b.k === "num") return rat(a.n * b.d + b.n * a.d, a.d * b.d);
  return { k: "float", v: numValue(a) + numValue(b) };
}
function numMul(a: Expr, b: Expr): Expr {
  if (a.k === "num" && b.k === "num") return rat(a.n * b.n, a.d * b.d);
  return { k: "float", v: numValue(a) * numValue(b) };
}
export function isZero(e: Expr): boolean {
  return (e.k === "num" && e.n === 0) || (e.k === "float" && e.v === 0);
}
export function isOne(e: Expr): boolean {
  return (e.k === "num" && e.n === 1 && e.d === 1) || (e.k === "float" && e.v === 1);
}
export function isNegNum(e: Expr): boolean {
  return (e.k === "num" && e.n < 0) || (e.k === "float" && e.v < 0);
}

// ---- Strukturvergleich ----------------------------------------------------

/** Kanonischer Schlüssel zum Vergleich von Ausdrücken. */
export function key(e: Expr): string {
  switch (e.k) {
    case "num": return e.d === 1 ? `${e.n}` : `${e.n}/${e.d}`;
    case "float": return `${e.v}f`;
    case "str": return JSON.stringify(e.v);
    case "bool": return e.v ? "true" : "false";
    case "sym": return e.name;
    case "list": return `[${e.items.map(key).join(",")}]`;
    case "set": return `{${e.items.map(key).join(",")}}`;
    case "op": return `${e.op}(${e.args.map(key).join(",")})`;
    case "call": return `${key(e.fn)}(${e.args.map(key).join(",")})`;
    case "index": return `${key(e.target)}[${e.idx.map(key).join(",")}]`;
    case "quote": return `'${key(e.e)}`;
    default: return JSON.stringify(e);
  }
}
export const equal = (a: Expr, b: Expr) => key(a) === key(b);

// ---- Ordnung (für Anzeige ähnlich Maxima) ---------------------------------

/** Grad eines Terms bzgl. aller Symbole – dient der Sortierung in Summen. */
export function degree(e: Expr): number {
  switch (e.k) {
    case "sym": return isConstantSym(e.name) ? 0 : 1;
    case "op":
      if (e.op === "*") return e.args.reduce((s, a) => s + degree(a), 0);
      if (e.op === "^") {
        const ex = e.args[1];
        const d = degree(e.args[0]);
        return isNumeric(ex) ? d * numValue(ex) : d + 0.5;
      }
      if (e.op === "+") return Math.max(...e.args.map(degree));
      return 0;
    case "call": return Math.max(0.5, ...e.args.map(degree));
    default: return 0;
  }
}

export function isConstantSym(name: string): boolean {
  return name === "%pi" || name === "%e" || name === "%i" || name === "%phi" || name === "inf" || name === "minf";
}

function factorRank(e: Expr): number {
  if (isNumeric(e)) return 0;
  if (e.k === "sym" && isConstantSym(e.name)) return 1;
  if (e.k === "sym") return 2;
  if (e.k === "op" && e.op === "^" && e.args[0].k === "sym") return 2;
  if (e.k === "call") return 3;
  return 4;
}
function baseName(e: Expr): string {
  if (e.k === "op" && e.op === "^") return key(e.args[0]);
  return key(e);
}

function sortFactors(fs: Expr[]): Expr[] {
  return [...fs].sort((a, b) => {
    const r = factorRank(a) - factorRank(b);
    if (r) return r;
    const na = baseName(a), nb = baseName(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
}

function sortTerms(ts: Expr[]): Expr[] {
  return ts
    .map((t, i) => ({ t, i, d: degree(t), k: key(splitCoef(t)[1]) }))
    .sort((a, b) => b.d - a.d || (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i))
    .map((x) => x.t);
}

// ---- Addition --------------------------------------------------------------

/** Zerlegt einen Term in [Koeffizient, Rest]. */
export function splitCoef(t: Expr): [Expr, Expr] {
  if (isNumeric(t)) return [t, ONE];
  if (t.k === "op" && t.op === "*" && isNumeric(t.args[0])) {
    const rest = t.args.slice(1);
    return [t.args[0], rest.length === 1 ? rest[0] : { k: "op", op: "*", args: rest }];
  }
  return [ONE, t];
}

export function add(terms: Expr[]): Expr {
  const flat: Expr[] = [];
  for (const t of terms) {
    if (t.k === "op" && t.op === "+") flat.push(...t.args);
    else flat.push(t);
  }
  // Listenarithmetik
  const lists = flat.filter((t) => t.k === "list");
  if (lists.length) return elementwise(flat, add);

  let constant: Expr = ZERO;
  const coefs = new Map<string, { coef: Expr; rest: Expr }>();
  const others: Expr[] = [];
  for (const t of flat) {
    if (isNumeric(t)) { constant = numAdd(constant, t); continue; }
    if (t.k === "str" || t.k === "bool" || t.k === "set") { others.push(t); continue; }
    const [c, r] = splitCoef(t);
    const k = key(r);
    const ex = coefs.get(k);
    if (ex) ex.coef = numAdd(ex.coef, c);
    else coefs.set(k, { coef: c, rest: r });
  }
  const out: Expr[] = [];
  for (const { coef, rest } of coefs.values()) {
    if (isZero(coef) && coef.k === "num") continue;
    out.push(mul([coef, rest]));
  }
  out.push(...others);
  const sorted = sortTerms(out);
  if (!isZero(constant) || constant.k === "float") {
    if (!(isZero(constant) && sorted.length)) sorted.push(constant);
  }
  if (sorted.length === 0) return ZERO;
  if (sorted.length === 1) return sorted[0];
  return { k: "op", op: "+", args: sorted };
}

function elementwise(args: Expr[], f: (xs: Expr[]) => Expr): Expr {
  const len = args.find((a) => a.k === "list")!.k === "list"
    ? (args.find((a) => a.k === "list") as { items: Expr[] }).items.length
    : 0;
  for (const a of args) {
    if (a.k === "list" && a.items.length !== len) {
      throw new LocalizedError("lib.eval.listLengthMismatch");
    }
  }
  const items: Expr[] = [];
  for (let i = 0; i < len; i++) items.push(f(args.map((a) => (a.k === "list" ? a.items[i] : a))));
  return { k: "list", items };
}

// ---- Multiplikation --------------------------------------------------------

export function mul(factors: Expr[]): Expr {
  const flat: Expr[] = [];
  for (const f of factors) {
    if (f.k === "op" && f.op === "*") flat.push(...f.args);
    else flat.push(f);
  }
  if (flat.some((t) => t.k === "list")) return elementwise(flat, mul);

  let coef: Expr = ONE;
  const bases = new Map<string, { base: Expr; exp: Expr }>();
  const order: string[] = [];
  for (const f of flat) {
    if (isNumeric(f)) { coef = numMul(coef, f); continue; }
    let base = f;
    let exp: Expr = ONE;
    if (f.k === "op" && f.op === "^") { base = f.args[0]; exp = f.args[1]; }
    // Zahlpotenzen wie 2^(1/2) nicht mit Koeffizienten verschmelzen, nur gleiche Basen
    const k = key(base);
    const ex = bases.get(k);
    if (ex) ex.exp = add([ex.exp, exp]);
    else { bases.set(k, { base, exp }); order.push(k); }
  }
  if (isZero(coef) && coef.k === "num") return ZERO;
  const out: Expr[] = [];
  for (const k of order) {
    const { base, exp } = bases.get(k)!;
    const p = pow(base, exp);
    if (isNumeric(p)) { coef = numMul(coef, p); continue; }
    if (p.k === "op" && p.op === "*") {
      for (const a of p.args) {
        if (isNumeric(a)) coef = numMul(coef, a);
        else out.push(a);
      }
      continue;
    }
    out.push(p);
  }
  const sorted = sortFactors(out);
  if (!isOne(coef) || coef.k === "float") {
    if (!(isOne(coef) && coef.k === "num")) sorted.unshift(coef);
  }
  if (sorted.length === 0) return ONE;
  if (sorted.length === 1) return sorted[0];
  return { k: "op", op: "*", args: sorted };
}

// ---- Potenzen --------------------------------------------------------------

function intPow(b: number, e: number): number {
  return Math.pow(b, e);
}

/** n-te Wurzel einer natürlichen Zahl, aufgespalten in (außen, innen). */
function extractRoot(n: number, q: number): [number, number] {
  let outside = 1;
  let inside = n;
  for (let f = 2; Math.pow(f, q) <= inside; f++) {
    const fq = Math.pow(f, q);
    while (inside % fq === 0) {
      inside /= fq;
      outside *= f;
    }
  }
  return [outside, inside];
}

export function pow(b: Expr, e: Expr): Expr {
  if (b.k === "list" || e.k === "list") return elementwise([b, e], ([x, y]) => pow(x, y));
  if (isZero(e)) return e.k === "float" ? { k: "float", v: 1 } : ONE;
  if (isOne(e) && e.k === "num") return b;
  if (isOne(b) && b.k === "num") return ONE;
  if (isZero(b) && isNumeric(e) && numValue(e) > 0) return b;

  if (isNumeric(b) && isNumeric(e)) {
    if (b.k === "float" || e.k === "float") {
      const v = Math.pow(numValue(b), numValue(e));
      if (!Number.isNaN(v)) return { k: "float", v };
    }
    if (b.k === "num" && e.k === "num") {
      if (e.d === 1) {
        const ex = e.n;
        if (b.n === 0 && ex < 0) throw new LocalizedError("lib.eval.zeroNegativePower");
        const n = intPow(b.n, Math.abs(ex));
        const d = intPow(b.d, Math.abs(ex));
        return ex >= 0 ? rat(n, d) : rat(d, n);
      }
      // rationaler Exponent p/q
      if (b.n > 0 && e.d <= 12) {
        const [on, inn] = extractRoot(b.n, e.d);
        const [od, ind] = extractRoot(b.d, e.d);
        if (inn === 1 && ind === 1) return pow(rat(on, od), int(e.n));
        if (on !== 1 || od !== 1) {
          return mul([pow(rat(on, od), int(e.n)), pow(rat(inn, ind), e)]);
        }
      }
      return { k: "op", op: "^", args: [b, e] };
    }
  }
  // (x^a)^n mit ganzzahligem n
  if (b.k === "op" && b.op === "^" && e.k === "num" && e.d === 1) {
    return pow(b.args[0], mul([b.args[1], e]));
  }
  // (a*b)^n
  if (b.k === "op" && b.op === "*" && e.k === "num" && e.d === 1) {
    return mul(b.args.map((a) => pow(a, e)));
  }
  // %e^log(x) = x
  if (b.k === "sym" && b.name === "%e" && callName(e) === "log") return (e as { args: Expr[] }).args[0];
  return { k: "op", op: "^", args: [b, e] };
}

export function neg(e: Expr): Expr {
  return mul([int(-1), e]);
}
export function sub(a: Expr, b: Expr): Expr {
  return add([a, neg(b)]);
}
export function div(a: Expr, b: Expr): Expr {
  if (isZero(b) && isNumeric(b)) throw new LocalizedError("lib.eval.divisionByZero");
  return mul([a, pow(b, int(-1))]);
}

/** Vereinfacht einen bereits ausgewerteten, aber unvereinfachten Baum (z. B. aus simp:false). */
export function simplify(e: Expr): Expr {
  switch (e.k) {
    case "list": return { k: "list", items: e.items.map(simplify) };
    case "set": return makeSet(e.items.map(simplify));
    case "op": {
      const args = e.args.map(simplify);
      switch (e.op) {
        case "+": return add(args);
        case "*": return mul(args);
        case "^": return pow(args[0], args[1]);
        case "neg": return neg(args[0]);
        case "-": return sub(args[0], args[1]);
        case "/": return div(args[0], args[1]);
        default: return { k: "op", op: e.op, args };
      }
    }
    case "call": return { k: "call", fn: e.fn, args: e.args.map(simplify) };
    default: return e;
  }
}

export function makeSet(items: Expr[]): Expr {
  const m = new Map<string, Expr>();
  for (const it of items) m.set(key(it), it);
  const sorted = [...m.entries()].sort((a, b) => compareForSort(a[1], b[1])).map((x) => x[1]);
  return { k: "set", items: sorted };
}

/** Ordnung für sort() und Mengen: Zahlen nach Wert, sonst lexikografisch. */
export function compareForSort(a: Expr, b: Expr): number {
  const an = isNumeric(a), bn = isNumeric(b);
  if (an && bn) return numValue(a) - numValue(b);
  if (an) return -1;
  if (bn) return 1;
  if (a.k === "str" && b.k === "str") return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  const ka = key(a), kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
