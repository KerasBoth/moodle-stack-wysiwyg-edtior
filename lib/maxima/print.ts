// Ausgabe von Ausdrücken als Maxima-Text ({#...#}) und als LaTeX ({@...@}).

import { type Expr, isNumeric, numValue, callName } from "./types.ts";

export interface PrintOptions {
  multiplicationsign: string; // dot | cross | onum | none
  sqrtsign: boolean;
  complexno: string; // i | j | symi | symj
  inversetrig: string; // cos-1 | acos | arccos | arccos-arcosh
  logicsymbol: string; // lang | symbol
  matrixparens: string; // [ | ( | { | | | ""
  decimals: string; // . | ,
}

export const defaultPrintOptions: PrintOptions = {
  multiplicationsign: "dot",
  sqrtsign: true,
  complexno: "i",
  inversetrig: "cos-1",
  logicsymbol: "lang",
  matrixparens: "[",
  decimals: ".",
};

const PREC_ATOM = 1000;

function formatFloat(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "inf" : v < 0 ? "minf" : "und";
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return `${v}.0`;
  const s = Number(v.toPrecision(15)).toString();
  if (s.includes("e")) {
    const [m, ex] = s.split("e");
    return `${m.includes(".") ? m : m + ".0"}e${ex.replace("+", "")}`;
  }
  return s;
}

/** Zerlegt ein Produkt in Vorzeichen, Zähler- und Nennerfaktoren. */
interface Frac { negative: boolean; num: Expr[]; den: Expr[] }

function decompose(e: Expr): Frac | null {
  const factors =
    e.k === "op" && e.op === "*" ? e.args :
    e.k === "op" && e.op === "^" ? [e] :
    e.k === "num" && e.d !== 1 ? [e] : null;
  if (!factors) return null;
  const res: Frac = { negative: false, num: [], den: [] };
  for (const f of factors) {
    if (f.k === "num") {
      if (f.n < 0) res.negative = !res.negative;
      const n = Math.abs(f.n);
      if (n !== 1) res.num.push({ k: "num", n, d: 1 });
      if (f.d !== 1) res.den.push({ k: "num", n: f.d, d: 1 });
      continue;
    }
    if (f.k === "float" && f.v < 0) {
      res.negative = !res.negative;
      if (f.v !== -1) res.num.push({ k: "float", v: -f.v });
      continue;
    }
    if (f.k === "op" && f.op === "^" && isNumeric(f.args[1]) && numValue(f.args[1]) < 0) {
      const ex = f.args[1];
      const pos: Expr = ex.k === "num" ? { k: "num", n: -ex.n, d: ex.d } : { k: "float", v: -numValue(ex) };
      res.den.push(isOneNum(pos) ? f.args[0] : { k: "op", op: "^", args: [f.args[0], pos] });
      continue;
    }
    res.num.push(f);
  }
  if (res.den.length === 0 && !res.negative) return null;
  return res;
}
function isOneNum(e: Expr) {
  return e.k === "num" && e.n === 1 && e.d === 1;
}
function isHalf(e: Expr) {
  return e.k === "num" && e.n === 1 && e.d === 2;
}

/** Ist der Ausdruck (im Sinne der Anzeige) negativ? Für "a-b" statt "a+-b". */
function negPart(e: Expr): Expr | null {
  if (e.k === "num" && e.n < 0) return { k: "num", n: -e.n, d: e.d };
  if (e.k === "float" && e.v < 0) return { k: "float", v: -e.v };
  if (e.k === "op" && e.op === "neg") return e.args[0];
  if (e.k === "op" && e.op === "*" && isNumeric(e.args[0]) && numValue(e.args[0]) < 0) {
    const c = e.args[0];
    const pc: Expr = c.k === "num" ? { k: "num", n: -c.n, d: c.d } : { k: "float", v: -numValue(c) };
    const rest = e.args.slice(1);
    if (isOneNum(pc)) return rest.length === 1 ? rest[0] : { k: "op", op: "*", args: rest };
    return { k: "op", op: "*", args: [pc, ...rest] };
  }
  return null;
}

const OP_PREC: Record<string, number> = {
  ":": 20, ":=": 20,
  or: 60, and: 65, not: 70,
  "=": 80, "#": 80, "<": 80, ">": 80, "<=": 80, ">=": 80,
  "+": 100, "-": 100, neg: 100,
  "*": 120, "/": 120, ".": 130,
  "^": 140, "^^": 140,
  "!": 160, "!!": 160,
};

function precOf(e: Expr): number {
  switch (e.k) {
    case "num": return e.n < 0 ? 100 : e.d !== 1 ? 120 : PREC_ATOM;
    case "float": return e.v < 0 ? 100 : PREC_ATOM;
    case "op": {
      if (e.op === "*" || e.op === "^") {
        const fr = decompose(e);
        if (fr) return fr.negative ? 100 : 120;
        if (e.op === "^" && isHalf(e.args[1])) return PREC_ATOM;
      }
      return OP_PREC[e.op] ?? 50;
    }
    case "if": case "for": return 30;
    default: return PREC_ATOM;
  }
}

// =====================================================================
// Maxima-Textausgabe
// =====================================================================

export function toMaxima(e: Expr): string {
  const p = (x: Expr, min: number) => (precOf(x) < min ? `(${toMaxima(x)})` : toMaxima(x));
  switch (e.k) {
    case "num": return e.d === 1 ? `${e.n}` : `${e.n}/${e.d}`;
    case "float": return formatFloat(e.v);
    case "str": return JSON.stringify(e.v);
    case "bool": return e.v ? "true" : "false";
    case "sym": return e.name;
    case "list": return `[${e.items.map(toMaxima).join(",")}]`;
    case "set": return `{${e.items.map(toMaxima).join(",")}}`;
    case "quote": return `'${p(e.e, PREC_ATOM)}`;
    case "index": return `${p(e.target, PREC_ATOM)}[${e.idx.map(toMaxima).join(",")}]`;
    case "seq": return `(${e.items.map(toMaxima).join(",")})`;
    case "call": {
      const name = callName(e);
      if (name === "sqrt" && e.args.length === 1) return `sqrt(${toMaxima(e.args[0])})`;
      return `${p(e.fn, PREC_ATOM)}(${e.args.map(toMaxima).join(",")})`;
    }
    case "if": {
      let s = "";
      e.conds.forEach((c, i) => {
        s += `${i ? " elseif " : "if "}${toMaxima(c)} then ${toMaxima(e.thens[i])}`;
      });
      if (e.els) s += ` else ${toMaxima(e.els)}`;
      return s;
    }
    case "for": return "for ... do ...";
    case "op": {
      const o = e.op;
      const a = e.args;
      switch (o) {
        case "+": {
          let s = p(a[0], 100);
          for (const t of a.slice(1)) {
            const np = negPart(t);
            s += np ? `-${p(np, 101)}` : `+${p(t, 101)}`;
          }
          return s;
        }
        case "neg": return `-${p(a[0], 120)}`;
        case "-": return `${p(a[0], 100)}-${p(a[1], 101)}`;
        case "/": return `${p(a[0], 120)}/${p(a[1], 121)}`;
        case "*":
        case "^": {
          const fr = decompose(e);
          if (fr) {
            const prod = (fs: Expr[], min: number) =>
              fs.length === 0 ? "1" : fs.length === 1 ? p(fs[0], min) : fs.map((f) => p(f, 121)).join("*");
            let s = prod(fr.num, 120);
            if (fr.den.length) {
              const den = fr.den.length === 1 ? p(fr.den[0], 121) : `(${fr.den.map((f) => p(f, 121)).join("*")})`;
              s += `/${den}`;
            }
            return fr.negative ? `-${s}` : s;
          }
          if (o === "^") {
            if (isHalf(a[1])) return `sqrt(${toMaxima(a[0])})`;
            return `${p(a[0], 141)}^${p(a[1], 140)}`;
          }
          return a.map((f) => p(f, 121)).join("*");
        }
        case "not": return `not ${p(a[0], 70)}`;
        case "and": case "or": return a.map((x) => p(x, OP_PREC[o] + 1)).join(` ${o} `);
        case "!": case "!!": return `${p(a[0], PREC_ATOM)}${o}`;
        case ":": case ":=": return `${toMaxima(a[0])}${o}${toMaxima(a[1])}`;
        default: {
          const pr = OP_PREC[o] ?? 50;
          return a.map((x, i) => p(x, i === 0 ? pr : pr + 1)).join(o);
        }
      }
    }
  }
  return "?";
}

// =====================================================================
// LaTeX-Ausgabe
// =====================================================================

const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda",
  "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
]);

const TEX_FUNCS: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", cot: "\\cot", sec: "\\sec", csc: "\\csc",
  sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh", coth: "\\coth",
  log: "\\ln", ln: "\\ln", lg: "\\lg", exp: "\\exp", det: "\\det", max: "\\max", min: "\\min", gcd: "\\gcd",
};
const INV_TRIG = ["sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh"];

function texEscapeText(s: string): string {
  return s
    .replace(/\\/g, "\\backslash ")
    .replace(/([{}%$&#_])/g, "\\$1")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");
}

export function texSymbol(name: string, o: PrintOptions = defaultPrintOptions): string {
  switch (name) {
    case "%pi": return "\\pi";
    case "%e": return "e";
    case "%i": return o.complexno === "j" || o.complexno === "symj" ? "\\mathrm{j}" : "\\mathrm{i}";
    case "%phi": return "\\varphi";
    case "%gamma": return "\\gamma";
    case "inf": return "\\infty";
    case "minf": return "-\\infty";
    case "und": return "\\mathrm{und}";
  }
  const m = /^([A-Za-z]+?)_?(\d+)$/.exec(name);
  if (m && m[1].length >= 1 && !name.includes("__")) {
    return `${texSymbol(m[1], o)}_{${m[2]}}`;
  }
  const us = name.indexOf("_");
  if (us > 0 && us < name.length - 1) {
    return `${texSymbol(name.slice(0, us), o)}_{${texSymbol(name.slice(us + 1), o)}}`;
  }
  if (GREEK.has(name)) return `\\${name}`;
  if (name.length === 1) return name;
  return `{\\it ${name.replace(/%/g, "\\%")}}`;
}

export function toTex(e: Expr, o: PrintOptions = defaultPrintOptions): string {
  const t = (x: Expr) => toTex(x, o);
  const paren = (s: string) => `\\left(${s}\\right)`;
  const p = (x: Expr, min: number) => (precOf(x) < min ? paren(t(x)) : t(x));
  const mulSign =
    o.multiplicationsign === "cross" ? "\\times " :
    o.multiplicationsign === "none" ? "\\," :
    "\\cdot ";

  switch (e.k) {
    case "num": {
      if (e.d === 1) return `${e.n}`;
      const s = `\\frac{${Math.abs(e.n)}}{${e.d}}`;
      return e.n < 0 ? `-${s}` : s;
    }
    case "float": {
      const s = formatFloat(e.v);
      const [m, ex] = s.split("e");
      const mm = o.decimals === "," ? m.replace(".", "{,}") : m;
      return ex ? `${mm}\\cdot 10^{${ex}}` : mm;
    }
    case "str": return `\\text{${texEscapeText(e.v)}}`;
    case "bool": return e.v ? "\\mathbf{true}" : "\\mathbf{false}";
    case "sym": return texSymbol(e.name, o);
    case "list": return `\\left[ ${e.items.map(t).join(" , ")} \\right]`;
    case "set": return e.items.length ? `\\left \\{${e.items.map(t).join(" , ")} \\right \\}` : "\\left \\{ \\right \\}";
    case "quote": return t(e.e);
    case "index": return `${p(e.target, PREC_ATOM)}_{${e.idx.map(t).join(",")}}`;
    case "seq": return paren(e.items.map(t).join(" , "));
    case "if": case "for":
      return `\\texttt{${texEscapeText(toMaxima(e))}}`;
    case "call": return texCall(e, o);
    case "op": {
      const a = e.args;
      switch (e.op) {
        case "+": {
          let s = p(a[0], 100);
          for (const term of a.slice(1)) {
            const np = negPart(term);
            s += np ? `-${p(np, 101)}` : `+${p(term, 101)}`;
          }
          return s;
        }
        case "neg": return `-${p(a[0], 120)}`;
        case "-": return `${p(a[0], 100)}-${p(a[1], 101)}`;
        case "/": return `\\frac{${t(a[0])}}{${t(a[1])}}`;
        case "*":
        case "^": {
          const fr = decompose(e);
          if (fr) {
            const inFrac = fr.den.length > 0;
            const prod = (fs: Expr[]) =>
              fs.length === 0 ? "1" :
              fs.length === 1 ? (inFrac ? t(fs[0]) : p(fs[0], 120)) :
              fs.map((f) => p(f, 121)).join(mulSign);
            const num = prod(fr.num);
            const s = inFrac ? `\\frac{${num}}{${prod(fr.den)}}` : num;
            return fr.negative ? `-${s}` : s;
          }
          if (e.op === "^") {
            if (isHalf(a[1]) && o.sqrtsign) return `\\sqrt{${t(a[0])}}`;
            if (a[1].k === "num" && a[1].d !== 1 && a[1].n === 1 && o.sqrtsign) {
              return `\\sqrt[${a[1].d}]{${t(a[0])}}`;
            }
            if (a[0].k === "sym" && a[0].name === "%e") return `e^{${t(a[1])}}`;
            const base = callName(a[0]) && TEX_FUNCS[callName(a[0])!] ? paren(t(a[0])) : p(a[0], 141);
            return `${base}^{${t(a[1])}}`;
          }
          return a.map((f, i) => (i === 0 ? p(f, 120) : p(f, 121))).join(mulSign);
        }
        case "=": return `${p(a[0], 81)}=${p(a[1], 81)}`;
        case "#": return `${p(a[0], 81)}\\neq ${p(a[1], 81)}`;
        case "<": return `${p(a[0], 81)} < ${p(a[1], 81)}`;
        case ">": return `${p(a[0], 81)} > ${p(a[1], 81)}`;
        case "<=": return `${p(a[0], 81)}\\leq ${p(a[1], 81)}`;
        case ">=": return `${p(a[0], 81)}\\geq ${p(a[1], 81)}`;
        case "and":
          return a.map((x) => p(x, 66)).join(o.logicsymbol === "symbol" ? "\\land " : "\\,{\\mbox{ and }}\\, ");
        case "or":
          return a.map((x) => p(x, 61)).join(o.logicsymbol === "symbol" ? "\\lor " : "\\,{\\mbox{ or }}\\, ");
        case "not":
          return (o.logicsymbol === "symbol" ? "\\neg " : "{\\rm not}\\, ") + p(a[0], 70);
        case "!": return `${p(a[0], PREC_ATOM)}!`;
        case "!!": return `${p(a[0], PREC_ATOM)}!!`;
        case ".": return `${p(a[0], 130)}\\cdot ${p(a[1], 131)}`;
        case ":": return `${t(a[0])}:${t(a[1])}`;
        case ":=": return `${t(a[0])}:=${t(a[1])}`;
        default: return a.map(t).join(e.op);
      }
    }
  }
  return "?";
}

function texCall(e: Extract<Expr, { k: "call" }>, o: PrintOptions): string {
  const t = (x: Expr) => toTex(x, o);
  const name = callName(e);
  const args = e.args;
  const paren = (s: string) => `\\left(${s}\\right)`;
  if (!name) return `${t(e.fn)}${paren(args.map(t).join(" , "))}`;
  switch (name) {
    case "sqrt": return `\\sqrt{${t(args[0])}}`;
    case "abs": return `\\left| ${t(args[0])}\\right|`;
    case "exp": return `e^{${t(args[0])}}`;
    case "floor": return `\\left\\lfloor ${t(args[0])} \\right\\rfloor`;
    case "ceiling": return `\\left\\lceil ${t(args[0])} \\right\\rceil`;
    case "log10": return `\\log_{10}${paren(t(args[0]))}`;
    case "lg": return args.length === 2 ? `\\log_{${t(args[1])}}${paren(t(args[0]))}` : `\\lg${paren(t(args[0]))}`;
    case "logbase": return `\\log_{${t(args[1])}}${paren(t(args[0]))}`;
    case "nounint":
    case "integrate":
      if (args.length === 4) {
        return `\\int_{${t(args[2])}}^{${t(args[3])}} {${t(args[0])}\\;\\mathrm{d}${t(args[1])}}`;
      }
      return `\\int {${t(args[0])}\\;\\mathrm{d}${t(args[1] ?? { k: "sym", name: "x" })}}`;
    case "noundiff":
    case "diff": {
      const v = args[1] ?? { k: "sym", name: "x" };
      const n = args[2] ? t(args[2]) : "";
      return `\\frac{\\mathrm{d}${n ? "^" + n : ""}}{\\mathrm{d}${t(v)}${n ? "^" + n : ""}}${paren(t(args[0]))}`;
    }
    case "sum":
      if (args.length === 4) return `\\sum_{${t(args[1])}=${t(args[2])}}^{${t(args[3])}}{${t(args[0])}}`;
      break;
    case "product":
      if (args.length === 4) return `\\prod_{${t(args[1])}=${t(args[2])}}^{${t(args[3])}}{${t(args[0])}}`;
      break;
    case "limit":
      if (args.length >= 3) return `\\lim_{${t(args[1])}\\rightarrow ${t(args[2])}}{${t(args[0])}}`;
      break;
    case "binomial": return `{${t(args[0])}\\choose ${t(args[1])}}`;
    case "matrix": {
      const rows = args.map((r) => (r.k === "list" ? r.items : [r]));
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const body = rows.map((r) => r.map(t).join(" & ")).join(" \\\\ ");
      const arr = `\\begin{array}{${"c".repeat(cols)}} ${body} \\end{array}`;
      const pr = o.matrixparens;
      if (pr === "(") return `\\left(${arr}\\right)`;
      if (pr === "{") return `\\left\\{${arr}\\right\\}`;
      if (pr === "|") return `\\left|${arr}\\right|`;
      if (pr === "") return arr;
      return `\\left[${arr}\\right]`;
    }
    case "stackunits": return `${t(args[0])}\\, \\mathrm{${toMaxima(args[1])}}`;
    case "dispdp": case "displaydp": case "dispsf": case "significantfigures":
      return t(args[0]);
    case "stack_disp_comma":
      return t(args[0]);
  }
  const inv = /^(?:a|arc)(\w+)$/.exec(name);
  if (inv && INV_TRIG.includes(inv[1])) {
    const base = inv[1];
    if (o.inversetrig === "cos-1") return `\\${base}^{-1}${paren(args.map(t).join(" , "))}`;
    if (o.inversetrig === "acos") return `{\\rm a${base}}${paren(args.map(t).join(" , "))}`;
    return `{\\rm arc${base}}${paren(args.map(t).join(" , "))}`;
  }
  const fn = TEX_FUNCS[name];
  if (fn) return `${fn} ${paren(args.map(t).join(" , "))}`;
  const head = name.length === 1 ? name : `\\operatorname{${name.replace(/_/g, "\\_").replace(/%/g, "\\%")}}`;
  return `${head}${paren(args.map(t).join(" , "))}`;
}
