// Gemeinsame Ausdrucksstruktur für Parser (AST) und Auswerter (Werte).

export type Expr =
  | { k: "num"; n: number; d: number } // exakte rationale Zahl, d > 0
  | { k: "float"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "sym"; name: string }
  | { k: "list"; items: Expr[] }
  | { k: "set"; items: Expr[] }
  | { k: "op"; op: string; args: Expr[] }
  | { k: "call"; fn: Expr; args: Expr[] }
  | { k: "index"; target: Expr; idx: Expr[] }
  | { k: "if"; conds: Expr[]; thens: Expr[]; els: Expr | null }
  | { k: "seq"; items: Expr[] }
  | {
      k: "for";
      v: string | null;
      from: Expr | null;
      step: Expr | null;
      thru: Expr | null;
      inList: Expr | null;
      whileC: Expr | null;
      unless: Expr | null;
      body: Expr;
    }
  | { k: "quote"; e: Expr };

export interface Statement {
  expr: Expr;
  start: number;
  end: number;
  /** Zuweisungsziel, falls die Anweisung `name: ...` ist. */
  assigns?: string;
}

export interface ParseError {
  message: string;
  from: number;
  to: number;
  severity: "error" | "warning" | "info";
}

export interface ParseResult {
  statements: Statement[];
  errors: ParseError[];
}

// ---- Konstruktoren ---------------------------------------------------------

export const int = (n: number): Expr => ({ k: "num", n, d: 1 });
export const sym = (name: string): Expr => ({ k: "sym", name });
export const str = (v: string): Expr => ({ k: "str", v });
export const bool = (v: boolean): Expr => ({ k: "bool", v });
export const flt = (v: number): Expr => ({ k: "float", v });
export const list = (items: Expr[]): Expr => ({ k: "list", items });
export const op = (o: string, ...args: Expr[]): Expr => ({ k: "op", op: o, args });
export const call = (fn: string, ...args: Expr[]): Expr => ({ k: "call", fn: sym(fn), args });

export const ZERO = int(0);
export const ONE = int(1);
export const MINUS_ONE = int(-1);

export function isNum(e: Expr): e is { k: "num"; n: number; d: number } {
  return e.k === "num";
}
export function isNumeric(e: Expr): boolean {
  return e.k === "num" || e.k === "float";
}
export function numValue(e: Expr): number {
  if (e.k === "num") return e.n / e.d;
  if (e.k === "float") return e.v;
  return NaN;
}
export function callName(e: Expr): string | null {
  return e.k === "call" && e.fn.k === "sym" ? e.fn.name : null;
}
export function isRelation(e: Expr): boolean {
  return e.k === "op" && RELATIONS.has(e.op);
}
export const RELATIONS = new Set(["=", "#", "<", ">", "<=", ">="]);
