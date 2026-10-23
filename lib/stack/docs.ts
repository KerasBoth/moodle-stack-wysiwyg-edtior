// Referenz der wichtigsten STACK- und Maxima-Funktionen (für Autovervollständigung, Hover und Referenzpanel).
// Hier steht nur Sprachunabhängiges (Name, Signatur, Code der Beispiele); Beschreibungen, Rückgaben und
// Kategorien liegen unter `reference.*` in lib/i18n/messages und werden über docText() übersetzt.

import type { MessageKey, Messages, Translator } from "../i18n/index.ts";

export const CATEGORIES = [
  "random",
  "arithmetic",
  "algebra",
  "calculus",
  "lists",
  "sets",
  "logic",
  "strings",
  "matrices",
  "output",
  "mcq",
  "control",
  "constants",
] as const;
export type CategoryId = (typeof CATEGORIES)[number];

/** Art der Rückgabe – Schlüssel unter `reference.returns`. */
export type ReturnId = keyof Messages["reference"]["returns"];

export interface FnDoc {
  name: string;
  sig: string;
  returns: ReturnId;
  /**
   * Beispiel als Code. Erläuternde Wörter stehen als {eg}, {except}, {internalOrder}
   * (Schlüssel unter `reference.example`) und werden in der Sprache der Oberfläche eingesetzt.
   */
  example?: string;
  cat: CategoryId | "jsxgraph";
}

const d = (cat: FnDoc["cat"], name: string, sig: string, returns: ReturnId, example?: string): FnDoc => ({
  cat, name, sig, returns, example,
});

export const FUNCTION_DOCS: FnDoc[] = [
  // ---- Zufall
  d("random", "rand", "rand(n)", "randResult", "rand(6)+1  → 1 … 6\nrand([2,3,5,7]) → {eg} 5"),
  d("random", "rand_with_step", "rand_with_step(lower, upper, step)", "number", "rand_with_step(-5, 5, 2) → {eg} -1"),
  d("random", "rand_with_prohib", "rand_with_prohib(lower, upper, list)", "integer", "rand_with_prohib(-3, 3, [0]) → -3 … 3 {except} 0"),
  d("random", "rand_selection", "rand_selection(list, n)", "listOfN", "rand_selection([a,b,c,d], 2) → {eg} [d,a]"),
  d("random", "rand_selection_with_replacement", "rand_selection_with_replacement(list, n)", "listOfN"),
  d("random", "random_permutation", "random_permutation(list)", "list", "random_permutation([1,2,3]) → {eg} [3,1,2]"),

  // ---- Arithmetik
  d("arithmetic", "abs", "abs(x)", "expr", "abs(-3) → 3"),
  d("arithmetic", "sqrt", "sqrt(x)", "expr", "sqrt(12) → 2*sqrt(3)"),
  d("arithmetic", "mod", "mod(a, b)", "number", "mod(7, 3) → 1"),
  d("arithmetic", "floor", "floor(x)", "integer", "floor(2.7) → 2"),
  d("arithmetic", "ceiling", "ceiling(x)", "integer", "ceiling(2.1) → 3"),
  d("arithmetic", "round", "round(x)", "integer", "round(2.5) → 3"),
  d("arithmetic", "truncate", "truncate(x)", "integer"),
  d("arithmetic", "signum", "signum(x)", "integer"),
  d("arithmetic", "max", "max(a, b, …)", "numberOrExpr", "max(3, 7, 2) → 7"),
  d("arithmetic", "min", "min(a, b, …)", "numberOrExpr"),
  d("arithmetic", "lmax", "lmax(list)", "number"),
  d("arithmetic", "lmin", "lmin(list)", "number"),
  d("arithmetic", "gcd", "gcd(a, b)", "integer", "gcd(12, 18) → 6"),
  d("arithmetic", "lcm", "lcm(a, b)", "integer", "lcm(4, 6) → 12"),
  d("arithmetic", "factorial", "factorial(n) | n!", "integer", "5! → 120"),
  d("arithmetic", "binomial", "binomial(n, k)", "integer", "binomial(5, 2) → 10"),
  d("arithmetic", "num", "num(q)", "expr", "num(3/4) → 3"),
  d("arithmetic", "denom", "denom(q)", "expr", "denom(3/4) → 4"),
  d("arithmetic", "float", "float(expr)", "floatOrExpr", "float(1/3) → 0.3333333333333333"),
  d("arithmetic", "ifactors", "ifactors(n)", "list", "ifactors(12) → [[2,2],[3,1]]"),
  d("arithmetic", "primep", "primep(n)", "bool"),
  d("arithmetic", "next_prime", "next_prime(n)", "integer"),
  d("arithmetic", "divisors", "divisors(n)", "set", "divisors(12) → {1,2,3,4,6,12}"),
  d("arithmetic", "significantfigures", "significantfigures(x, n)", "float", "significantfigures(3.14159, 3) → 3.14"),
  d("arithmetic", "decimalplaces", "decimalplaces(x, n)", "float", "decimalplaces(2.71828, 2) → 2.72"),

  // ---- Algebra
  d("algebra", "expand", "expand(expr)", "expr", "expand((x+1)^2) → x^2+2*x+1"),
  d("algebra", "factor", "factor(expr)", "expr", "factor(x^2-1) → (x-1)*(x+1)"),
  d("algebra", "ratsimp", "ratsimp(expr)", "expr"),
  d("algebra", "fullratsimp", "fullratsimp(expr)", "expr"),
  d("algebra", "radcan", "radcan(expr)", "expr"),
  d("algebra", "trigsimp", "trigsimp(expr)", "expr"),
  d("algebra", "subst", "subst(new, old, expr) | subst(old=new, expr)", "expr", "subst(2, x, x^2+1) → 5"),
  d("algebra", "ev", "ev(expr, opt1, …)", "expr", "ev(x^2, x=3) → 9\nev(2+3, simp) → 5"),
  d("algebra", "solve", "solve(eq, x)", "equationList", "solve(x^2=4, x) → [x=-2, x=2]"),
  d("algebra", "coeff", "coeff(expr, x, n)", "expr", "coeff(3*x^2+2*x, x, 2) → 3"),
  d("algebra", "hipow", "hipow(expr, x)", "integer", "hipow(x^3+x, x) → 3"),
  d("algebra", "lhs", "lhs(eq)", "expr", "lhs(y=2*x) → y"),
  d("algebra", "rhs", "rhs(eq)", "expr", "rhs(y=2*x) → 2*x"),
  d("algebra", "part", "part(expr, n)", "expr", "part(a+b, 1) → b ({internalOrder})"),
  d("algebra", "args", "args(expr)", "list"),
  d("algebra", "op", "op(expr)", "operator", "op(a+b) → \"+\""),
  d("algebra", "exp", "exp(x)", "expr"),
  d("algebra", "log", "log(x)", "expr", "log(%e) → 1"),
  d("algebra", "lg", "lg(x, b)", "expr"),
  d("algebra", "sin", "sin(x)", "expr"),
  d("algebra", "cos", "cos(x)", "expr"),
  d("algebra", "tan", "tan(x)", "expr"),
  d("algebra", "asin", "asin(x)", "expr"),
  d("algebra", "acos", "acos(x)", "expr"),
  d("algebra", "atan", "atan(x)", "expr"),

  // ---- Analysis
  d("calculus", "diff", "diff(expr, x, n)", "expr", "diff(x^3, x) → 3*x^2\ndiff(sin(x), x, 2) → -sin(x)"),
  d("calculus", "integrate", "integrate(expr, x) | integrate(expr, x, a, b)", "expr", "integrate(x^2, x) → x^3/3\nintegrate(x, x, 0, 2) → 2"),
  d("calculus", "limit", "limit(expr, x, a)", "expr", "limit(1/x, x, inf) → 0"),
  d("calculus", "taylor", "taylor(expr, x, a, n)", "expr"),
  d("calculus", "sum", "sum(expr, i, a, b)", "expr", "sum(k^2, k, 1, 3) → 14"),
  d("calculus", "product", "product(expr, i, a, b)", "expr", "product(k, k, 1, 4) → 24"),

  // ---- Listen
  d("lists", "makelist", "makelist(expr, i, a, b) | makelist(expr, i, list)", "list", "makelist(i^2, i, 1, 4) → [1,4,9,16]"),
  d("lists", "length", "length(list)", "integer", "length([a,b,c]) → 3"),
  d("lists", "first", "first(list)", "element", "first([5,6,7]) → 5"),
  d("lists", "second", "second(list)", "element"),
  d("lists", "third", "third(list)", "element"),
  d("lists", "last", "last(list)", "element", "last([5,6,7]) → 7"),
  d("lists", "rest", "rest(list, n)", "list", "rest([1,2,3]) → [2,3]"),
  d("lists", "append", "append(l1, l2, …)", "list", "append([1,2],[3]) → [1,2,3]"),
  d("lists", "cons", "cons(x, list)", "list"),
  d("lists", "endcons", "endcons(x, list)", "list"),
  d("lists", "reverse", "reverse(list)", "list"),
  d("lists", "sort", "sort(list) | sort(list, pred)", "list", "sort([3,1,2]) → [1,2,3]"),
  d("lists", "unique", "unique(list)", "list"),
  d("lists", "flatten", "flatten(list)", "list"),
  d("lists", "member", "member(x, list)", "bool"),
  d("lists", "delete", "delete(x, list)", "list"),
  d("lists", "sublist", "sublist(list, pred)", "list", "sublist([1,2,3,4], evenp) → [2,4]"),
  d("lists", "sublist_indices", "sublist_indices(list, pred)", "list"),
  d("lists", "map", "map(f, list)", "list", "map(lambda([t], t^2), [1,2,3]) → [1,4,9]"),
  d("lists", "apply", "apply(f, list)", "expr", "apply(\"+\", [1,2,3]) → 6\napply(max, [4,9,2]) → 9"),
  d("lists", "lsum", "lsum(expr, i, list)", "expr"),
  d("lists", "zip_with", "zip_with(f, l1, l2)", "list"),

  // ---- Mengen
  d("sets", "setify", "setify(list)", "set", "setify([1,2,2]) → {1,2}"),
  d("sets", "listify", "listify(set)", "list"),
  d("sets", "union", "union(A, B, …)", "set"),
  d("sets", "intersection", "intersection(A, B, …)", "set"),
  d("sets", "setdifference", "setdifference(A, B)", "set"),
  d("sets", "elementp", "elementp(x, A)", "bool"),
  d("sets", "subsetp", "subsetp(A, B)", "bool"),
  d("sets", "cardinality", "cardinality(A)", "integer"),

  // ---- Logik & Prädikate
  d("logic", "is", "is(expr)", "boolUnknown", "is(3>2) → true"),
  d("logic", "numberp", "numberp(x)", "bool"),
  d("logic", "integerp", "integerp(x)", "bool"),
  d("logic", "floatnump", "floatnump(x)", "bool"),
  d("logic", "listp", "listp(x)", "bool"),
  d("logic", "setp", "setp(x)", "bool"),
  d("logic", "stringp", "stringp(x)", "bool"),
  d("logic", "evenp", "evenp(n)", "bool"),
  d("logic", "oddp", "oddp(n)", "bool"),
  d("logic", "emptyp", "emptyp(x)", "bool"),
  d("logic", "freeof", "freeof(x, expr)", "bool"),
  d("logic", "equationp", "equationp(x)", "bool"),
  d("logic", "inequalityp", "inequalityp(x)", "bool"),
  d("logic", "polynomialpsimp", "polynomialpsimp(p)", "bool"),
  d("logic", "expandp", "expandp(p)", "bool"),
  d("logic", "factorp", "factorp(p)", "bool"),

  // ---- Zeichenketten
  d("strings", "string", "string(expr)", "string", "string(x^2) → \"x^2\""),
  d("strings", "sconcat", "sconcat(a, b, …)", "string", "sconcat(\"a=\", 3) → \"a=3\""),
  d("strings", "simplode", "simplode(list, sep)", "string", "simplode([1,2,3], \", \") → \"1, 2, 3\""),
  d("strings", "slength", "slength(s)", "integer"),
  d("strings", "sdowncase", "sdowncase(s)", "string"),
  d("strings", "supcase", "supcase(s)", "string"),
  d("strings", "ssubst", "ssubst(new, old, s)", "string"),
  d("strings", "split", "split(s, sep)", "stringList"),
  d("strings", "parse_string", "parse_string(s)", "expr"),
  d("strings", "eval_string", "eval_string(s)", "expr"),
  d("strings", "castext", "castext(\"…\")", "castext"),

  // ---- Matrizen
  d("matrices", "matrix", "matrix([a,b], [c,d], …)", "matrix", "matrix([1,2],[3,4])"),
  d("matrices", "transpose", "transpose(M)", "matrix"),
  d("matrices", "determinant", "determinant(M)", "expr"),
  d("matrices", "invert", "invert(M)", "matrix"),
  d("matrices", "zeromatrix", "zeromatrix(m, n)", "matrix"),
  d("matrices", "ident", "ident(n)", "matrix"),

  // ---- Ausgabe & Darstellung
  d("output", "dispdp", "dispdp(x, n)", "display", "dispdp(2.5, 2) → 2.50"),
  d("output", "displaydp", "displaydp(x, n)", "display"),
  d("output", "dispsf", "dispsf(x, n)", "display"),
  d("output", "stackunits", "stackunits(num, unit)", "expr", "stackunits(9.81, m/s^2)"),
  d("output", "texput", "texput(name, \"tex\")", "done", "texput(v, \"\\\\vec{v}\")"),
  d("output", "stack_include", "stack_include(\"url\")", "done"),

  // ---- Multiple Choice
  d("mcq", "mcq_correct", "mcq_correct(ta)", "list", "first(mcq_correct([[a,false],[b,true]])) → b"),
  d("mcq", "mcq_incorrect", "mcq_incorrect(ta)", "list"),

  // ---- Steuerung
  d("control", "if", "if cond then a elseif cond2 then b else c", "branchValue", "a: if n>0 then 1 else -1;"),
  d("control", "for", "for i:a thru b do expr | for x in list do expr", "done"),
  d("control", "block", "block([local1, local2], expr1, expr2, …)", "lastValue", "block([t:2], t^2) → 4"),
  d("control", "lambda", "lambda([x, …], expr)", "function", "map(lambda([t], 2*t), [1,2]) → [2,4]"),
  d("control", "define", "define(f(x), expr)", "function"),
  d("control", "return", "return(x)", "x"),
  d("control", "simp", "simp: true | false", "bool"),

  // ---- Konstanten
  d("constants", "%pi", "%pi", "constant"),
  d("constants", "%e", "%e", "constant"),
  d("constants", "%i", "%i", "constant"),
  d("constants", "inf", "inf", "constant"),
  d("constants", "minf", "minf", "constant"),
  d("constants", "true", "true", "boolean"),
  d("constants", "false", "false", "boolean"),
];

export const DOC_BY_NAME = new Map(FUNCTION_DOCS.map((f) => [f.name, f]));

export const MAXIMA_KEYWORDS = ["if", "then", "elseif", "else", "and", "or", "not", "for", "thru", "step", "do", "in", "while", "unless", "from"];

/** Schlüssel eines Eintrags unter `reference.fn` („.“ trennt in Schlüsseln Ebenen). */
export function docKey(name: string): string {
  return name.replace(/\./g, "_");
}

export function categoryLabel(cat: FnDoc["cat"], t: Translator): string {
  return cat === "jsxgraph" ? "JSXGraph" : t(`reference.cat.${cat}`);
}

export interface FnDocText { desc: string; returns: string; example?: string; cat: string }

/** Beschreibung, Rückgabe, Beispiel und Kategorie eines Eintrags in der Sprache von `t`. */
export function docText(doc: FnDoc, t: Translator): FnDocText {
  return {
    desc: t(`reference.fn.${docKey(doc.name)}` as MessageKey),
    returns: t(`reference.returns.${doc.returns}`),
    example: doc.example?.replace(/\{(eg|except|internalOrder)\}/g, (_, k: "eg" | "except" | "internalOrder") =>
      t(`reference.example.${k}`)),
    cat: categoryLabel(doc.cat, t),
  };
}

/** CASText-Elemente für die Vervollständigung im Fragetext. */
export interface CasTextSnippet {
  id: keyof Messages["reference"]["casText"];
  label: string;
  /** Vorlage; ${@name} wird zum Feld ${…} mit dem übersetzten Namen `lib.editor.field.<name>`. */
  insert: string;
}

export const CASTEXT_BLOCKS: CasTextSnippet[] = [
  { id: "if", label: "[[if test=…]]", insert: '[[if test="${@condition}"]]\n${}\n[[else]]\n\n[[/if]]' },
  { id: "foreach", label: "[[foreach x=…]]", insert: '[[foreach ${x}="${@list}"]]${}[[/foreach]]' },
  { id: "define", label: "[[define x=…]]", insert: '[[define ${x}="${@expression}"]]' },
  { id: "comment", label: "[[comment]]", insert: "[[comment]]${}[[/comment]]" },
  { id: "escape", label: "[[escape]]", insert: '[[escape value="${text}"]]' },
  { id: "hint", label: "[[hint title=…]]", insert: '[[hint title="${@hint}"]]${}[[/hint]]' },
  { id: "lang", label: "[[lang code=…]]", insert: '[[lang code="${@langCode}"]]${}[[/lang]]' },
  { id: "jsxgraph", label: "[[jsxgraph]]", insert: '[[jsxgraph width="500px" height="400px"]]\nvar board = JXG.JSXGraph.initBoard(divid, {boundingbox: [-5, 5, 5, -5], axis: true, showCopyright: false});\n${}\n[[/jsxgraph]]' },
  { id: "todo", label: "[[todo]]", insert: "[[todo]]${}[[/todo]]" },
];

type FieldName = keyof Messages["lib"]["editor"]["field"];

/** Vorlage, Kurzbeschreibung und Erläuterung eines CASText-Elements in der Sprache von `t`. */
export function casTextBlockText(b: CasTextSnippet, t: Translator): { label: string; insert: string; detail: string; info: string } {
  return {
    label: b.label,
    insert: b.insert.replace(/\$\{@(\w+)\}/g, (_, f: FieldName) => `\${${t(`lib.editor.field.${f}`)}}`),
    detail: t(`reference.casText.${b.id}.detail`),
    info: t(`reference.casText.${b.id}.info`),
  };
}

export const STACK_JXG_DOCS: FnDoc[] = [
  d("jsxgraph", "stack_jxg.bind_point", "stack_jxg.bind_point(inputRef, point)", "none"),
  d("jsxgraph", "stack_jxg.bind_slider", "stack_jxg.bind_slider(inputRef, slider)", "none"),
  d("jsxgraph", "stack_jxg.bind_point_dual", "stack_jxg.bind_point_dual(inputRef, point)", "none"),
  d("jsxgraph", "stack_jxg.bind_list_of", "stack_jxg.bind_list_of(inputRef, [obj1, obj2, …])", "none"),
];
