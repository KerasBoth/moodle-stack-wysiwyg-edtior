// CodeMirror-6-Unterstützung für Maxima/STACK.

import {
  type Completion, type CompletionContext, type CompletionResult, autocompletion, snippetCompletion,
} from "@codemirror/autocomplete";
import { StreamLanguage, type StringStream } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import { type EditorState, type Extension, StateField } from "@codemirror/state";
import { EditorView, type Tooltip, hoverTooltip, showTooltip } from "@codemirror/view";
import { parseExpression, parseStatements, MaximaSyntaxError } from "../maxima/parser.ts";
import { DOC_BY_NAME, FUNCTION_DOCS, type FnDoc, MAXIMA_KEYWORDS } from "../stack/docs.ts";
import { editorContext } from "./context.ts";

// ---- Syntaxhervorhebung ---------------------------------------------------------

const KEYWORDS = new Set(MAXIMA_KEYWORDS);
const ATOMS = new Set(["true", "false", "%pi", "%e", "%i", "inf", "minf", "und", "%phi", "%gamma"]);
const BUILTINS = new Set(FUNCTION_DOCS.map((f) => f.name));

interface MState { inComment: boolean }

export const maximaLanguage = StreamLanguage.define<MState>({
  name: "maxima",
  startState: () => ({ inComment: false }),
  token(stream: StringStream, state: MState) {
    if (state.inComment) {
      if (stream.skipTo("*/")) { stream.next(); stream.next(); state.inComment = false; }
      else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("/*")) { state.inComment = true; return "comment"; }
    if (stream.peek() === '"') {
      stream.next();
      let esc = false;
      let ch: string | void;
      while ((ch = stream.next()) != null) {
        if (ch === '"' && !esc) break;
        esc = !esc && ch === "\\";
      }
      return "string";
    }
    if (stream.match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/)) return "number";
    const m = stream.match(/^[A-Za-z_%?À-ɏ][A-Za-z0-9_%?À-ɏ]*/) as RegExpMatchArray | null;
    if (m) {
      const w = m[0];
      if (KEYWORDS.has(w)) return "keyword";
      if (ATOMS.has(w)) return "atom";
      if (/^\s*:(?!=)/.test(stream.string.slice(stream.pos)) || /^\s*:=/.test(stream.string.slice(stream.pos))) return "def";
      if (stream.peek() === "(" && (BUILTINS.has(w) || true)) return BUILTINS.has(w) ? "builtin" : "variable-2";
      return "variable";
    }
    if (stream.match(/^(:=|::|<=|>=|\*\*|\^\^|[:#=<>+\-*/^.!'])/)) return "operator";
    if (stream.match(/^[()[\]{}]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
});

// ---- Dokumentations-Darstellung -------------------------------------------------------

export function renderDoc(doc: FnDoc): HTMLElement {
  const el = document.createElement("div");
  el.className = "cm-stack-doc";
  const sig = document.createElement("div");
  sig.className = "cm-stack-doc-sig";
  sig.textContent = doc.sig;
  el.appendChild(sig);
  const desc = document.createElement("div");
  desc.className = "cm-stack-doc-desc";
  desc.textContent = doc.desc;
  el.appendChild(desc);
  const ret = document.createElement("div");
  ret.className = "cm-stack-doc-ret";
  ret.innerHTML = "<b>Rückgabe:</b> ";
  ret.appendChild(document.createTextNode(doc.returns));
  el.appendChild(ret);
  if (doc.example) {
    const ex = document.createElement("pre");
    ex.className = "cm-stack-doc-ex";
    ex.textContent = doc.example;
    el.appendChild(ex);
  }
  return el;
}

function renderVar(name: string, value: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "cm-stack-doc";
  const sig = document.createElement("div");
  sig.className = "cm-stack-doc-sig";
  sig.textContent = `${name} (Variable)`;
  el.appendChild(sig);
  const v = document.createElement("pre");
  v.className = "cm-stack-doc-ex";
  v.textContent = `= ${value}`;
  el.appendChild(v);
  const hint = document.createElement("div");
  hint.className = "cm-stack-doc-desc";
  hint.textContent = "Wert in der aktuellen Vorschau-Variante";
  el.appendChild(hint);
  return el;
}

// ---- Autovervollständigung ------------------------------------------------------------------

const FUNCTION_SNIPPETS: Completion[] = [
  snippetCompletion("if ${bedingung} then ${a} else ${b}", { label: "if … then … else", type: "keyword", detail: "Bedingung", boost: -1 }),
  snippetCompletion("block([${lokal}],\n  ${}\n)", { label: "block([…], …)", type: "keyword", detail: "Block mit lokalen Variablen", boost: -1 }),
  snippetCompletion("makelist(${ausdruck}, ${i}, ${1}, ${n})", { label: "makelist(…, i, a, b)", type: "function", detail: "Liste erzeugen", boost: -1 }),
  snippetCompletion("lambda([${x}], ${ausdruck})", { label: "lambda([x], …)", type: "function", detail: "Anonyme Funktion", boost: -1 }),
  snippetCompletion("[[${wert1}, true], [${wert2}, false]]", { label: "MC-Musterlösung [[…,true],…]", type: "text", detail: "dropdown/radio/checkbox", boost: -2 }),
];

function variableCompletions(): Completion[] {
  const { variables, functions, inputs } = editorContext.current;
  const out: Completion[] = variables.map((v) => ({
    label: v.name,
    type: "variable",
    detail: v.value.length > 40 ? `= ${v.value.slice(0, 40)}…` : `= ${v.value}`,
    info: () => renderVar(v.name, v.value),
    boost: 5,
  }));
  for (const f of functions) out.push({ label: f, type: "function", detail: "eigene Funktion", apply: `${f}(`, boost: 4 });
  for (const i of inputs) out.push({ label: i, type: "property", detail: "Eingabe (Schülerantwort)", boost: 3 });
  return out;
}

function docCompletions(): Completion[] {
  return FUNCTION_DOCS.map((doc) => ({
    label: doc.name,
    type: doc.cat === "Konstanten" ? "constant" : doc.cat === "Steuerung" ? "keyword" : "function",
    detail: doc.sig.length > 46 ? doc.cat : doc.sig,
    info: () => renderDoc(doc),
    apply: doc.cat === "Konstanten" || doc.cat === "Steuerung" || doc.name === "simp" ? doc.name : `${doc.name}(`,
  }));
}

let cachedDocs: Completion[] | null = null;

/** Vervollständigt Maxima-Bezeichner. `inCasText` begrenzt auf Bereiche innerhalb {@ @}/{# #}. */
export function maximaCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[A-Za-z_%][A-Za-z0-9_%]*/);
  if (!word && !ctx.explicit) return null;
  // Nicht in Zeichenketten/Kommentaren vervollständigen
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  if ((before.match(/"/g)?.length ?? 0) % 2 === 1) return null;
  cachedDocs ??= docCompletions();
  return {
    from: word ? word.from : ctx.pos,
    options: [...variableCompletions(), ...cachedDocs, ...FUNCTION_SNIPPETS],
    validFor: /^[A-Za-z0-9_%]*$/,
  };
}

// ---- Hover ------------------------------------------------------------------------------------------

export function wordAt(state: EditorState, pos: number): { from: number; to: number; text: string } | null {
  const line = state.doc.lineAt(pos);
  const re = /[A-Za-z_%][A-Za-z0-9_%]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const from = line.from + m.index, to = from + m[0].length;
    if (pos >= from && pos <= to) return { from, to, text: m[0] };
  }
  return null;
}

export function maximaHoverContent(name: string): HTMLElement | null {
  const v = editorContext.current.variables.find((x) => x.name === name);
  if (v) return renderVar(v.name, v.value);
  const doc = DOC_BY_NAME.get(name);
  if (doc) return renderDoc(doc);
  if (editorContext.current.inputs.includes(name)) {
    const el = document.createElement("div");
    el.className = "cm-stack-doc";
    el.textContent = `${name}: Eingabe – enthält die Antwort der Studierenden (nur in PRTs/Feedback verfügbar).`;
    return el;
  }
  return null;
}

export const maximaHover = hoverTooltip((view, pos) => {
  const w = wordAt(view.state, pos);
  if (!w) return null;
  const content = maximaHoverContent(w.text);
  if (!content) return null;
  return { pos: w.from, end: w.to, above: true, create: () => ({ dom: content }) };
}, { hoverTime: 350 });

// ---- Signaturhilfe ------------------------------------------------------------------------------------

export function findCallContext(text: string, pos: number): { name: string; argIndex: number } | null {
  let depth = 0, arg = 0;
  const start = Math.max(0, pos - 3000);
  for (let i = pos - 1; i >= start; i--) {
    const c = text[i];
    if (c === '"') {
      // Zeichenkette überspringen
      const j = text.lastIndexOf('"', i - 1);
      if (j < 0) return null;
      i = j;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth === 0) {
        if (c !== "(") return null;
        const m = /([A-Za-z_%][A-Za-z0-9_%]*)\s*$/.exec(text.slice(Math.max(0, i - 60), i));
        return m ? { name: m[1], argIndex: arg } : null;
      }
      depth--;
    } else if (c === "," && depth === 0) arg++;
    else if ((c === ";" || c === "$") && depth === 0) return null;
  }
  return null;
}

function splitSigParams(sig: string): { head: string; params: string[]; tail: string } | null {
  const first = sig.split(/\s{2,}bzw\.|\s+\|\s+/)[0];
  const open = first.indexOf("(");
  const close = first.lastIndexOf(")");
  if (open < 0 || close < open) return null;
  return {
    head: first.slice(0, open + 1),
    params: first.slice(open + 1, close).split(",").map((p) => p.trim()),
    tail: first.slice(close),
  };
}

function signatureTooltip(state: EditorState): Tooltip | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const pos = sel.head;
  const text = state.doc.sliceString(Math.max(0, pos - 3000), pos);
  const offset = Math.max(0, pos - 3000);
  const call = findCallContext(text, pos - offset);
  if (!call) return null;
  const doc = DOC_BY_NAME.get(call.name);
  if (!doc) return null;
  const sp = splitSigParams(doc.sig);
  return {
    pos,
    above: true,
    strictSide: false,
    arrow: false,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-stack-sighelp";
      if (sp) {
        dom.appendChild(document.createTextNode(sp.head));
        sp.params.forEach((p, i) => {
          if (i) dom.appendChild(document.createTextNode(", "));
          const span = document.createElement("span");
          span.textContent = p;
          if (i === Math.min(call.argIndex, sp.params.length - 1)) span.className = "cm-stack-sighelp-active";
          dom.appendChild(span);
        });
        dom.appendChild(document.createTextNode(sp.tail));
      } else {
        dom.textContent = doc.sig;
      }
      const ret = document.createElement("span");
      ret.className = "cm-stack-sighelp-ret";
      ret.textContent = `  → ${doc.returns}`;
      dom.appendChild(ret);
      return { dom };
    },
  };
}

export const signatureHelp = StateField.define<Tooltip | null>({
  create: (state) => signatureTooltip(state),
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;
    return signatureTooltip(tr.state);
  },
  provide: (f) => showTooltip.from(f),
});

// ---- Linting ------------------------------------------------------------------------------------------------

export interface ExternalDiagnostic {
  from: number;
  to: number;
  message: string;
  severity: "error" | "warning" | "info";
}

export function maximaLinter(mode: "block" | "expr", getExternal?: () => ExternalDiagnostic[]): Extension {
  return linter((view) => {
    const src = view.state.doc.toString();
    const len = src.length;
    const out: Diagnostic[] = [];
    const clamp = (n: number) => Math.max(0, Math.min(len, n));
    if (mode === "block") {
      for (const e of parseStatements(src).errors) {
        out.push({ from: clamp(e.from), to: clamp(Math.max(e.to, e.from)), message: e.message, severity: e.severity });
      }
    } else if (src.trim()) {
      try {
        parseExpression(src);
      } catch (e) {
        if (e instanceof MaximaSyntaxError) out.push({ from: clamp(e.from), to: clamp(Math.max(e.to, e.from + 1)), message: e.message, severity: "error" });
      }
    }
    const parseErrorAt = new Set(out.filter((d) => d.severity === "error").map((d) => d.from));
    for (const e of getExternal?.() ?? []) {
      if (parseErrorAt.has(e.from)) continue;
      // Auswertungsfehler: nur die erste Zeile der Anweisung markieren
      const from = clamp(e.from);
      const lineEnd = view.state.doc.lineAt(from).to;
      out.push({ from, to: clamp(Math.min(Math.max(e.to, from + 1), lineEnd)), message: e.message, severity: e.severity });
    }
    return out;
  }, { delay: 300 });
}

// ---- Fokusverfolgung ---------------------------------------------------------------------------------------------

export const trackFocus = EditorView.domEventHandlers({
  focus: (_e, view) => {
    editorContext.lastFocused = view;
    return false;
  },
});

export function maximaExtensions(opts: { mode: "block" | "expr"; getExternal?: () => ExternalDiagnostic[] }): Extension[] {
  return [
    maximaLanguage,
    autocompletion({ override: [maximaCompletionSource], icons: true, activateOnTyping: true }),
    maximaHover,
    signatureHelp,
    maximaLinter(opts.mode, opts.getExternal),
    trackFocus,
  ];
}
