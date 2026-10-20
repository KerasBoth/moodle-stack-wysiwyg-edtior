// CodeMirror-Unterstützung für CASText (HTML + STACK-Platzhalter + LaTeX).

import { type Completion, type CompletionContext, type CompletionResult, autocompletion, snippetCompletion } from "@codemirror/autocomplete";
import { html, htmlCompletionSource } from "@codemirror/lang-html";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, MatchDecorator, ViewPlugin, type ViewUpdate, WidgetType, hoverTooltip } from "@codemirror/view";
import { parseExpression, MaximaSyntaxError } from "../maxima/parser.ts";
import { parseCasText } from "../stack/castext.ts";
import { CASTEXT_BLOCKS } from "../stack/docs.ts";
import { editorContext } from "./context.ts";
import { maximaCompletionSource, maximaHoverContent, signatureHelp, trackFocus, wordAt } from "./maxima.ts";

// ---- Hervorhebung der STACK-Elemente --------------------------------------------------

const casDeco = new MatchDecorator({
  regexp: /\{@[\s\S]*?@\}|\{#[\s\S]*?#\}|\[\[[^\]]*\]\]|\\\(|\\\)|\\\[|\\\]/g,
  decoration: (m) => {
    const t = m[0];
    if (t.startsWith("{@")) return Decoration.mark({ class: "cm-cas-expr" });
    if (t.startsWith("{#")) return Decoration.mark({ class: "cm-cas-raw" });
    const ph = /^\[\[\s*(input|validation|feedback):/.exec(t);
    if (ph) return Decoration.mark({ class: `cm-cas-${ph[1]}` });
    if (t.startsWith("[[")) return Decoration.mark({ class: "cm-cas-block" });
    return Decoration.mark({ class: "cm-cas-math" });
  },
});

// Ganzer Formelbereich \( … \) bzw. \[ … \] als getönter Hintergrund (unter den übrigen Markierungen)
const mathDeco = new MatchDecorator({
  regexp: /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g,
  decoration: () => Decoration.mark({ class: "cm-cas-mathspan" }),
});

function decoPlugin(deco: MatchDecorator) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = deco.createDeco(view); }
      update(u: ViewUpdate) { this.decorations = deco.updateDeco(u, this.decorations); }
    },
    { decorations: (v) => v.decorations },
  );
}

// Gespeicherte Daten des Grafik-Editors als kompakter Baustein statt einer langen Base64-Zeile
class JsxDataWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-jsx-data";
    el.textContent = "Grafik-Editor-Daten";
    el.title = "Gespeicherter Stand des Grafik-Editors. Cursor in die Grafik setzen und „Grafik“ klicken, um sie zu bearbeiten.";
    return el;
  }
  eq() { return true; }
}
const jsxDataDeco = new MatchDecorator({
  regexp: /\/\*\s*stack-editor:jsx\s+[A-Za-z0-9+/=]+\s*\*\//g,
  decoration: () => Decoration.replace({ widget: new JsxDataWidget() }),
});
const jsxDataPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = jsxDataDeco.createDeco(view); }
    update(u: ViewUpdate) { this.decorations = jsxDataDeco.updateDeco(u, this.decorations); }
  },
  {
    decorations: (v) => v.decorations,
    // Der Baustein wird beim Bewegen des Cursors und beim Löschen als Ganzes behandelt
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
  },
);

const casHighlighter = [decoPlugin(mathDeco), decoPlugin(casDeco), jsxDataPlugin];

// ---- Kontext: sind wir in {@ … @}? ---------------------------------------------------

function inCasExpr(text: string, pos: number): boolean {
  const before = text.slice(Math.max(0, pos - 2000), pos);
  const open = Math.max(before.lastIndexOf("{@"), before.lastIndexOf("{#"));
  if (open < 0) return false;
  const close = Math.max(before.lastIndexOf("@}"), before.lastIndexOf("#}"));
  return close < open;
}

// ---- Vervollständigung -----------------------------------------------------------------

function placeholderCompletions(): Completion[] {
  const { inputs, prts } = editorContext.current;
  const out: Completion[] = [];
  for (const i of inputs) {
    out.push({ label: `[[input:${i}]]`, type: "property", detail: "Eingabefeld", boost: 3 });
    out.push({ label: `[[validation:${i}]]`, type: "property", detail: "Validierung", boost: 2 });
    out.push({ label: `[[input:${i}]] [[validation:${i}]]`, type: "property", detail: "Eingabe + Validierung", boost: 4 });
  }
  for (const p of prts) out.push({ label: `[[feedback:${p}]]`, type: "property", detail: "PRT-Feedback", boost: 2 });
  for (const b of CASTEXT_BLOCKS) {
    out.push(snippetCompletion(b.insert, { label: b.label, type: "keyword", detail: b.detail, info: b.info }));
  }
  out.push({ label: "[[/if]]", type: "keyword", detail: "Ende if" });
  out.push({ label: "[[else]]", type: "keyword", detail: "Sonst-Zweig" });
  out.push(snippetCompletion('[[elif test="${bed}"]]', { label: "[[elif test=…]]", type: "keyword", detail: "Weiterer Zweig" }));
  return out;
}

const LATEX_SNIPPETS: Completion[] = [
  snippetCompletion("\\frac{${a}}{${b}}", { label: "\\frac", detail: "Bruch", type: "text" }),
  snippetCompletion("\\sqrt{${x}}", { label: "\\sqrt", detail: "Wurzel", type: "text" }),
  snippetCompletion("\\left( ${} \\right)", { label: "\\left(", detail: "Klammern", type: "text" }),
  snippetCompletion("\\cdot", { label: "\\cdot", detail: "Malpunkt", type: "text" }),
  snippetCompletion("\\mathbb{R}", { label: "\\mathbb{R}", detail: "reelle Zahlen", type: "text" }),
  snippetCompletion("\\infty", { label: "\\infty", detail: "unendlich", type: "text" }),
  snippetCompletion("\\neq", { label: "\\neq", detail: "ungleich", type: "text" }),
  snippetCompletion("\\leq", { label: "\\leq", detail: "kleiner gleich", type: "text" }),
  snippetCompletion("\\geq", { label: "\\geq", detail: "größer gleich", type: "text" }),
  snippetCompletion("\\int_{${a}}^{${b}} ${f} \\,\\mathrm{d}x", { label: "\\int", detail: "Integral", type: "text" }),
  snippetCompletion("\\sum_{${i}=${1}}^{${n}} ${}", { label: "\\sum", detail: "Summe", type: "text" }),
  snippetCompletion("\\lim_{${x} \\to ${a}} ${}", { label: "\\lim", detail: "Grenzwert", type: "text" }),
  snippetCompletion("\\qquad", { label: "\\qquad", detail: "Abstand", type: "text" }),
  snippetCompletion("\\text{${}}", { label: "\\text", detail: "Text im Formelmodus", type: "text" }),
];

function casTextCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const text = ctx.state.doc.toString();
  if (inCasExpr(text, ctx.pos)) return maximaCompletionSource(ctx);
  // Von der Klammerergänzung schon eingefügte "]]" bzw. "}" werden beim Übernehmen mit ersetzt
  const closing = (s: string) => (ctx.state.sliceDoc(ctx.pos, ctx.pos + s.length) === s ? ctx.pos + s.length : ctx.pos);
  const ph = ctx.matchBefore(/\[\[[\w:/ ="-]*$/);
  if (ph) return { from: ph.from, to: closing("]]"), options: placeholderCompletions(), validFor: /^\[\[[\w:/ ="-]*$/ };
  const tex = ctx.matchBefore(/\\[A-Za-z]*$/);
  if (tex && (tex.text.length > 1 || ctx.explicit)) return { from: tex.from, options: LATEX_SNIPPETS, validFor: /^\\[A-Za-z]*$/ };
  const cas = ctx.matchBefore(/\{[@#]?$/);
  if (cas) {
    const vars = editorContext.current.variables.map((v) => ({
      label: `{@${v.name}@}`, type: "variable", detail: `= ${v.value.slice(0, 40)}`, boost: 2,
    }));
    const raws = editorContext.current.variables.map((v) => ({ label: `{#${v.name}#}`, type: "variable", detail: "Rohwert" }));
    return { from: cas.from, to: closing("}"), options: [...vars, ...raws, snippetCompletion("{@${ausdruck}@}", { label: "{@ … @}", detail: "LaTeX-Ausgabe" })] };
  }
  return null;
}

// ---- Hover ---------------------------------------------------------------------------------

const casHover = hoverTooltip((view, pos) => {
  const text = view.state.doc.toString();
  if (!inCasExpr(text, pos)) return null;
  const w = wordAt(view.state, pos);
  if (!w) return null;
  const content = maximaHoverContent(w.text);
  return content ? { pos: w.from, end: w.to, above: true, create: () => ({ dom: content }) } : null;
}, { hoverTime: 350 });

// ---- Linting ------------------------------------------------------------------------------------

const casLinter = linter((view) => {
  const src = view.state.doc.toString();
  const out: Diagnostic[] = [];
  for (const m of src.matchAll(/\{@([\s\S]*?)@\}|\{#([\s\S]*?)#\}/g)) {
    const body = (m[1] ?? m[2]).split(/,\s*simp\s*=/)[0];
    try {
      parseExpression(body);
    } catch (e) {
      if (e instanceof MaximaSyntaxError) {
        const from = (m.index ?? 0) + 2 + Math.min(e.from, body.length);
        out.push({ from, to: Math.min(src.length, Math.max(from + 1, (m.index ?? 0) + 2 + e.to)), severity: "error", message: e.message });
      }
    }
  }
  const { inputs, prts } = editorContext.current;
  for (const m of src.matchAll(/\[\[\s*(input|validation|feedback):(\w+)\s*\]\]/g)) {
    const [, kind, name] = m;
    const known = kind === "feedback" ? prts : inputs;
    if (!known.includes(name)) {
      out.push({
        from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, severity: "warning",
        message: kind === "feedback" ? `PRT „${name}“ ist nicht definiert` : `Eingabe „${name}“ ist nicht definiert`,
      });
    }
  }
  for (const e of parseCasText(src).errors) out.push({ from: 0, to: Math.min(1, src.length), severity: "warning", message: e });
  // Klammerung des Formelmodus
  const opens = (src.match(/\\\(/g) ?? []).length, closes = (src.match(/\\\)/g) ?? []).length;
  if (opens !== closes) out.push({ from: 0, to: Math.min(1, src.length), severity: "warning", message: `Formelmodus unausgeglichen: ${opens}× \\( aber ${closes}× \\)` });
  return out;
}, { delay: 400 });

// ---- {@ … @} und {# … #} automatisch schließen ---------------------------------------------------

/**
 * Nach „{“ ergänzt die Klammervervollständigung „}“. Tippt man dann „@“ bzw. „#“, wird daraus „{@|@}“.
 * Tippt man das schließende Zeichen selbst, springt der Cursor nur darüber.
 */
const casAutoClose = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to) return false;
  const doc = view.state.doc;
  // „@|}“ + „}“: über die vorhandene Klammer springen
  if (text === "}" && /[@#]$/.test(doc.sliceString(Math.max(0, from - 1), from)) && doc.sliceString(from, from + 1) === "}") {
    view.dispatch({ selection: { anchor: from + 1 } });
    return true;
  }
  if (text !== "@" && text !== "#") return false;
  const prev = doc.sliceString(Math.max(0, from - 1), from);
  const next2 = doc.sliceString(from, Math.min(doc.length, from + 2));
  // Schließendes Zeichen schon vorhanden: nur darüber springen
  if (next2 === `${text}}` && inCasExpr(doc.toString(), from)) {
    view.dispatch({ selection: { anchor: from + 1 } });
    return true;
  }
  if (prev !== "{") return false;
  const restOfLine = doc.sliceString(from, doc.lineAt(from).to);
  if (restOfLine.startsWith("}")) {
    // „{|}“ → „{@|@}“
    view.dispatch({ changes: { from, insert: `${text}${text}` }, selection: { anchor: from + 1 } });
    return true;
  }
  // „{“ ohne Gegenstück: schließen, sofern dahinter nicht schon ein passendes „@}“ folgt
  const close = restOfLine.indexOf(`${text}}`);
  const nextOpen = restOfLine.search(/\{[@#]/);
  if (close >= 0 && (nextOpen < 0 || close < nextOpen)) return false;
  view.dispatch({ changes: { from, insert: `${text}${text}}` }, selection: { anchor: from + 1 } });
  return true;
});

export function casTextExtensions(): Extension[] {
  return [
    casAutoClose,
    html({ autoCloseTags: true, matchClosingTags: true }),
    casHighlighter,
    autocompletion({ override: [casTextCompletionSource, htmlCompletionSource], activateOnTyping: true }),
    casHover,
    signatureHelp,
    casLinter,
    trackFocus,
    EditorView.lineWrapping,
  ];
}
