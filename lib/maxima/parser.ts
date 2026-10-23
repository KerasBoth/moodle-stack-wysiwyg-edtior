// Pratt-Parser für die in STACK verwendete Maxima-Teilsprache.
// Wie STACK selbst werden fehlende Semikolons am Zeilenende ergänzt.

import { LocalizedError, type MessageKey, type Msg, type Params } from "../i18n/index.ts";
import type { Expr, ParseError, ParseResult, Statement } from "./types.ts";

export type TokType = "num" | "str" | "id" | "op" | "eof";

export interface Token {
  t: TokType;
  v: string;
  from: number;
  to: number;
  /** Zeilenumbruch zwischen vorherigem und diesem Token. */
  nl: boolean;
}

const KEYWORDS = new Set([
  "if", "then", "elseif", "else", "and", "or", "not",
  "for", "from", "step", "thru", "while", "unless", "do", "in", "next",
]);

const OPERATORS = [
  "::=", ":=", "::", "<=", ">=", "**", "^^", "''", "!!",
  ":", "#", "=", "<", ">", "+", "-", "*", "/", "^", ".", "!", "'",
  ",", ";", "$", "(", ")", "[", "]", "{", "}", "~", "@", "|",
];

/** Syntaxfehler mit Stelle; `.msg` für die Anzeige, `.message` bleibt deutsch. */
export class MaximaSyntaxError extends LocalizedError {
  constructor(key: MessageKey, params: Params | undefined, public from: number, public to: number) {
    super(key, params);
    this.name = "MaximaSyntaxError";
  }
}

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let nl = false;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { nl = true; i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === " ") { i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new MaximaSyntaxError("lib.parser.unclosedComment", undefined, i, n);
      if (src.slice(i, end).includes("\n")) nl = true;
      i = end + 2;
      continue;
    }
    const from = i;
    if (c === '"') {
      let s = "";
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < n) { s += src[i + 1]; i += 2; continue; }
        s += src[i++];
      }
      if (i >= n) throw new MaximaSyntaxError("lib.parser.unclosedString", undefined, from, n);
      i++;
      toks.push({ t: "str", v: s, from, to: i, nl });
      nl = false;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(\d*\.?\d*)([eEbBdD][+-]?\d+)?/.exec(src.slice(i))!;
      let text = m[0];
      // "1." gefolgt von Buchstaben (z. B. 1.x) ist kein gültiger Exponent – Standardfall reicht aus.
      i += text.length;
      text = text.replace(/[bBdD]/, "e");
      toks.push({ t: "num", v: text, from, to: i, nl });
      nl = false;
      continue;
    }
    if (/[A-Za-z_%À-ɏ?]/.test(c)) {
      const m = /^[A-Za-z_%À-ɏ?][A-Za-z0-9_%À-ɏ?]*/.exec(src.slice(i))!;
      i += m[0].length;
      toks.push({ t: "id", v: m[0], from, to: i, nl });
      nl = false;
      continue;
    }
    const opTok = OPERATORS.find((o) => src.startsWith(o, i));
    if (opTok) {
      i += opTok.length;
      toks.push({ t: "op", v: opTok, from, to: i, nl });
      nl = false;
      continue;
    }
    throw new MaximaSyntaxError("lib.parser.unexpectedChar", { char: c }, i, i + 1);
  }
  toks.push({ t: "eof", v: "", from: n, to: n, nl: true });
  return toks;
}

// Bindungsstärken nach Maxima
const LBP: Record<string, number> = {
  ":": 180, "::": 180, ":=": 180, "::=": 180,
  or: 60, and: 65,
  "=": 80, "#": 80, "<": 80, ">": 80, "<=": 80, ">=": 80,
  "+": 100, "-": 100,
  "*": 120, "/": 120,
  ".": 130,
  "^": 140, "**": 140, "^^": 140,
  "!": 160, "!!": 160,
  "(": 200, "[": 200,
};

class Parser {
  pos = 0;
  constructor(public toks: Token[], public src: string) {}

  peek(): Token { return this.toks[this.pos]; }
  next(): Token {
    const t = this.toks[this.pos];
    if (t.t !== "eof") this.pos++;
    return t;
  }
  isOp(v: string, tok = this.peek()): boolean {
    return tok.t === "op" && tok.v === v;
  }
  isKw(v: string, tok = this.peek()): boolean {
    return tok.t === "id" && tok.v === v;
  }
  expectOp(v: string, ctx: MessageKey): Token {
    const t = this.peek();
    if (!this.isOp(v)) {
      throw new MaximaSyntaxError(
        "lib.parser.expected",
        { token: v, context: { key: ctx }, found: describe(t) },
        t.from,
        Math.max(t.to, t.from + 1),
      );
    }
    return this.next();
  }
  expectKw(v: string, ctx: MessageKey): Token {
    const t = this.peek();
    if (!this.isKw(v)) {
      throw new MaximaSyntaxError(
        "lib.parser.expected", { token: v, context: { key: ctx }, found: describe(t) }, t.from, Math.max(t.to, t.from + 1),
      );
    }
    return this.next();
  }

  lbp(tok: Token): number {
    if (tok.t === "op") return LBP[tok.v] ?? 0;
    if (tok.t === "id" && (tok.v === "and" || tok.v === "or")) return LBP[tok.v];
    return 0;
  }

  expr(rbp: number): Expr {
    let left = this.nud(this.next());
    for (;;) {
      const t = this.peek();
      // Aufrufe/Indizes nicht über Zeilengrenzen hinweg (fehlendes Semikolon)
      if ((this.isOp("(", t) || this.isOp("[", t)) && t.nl) break;
      const lbp = this.lbp(t);
      if (lbp <= rbp) break;
      this.next();
      left = this.led(t, left);
    }
    return left;
  }

  nud(t: Token): Expr {
    switch (t.t) {
      case "num": {
        if (/^\d+$/.test(t.v)) return { k: "num", n: Number(t.v), d: 1 };
        return { k: "float", v: Number(t.v) };
      }
      case "str":
        return { k: "str", v: t.v };
      case "eof":
        throw new MaximaSyntaxError("lib.parser.unexpectedEnd", undefined, t.from, t.to);
      case "id": {
        switch (t.v) {
          case "true": return { k: "bool", v: true };
          case "false": return { k: "bool", v: false };
          case "not": return { k: "op", op: "not", args: [this.expr(70)] };
          case "if": return this.parseIf();
          case "for":
          case "while":
          case "unless":
          case "do":
            return this.parseFor(t);
          default:
            if (KEYWORDS.has(t.v)) {
              throw new MaximaSyntaxError("lib.parser.keywordNotExpected", { word: t.v }, t.from, t.to);
            }
            return { k: "sym", name: t.v };
        }
      }
      case "op": {
        switch (t.v) {
          case "-": return { k: "op", op: "neg", args: [this.expr(134)] };
          case "+": return this.expr(134);
          case "'":
          case "''":
            return { k: "quote", e: this.expr(190) };
          case "(": {
            if (this.isOp(")")) {
              throw new MaximaSyntaxError("lib.parser.emptyParens", undefined, t.from, this.peek().to);
            }
            const items = this.commaList(")", "lib.parser.context.parens");
            return items.length === 1 ? items[0] : { k: "seq", items };
          }
          case "[": {
            const items = this.isOp("]") ? (this.next(), []) : this.commaList("]", "lib.parser.context.list");
            return { k: "list", items };
          }
          case "{": {
            const items = this.isOp("}") ? (this.next(), []) : this.commaList("}", "lib.parser.context.set");
            return { k: "set", items };
          }
        }
      }
    }
    throw new MaximaSyntaxError("lib.parser.unexpectedToken", { token: describe(t) }, t.from, t.to);
  }

  commaList(close: string, ctx: MessageKey): Expr[] {
    const items: Expr[] = [];
    for (;;) {
      items.push(this.expr(0));
      if (this.isOp(",")) { this.next(); continue; }
      this.expectOp(close, ctx);
      return items;
    }
  }

  led(t: Token, left: Expr): Expr {
    const v = t.v;
    switch (v) {
      case ":":
      case "::":
      case ":=":
      case "::=":
        return { k: "op", op: v === "::=" ? ":=" : v === "::" ? ":" : v, args: [left, this.expr(20)] };
      case "and":
      case "or": {
        const args = [left, this.expr(LBP[v])];
        return { k: "op", op: v, args };
      }
      case "^":
      case "**":
        return { k: "op", op: "^", args: [left, this.expr(139)] };
      case "^^":
        return { k: "op", op: "^^", args: [left, this.expr(139)] };
      case "!":
      case "!!":
        return { k: "op", op: v, args: [left] };
      case "(": {
        const args = this.isOp(")") ? (this.next(), []) : this.commaList(")", "lib.parser.context.call");
        return { k: "call", fn: left, args };
      }
      case "[": {
        const idx = this.commaList("]", "lib.parser.context.index");
        return { k: "index", target: left, idx };
      }
      default:
        return { k: "op", op: v, args: [left, this.expr(LBP[v])] };
    }
  }

  parseIf(): Expr {
    const conds: Expr[] = [];
    const thens: Expr[] = [];
    let els: Expr | null = null;
    conds.push(this.expr(45));
    this.expectKw("then", "lib.parser.context.afterIf");
    thens.push(this.expr(45));
    for (;;) {
      if (this.isKw("elseif")) {
        this.next();
        conds.push(this.expr(45));
        this.expectKw("then", "lib.parser.context.afterElseif");
        thens.push(this.expr(45));
        continue;
      }
      if (this.isKw("else")) {
        this.next();
        els = this.expr(45);
      }
      break;
    }
    return { k: "if", conds, thens, els };
  }

  parseFor(first: Token): Expr {
    const f: Extract<Expr, { k: "for" }> = {
      k: "for", v: null, from: null, step: null, thru: null, inList: null, whileC: null, unless: null,
      body: { k: "bool", v: false },
    };
    let tok: Token | null = first;
    if (first.v === "for") {
      const name = this.next();
      if (name.t !== "id") throw new MaximaSyntaxError("lib.parser.forVariable", undefined, name.from, name.to);
      f.v = name.v;
      if (this.isOp(":")) { this.next(); f.from = this.expr(45); }
      else if (this.isKw("from")) { this.next(); f.from = this.expr(45); }
      else if (this.isKw("in")) { this.next(); f.inList = this.expr(45); }
      tok = null;
    }
    for (;;) {
      const t = tok ?? this.next();
      tok = null;
      if (t.t !== "id") throw new MaximaSyntaxError("lib.parser.unexpectedInFor", { token: describe(t) }, t.from, t.to);
      switch (t.v) {
        case "step": f.step = this.expr(45); break;
        case "thru": f.thru = this.expr(45); break;
        case "while": f.whileC = this.expr(45); break;
        case "unless": f.unless = this.expr(45); break;
        case "do": f.body = this.expr(25); return f;
        default:
          throw new MaximaSyntaxError("lib.parser.unexpectedInFor", { token: describe(t) }, t.from, t.to);
      }
    }
  }
}

function describe(t: Token): Msg {
  if (t.t === "eof") return { key: "lib.parser.token.end" };
  if (t.t === "str") return { key: "lib.parser.token.string", params: { text: t.v } };
  return { key: "lib.parser.token.quoted", params: { text: t.v } };
}

/** Zerlegt einen ganzen Variablen-Block in Anweisungen. Bricht beim ersten Fehler nicht ab. */
export function parseStatements(src: string): ParseResult {
  const errors: ParseError[] = [];
  const statements: Statement[] = [];
  let toks: Token[];
  try {
    toks = tokenize(src);
  } catch (e) {
    if (e instanceof MaximaSyntaxError) {
      errors.push({ message: e.msg, from: e.from, to: e.to, severity: "error" });
      return { statements, errors };
    }
    throw e;
  }
  const p = new Parser(toks, src);
  while (p.peek().t !== "eof") {
    if (p.isOp(";") || p.isOp("$")) { p.next(); continue; }
    const startTok = p.peek();
    try {
      const expr = p.expr(0);
      const endTok = p.toks[p.pos - 1];
      const stmt: Statement = { expr, start: startTok.from, end: endTok.to };
      if (expr.k === "op" && (expr.op === ":" || expr.op === ":=")) {
        const lhs = expr.args[0];
        if (lhs.k === "sym") stmt.assigns = lhs.name;
        else if (lhs.k === "call" && lhs.fn.k === "sym") stmt.assigns = lhs.fn.name;
      }
      statements.push(stmt);
      const nt = p.peek();
      if (p.isOp(";") || p.isOp("$")) { p.next(); continue; }
      if (nt.t === "eof") continue;
      if (nt.nl) {
        errors.push({
          message: { key: "lib.parser.missingSemicolon" },
          from: endTok.to,
          to: endTok.to,
          severity: "info",
        });
        continue;
      }
      throw new MaximaSyntaxError("lib.parser.missingOperator", { token: describe(nt) }, nt.from, Math.max(nt.to, nt.from + 1));
    } catch (e) {
      if (!(e instanceof MaximaSyntaxError)) throw e;
      errors.push({ message: e.msg, from: e.from, to: Math.max(e.to, e.from + 1), severity: "error" });
      // Bis zum nächsten Semikolon bzw. zur nächsten Zeile überspringen
      const errLine = lineOf(src, e.from);
      while (p.peek().t !== "eof") {
        const t = p.peek();
        if (p.isOp(";") || p.isOp("$")) { p.next(); break; }
        if (t.nl && lineOf(src, t.from) > errLine) break;
        p.next();
      }
    }
  }
  return { statements, errors };
}

function lineOf(src: string, pos: number): number {
  let l = 0;
  for (let i = 0; i < pos && i < src.length; i++) if (src[i] === "\n") l++;
  return l;
}

/** Parst genau einen Ausdruck (z. B. eine Musterlösung oder Schülereingabe). */
export function parseExpression(src: string): Expr {
  const toks = tokenize(src);
  const p = new Parser(toks, src);
  if (p.peek().t === "eof") throw new MaximaSyntaxError("lib.parser.emptyExpression", undefined, 0, 0);
  const e = p.expr(0);
  while (p.isOp(";") || p.isOp("$")) p.next();
  const t = p.peek();
  if (t.t !== "eof") {
    throw new MaximaSyntaxError("lib.parser.afterExpression", { token: describe(t) }, t.from, Math.max(t.to, t.from + 1));
  }
  return e;
}
