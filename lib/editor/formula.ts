// LaTeX-Formeln \( … \) und \[ … \] im CASText: Erkennen, Zerlegen und Übersetzen für MathLive und MathJax.
// Reine Funktionen ohne DOM. Die Darstellung von {@…@}/{#…#} ist im Spike festgelegt:
// docs/superpowers/notes/2026-10-20-mathlive-spike.md

export type FormulaKind = "inline" | "display";

export interface Formula {
  kind: FormulaKind;
  /** LaTeX ohne Begrenzer, Entities dekodiert, außen ohne Leerraum */
  tex: string;
  /** Originaltext inkl. Begrenzer, wie im HTML */
  source: string;
}

// ---- Erkennen ----------------------------------------------------------------------------

/** Die übrigen geschützten Konstrukte des Texteditors (gleiche Liste wie PROTECT_RE in VisualEditor.tsx). */
export const PROTECTED_PATTERNS: readonly string[] = [
  String.raw`<script[\s\S]*?<\/script>`,
  String.raw`<style[\s\S]*?<\/style>`,
  String.raw`\[\[\s*(jsxgraph|comment|escape|geogebra|parsons|textdownload|javascript)\b[^\]]*\]\][\s\S]*?\[\[\s*\/\1\s*\]\]`,
  String.raw`\[\[[^\]]*\]\]`,
  String.raw`\{@[\s\S]*?@\}`,
  String.raw`\{#[\s\S]*?#\}`,
];

// Eine Formel darf kein Tag und keinen Kommentar enthalten (PROTECT_RE arbeitet auf dem rohen HTML; ein Kästchen über
// eine Tag-Grenze hinweg würde das HTML verändern) und keinen STACK-Block überspannen.
const FORBID_HTML = String.raw`<[A-Za-z\/!?]`;
const FORBID_STACK_BLOCK = String.raw`\[\[\s*\/?[a-zA-Z_]`;
// {@…@}/{#…#} sind in der Formel undurchsichtig (STACK ersetzt sie vor MathJax), auch nach einem Backslash.
const CAS_IN_FORMULA = String.raw`\{@(?:(?!@\}|${FORBID_HTML})[\s\S])*@\}|\{#(?:(?!#\}|${FORBID_HTML})[\s\S])*#\}`;
// Backslash + ein Zeichen ist eine Einheit (wie in MathJax), außer vor {@ bzw. {#.
const ESCAPED = String.raw`\\(?=\{[@#])|\\(?!\{[@#])[\s\S]`;
// MathJax beendet eine Formel nur auf Klammerebene 0. Tiefer verschachtelte Formeln bleiben Text.
const MAX_BRACE_DEPTH = 8;

/** Ein Baustein des Formelinhalts; deterministisch, ohne Capture-Gruppen. */
function bodyToken(otherClose: string): string {
  const guard = `(?!${FORBID_HTML}|${FORBID_STACK_BLOCK}|${otherClose})`;
  let token = String.raw`${guard}(?:${CAS_IN_FORMULA}|${ESCAPED}|[^\\{}])`;
  for (let depth = 0; depth < MAX_BRACE_DEPTH; depth++) {
    token = String.raw`${guard}(?:${CAS_IN_FORMULA}|${ESCAPED}|\{(?![@#])(?:${token})*\}|[^\\{}])`;
  }
  return token;
}

/**
 * Regex-Quelle für PROTECT_RE (vor {@…@} einzureihen, Flags "gi"); findet genau die Formeln, die splitFormulas
 * findet. Enthält keine Capture-Gruppen, damit Rückreferenzen späterer Alternativen gültig bleiben.
 */
export const FORMULA_PATTERN: string =
  String.raw`(?=\\[(\[])` +
  // Vor dem Begrenzer eine gerade Anzahl Backslashes: \\( ist in MathJax ein Escape, kein Begrenzer.
  String.raw`(?<=(?:^|[^\\])(?:\\\\)*)` +
  // Nicht innerhalb eines Tags (Attributwert). Kommentare überspringt HTML_COMMENT_PATTERN. Ein > in einem
  // Attributwert in Anführungszeichen beendet ein Element-Tag nicht; der Wert darf an der Stelle noch offen sein.
  // <!…> und <?…> haben keine Attributwerte: Dort endet alles am nächsten >.
  String.raw`(?<!<[A-Za-z\/](?:"[^"]*"|'[^']*'|[^<>"'])*(?:"[^"]*|'[^']*)?|<[!?][^<>]*)` +
  String.raw`(?:\\\((?:${bodyToken(String.raw`\\\]`)})*?\\\)|\\\[(?:${bodyToken(String.raw`\\\)`)})*?\\\])`;

/**
 * HTML-Kommentar (auch ungeschlossen bis zum Ende). Gehört mit in PROTECT_RE, wird dort aber unverändert
 * durchgereicht (kein Kästchen): So wird in Kommentaren weder eine Formel noch {@…@} erkannt.
 */
export const HTML_COMMENT_PATTERN: string = String.raw`<!--[\s\S]*?(?:-->|$)`;

/**
 * Alle geschützten Konstrukte des Texteditors in der Reihenfolge von PROTECT_RE (Flags "gi", ohne "m":
 * HTML_COMMENT_PATTERN braucht $ = Ende der Eingabe): Formeln zuerst, dann Kommentare, dann die übrigen.
 */
export const PROTECT_PATTERN: string = [FORMULA_PATTERN, HTML_COMMENT_PATTERN, ...PROTECTED_PATTERNS].join("|");

const SPLIT_RE = new RegExp(PROTECT_PATTERN, "gi");

/** Zerlegt einen HTML-Abschnitt: Formeln werden zu Formula, alles andere bleibt string. Konkatenation der source/strings = Eingabe. */
export function splitFormulas(html: string): (string | Formula)[] {
  const parts: (string | Formula)[] = [];
  let pos = 0;
  for (const m of html.matchAll(SPLIT_RE)) {
    const source = m[0];
    if (!source.startsWith("\\")) continue; // anderes geschütztes Konstrukt: bleibt Text
    if (m.index > pos) parts.push(html.slice(pos, m.index));
    parts.push(toFormula(source));
    pos = m.index + source.length;
  }
  if (pos < html.length) parts.push(html.slice(pos));
  return parts;
}

export function parseFormula(source: string): Formula | null {
  const parts = splitFormulas(source);
  return parts.length === 1 && typeof parts[0] !== "string" ? parts[0] : null;
}

function toFormula(source: string): Formula {
  return { kind: source[1] === "(" ? "inline" : "display", tex: trimTex(decodeEntities(source.slice(2, -2))), source };
}

/** Wie trim(), lässt aber ein Leerzeichen nach einem Backslash am Ende stehen (\  ist ein Befehl). */
function trimTex(s: string): string {
  const t = s.trimStart();
  let end = t.length;
  while (end > 0 && /\s/.test(t[end - 1])) end--;
  if (end === t.length) return t;
  let backslashes = 0;
  while (end - backslashes > 0 && t[end - backslashes - 1] === "\\") backslashes++;
  return t.slice(0, backslashes % 2 === 1 ? end + 1 : end);
}

// ---- Entities und Quelltext --------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(?:(lt|gt|amp|quot|apos|nbsp)|#(\d+)|#[xX]([0-9a-fA-F]+));/g, (m, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (name) return NAMED_ENTITIES[name];
    const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex!, 16);
    if (!isScalarValue(cp)) return m;
    return cp === 0xa0 ? " " : String.fromCodePoint(cp);
  });
}

/** Ein gültiges, darstellbares Unicode-Zeichen: nicht NUL, kein einzelnes Surrogat, höchstens U+10FFFF. */
function isScalarValue(cp: number): boolean {
  return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

/** \( … \) bzw. \[ … \], <>& als Entities. */
export function formulaSource(kind: FormulaKind, tex: string): string {
  const body = tex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return kind === "inline" ? `\\(${body}\\)` : `\\[${body}\\]`;
}

// ---- {@…@}/{#…#} und Text-Argumente ------------------------------------------------------

const CAS_STICKY = /\{@([\s\S]*?)@\}|\{#([\s\S]*?)#\}/y;
const BOX_COLOR = { "@": "#e2e6e4", "#": "#e6e2e4" } as const;
/** Befehle, deren Argument Text ist (Text-Modus in MathLive). */
const TEXT_ARG_COMMANDS = new Set(["text", "textrm", "textsf", "texttt", "textit", "textbf", "textup", "textmd", "textsl", "textsc", "textnormal", "mbox", "hbox", "emph"]);
/**
 * Anzahl der ersten Argumente, die keine Mathematik sind (Text, URL, Farbe, Klasse …). Ein Kästchen darin lässt sich
 * nicht darstellen.
 */
const NON_MATH_ARGS = new Map<string, number>([
  ...[...TEXT_ARG_COMMANDS].map((c): [string, number] => [c, 1]),
  ["href", 1], ["url", 1], ["textcolor", 1], ["color", 1], ["colorbox", 2], ["fcolorbox", 3],
  ["class", 1], ["cssId", 1], ["style", 1], ["unicode", 1],
]);
const CONTROL_SEQ = /\\(?:([a-zA-Z]+)|([\s\S])?)/y;
/** Kollisionsschutz: Diese Stellen würden auf dem Rückweg als Kästchen gelesen. */
const COLLISION_RE = /\\texttt|\\bbox\s*\[\s*#e(?:2e6e4|6e2e4)/i;

function casAt(tex: string, i: number): { kind: "@" | "#"; expr: string; end: number } | null {
  CAS_STICKY.lastIndex = i;
  const m = CAS_STICKY.exec(tex);
  if (!m) return null;
  return m[1] !== undefined ? { kind: "@", expr: m[1], end: CAS_STICKY.lastIndex } : { kind: "#", expr: m[2], end: CAS_STICKY.lastIndex };
}

/** ENC aus dem Spike: [A-Za-z0-9] bleibt, alles andere wird \unicode{"HH} (Großbuchstaben, 2/4/6/8 Stellen). */
export function encodeExpr(expr: string): string {
  let out = "";
  for (const ch of expr) {
    if (/^[A-Za-z0-9]$/.test(ch)) { out += ch; continue; }
    const cp = ch.codePointAt(0)!;
    const width = cp <= 0xff ? 2 : cp <= 0xffff ? 4 : cp <= 0xffffff ? 6 : 8;
    out += `\\unicode{"${cp.toString(16).toUpperCase().padStart(width, "0")}}`;
  }
  return out;
}

/**
 * {@x@}/{#x#} → MathLive-Kästchen. null: Die Formel enthält außerhalb der Kästchen \texttt oder \bbox in einer
 * Kästchenfarbe (Kollisionsschutz), oder ein Kästchen steht in einem Argument ohne Mathematik (\text, \href, \url,
 * Farbe …) bzw. in \verb. Dann nur im Codefeld bearbeiten.
 */
export function casToMathLive(tex: string): string | null {
  let out = "";
  let outside = "";
  // Je offener Gruppe: Argument ohne Mathematik? Und wie viele solche Argumente folgen danach noch?
  const groups: { nonMath: boolean; rest: number }[] = [];
  let pendingArgs = 0;
  let i = 0;
  while (i < tex.length) {
    const box = casAt(tex, i);
    if (box) {
      if (pendingArgs > 0 || groups.some((g) => g.nonMath)) return null;
      out += `{\\bbox[${BOX_COLOR[box.kind]}]{\\texttt{${encodeExpr(box.expr)}}}}`;
      outside += "\0";
      i = box.end;
      continue;
    }
    let token = tex[i];
    if (token === "\\") {
      if (casAt(tex, i + 1)) return null; // \{@…@}: STACK sieht den Ausdruck, TeX aber \{
      CONTROL_SEQ.lastIndex = i;
      const m = CONTROL_SEQ.exec(tex)!;
      token = m[0];
      if (m[1] === "verb") {
        // \verb|…| bzw. \verb*|…|: Inhalt bis zum nächsten Begrenzer wörtlich
        let j = i + token.length;
        if (tex[j] === "*") j++;
        const close = j < tex.length ? tex.indexOf(tex[j], j + 1) : -1;
        token = tex.slice(i, close < 0 ? tex.length : close + 1);
        if (/\{[@#]/.test(token)) return null;
        pendingArgs = 0;
      } else {
        pendingArgs = (m[1] !== undefined && NON_MATH_ARGS.get(m[1])) || 0;
      }
    } else if (token === "{") {
      groups.push({ nonMath: pendingArgs > 0, rest: Math.max(pendingArgs - 1, 0) });
      pendingArgs = 0;
    } else if (token === "}") {
      pendingArgs = groups.pop()?.rest ?? 0;
    } else if (!/\s/.test(token)) {
      pendingArgs = 0;
    }
    out += token;
    outside += token;
    i += token.length;
  }
  if (COLLISION_RE.test(outside)) return null;
  return out;
}

/** {@x@}/{#x#} → graues Kästchen für MathJax (beide in derselben Farbe). */
export function casToMathJax(tex: string): string {
  return tex.replace(/\{@([\s\S]*?)@\}|\{#([\s\S]*?)#\}/g, (_m, at: string | undefined, hash: string | undefined) =>
    `{\\bbox[#e2e6e4]{\\texttt{${(at ?? hash!).replace(/[\\{}$]/g, "\\$&")}}}}`);
}

// ---- Rückweg -----------------------------------------------------------------------------

const BOX_START = /\{?\\bbox\[(#e2e6e4|#e6e2e4)\]\{/y;
const BOX_TEXT_TOKEN = /([A-Za-z0-9 ]+)|\\unicode\{"([0-9A-F]+)\}|\\unicode"([0-9A-F]+) ?/y;
const FAIL = Symbol("fail");

/** Index der schließenden Klammer zur Klammer an `open`; nach \ wird genau ein Zeichen übersprungen. -1: fehlt. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return j;
  }
  return -1;
}

/** Strenger Decoder für den Text eines \texttt im Kästchen. */
function decodeBoxText(s: string): string | null {
  let out = "";
  let pos = 0;
  while (pos < s.length) {
    BOX_TEXT_TOKEN.lastIndex = pos;
    const m = BOX_TEXT_TOKEN.exec(s);
    if (!m) return null;
    if (m[1] !== undefined) out += m[1];
    else {
      const cp = parseInt(m[2] ?? m[3], 16);
      if (!isScalarValue(cp)) return null;
      out += String.fromCodePoint(cp);
    }
    pos = BOX_TEXT_TOKEN.lastIndex;
  }
  return out;
}

/** Inhalt eines Kästchens: nur eine Folge von \texttt{…}-Gruppen. */
function decodeBoxContent(content: string): string | null {
  let out = "";
  let pos = 0;
  while (pos < content.length) {
    if (!content.startsWith("\\texttt{", pos)) return null;
    const close = matchBrace(content, pos + 7);
    if (close < 0) return null;
    const text = decodeBoxText(content.slice(pos + 8, close));
    if (text === null) return null;
    out += text;
    pos = close + 1;
  }
  return out;
}

/** Kästchen an Position i: undefined = keins, FAIL = nicht sicher dekodierbar. */
function readBox(latex: string, i: number): { cas: string; end: number } | typeof FAIL | undefined {
  BOX_START.lastIndex = i;
  const m = BOX_START.exec(latex);
  if (!m) return undefined;
  const braced = m[0].startsWith("{");
  const open = i + m[0].length - 1;
  const close = matchBrace(latex, open);
  if (close < 0) return FAIL;
  // Folgt keine }, gehört das { nicht zum Kästchen (z. B. {Z\bbox…}) und bleibt als normale Gruppe stehen.
  if (braced && latex[close + 1] !== "}") return undefined;
  const expr = decodeBoxContent(latex.slice(open + 1, close));
  const kind = m[1] === BOX_COLOR["@"] ? "@" : "#";
  if (expr === null || expr.includes(`${kind}}`)) return FAIL;
  return { cas: `{${kind}${expr}${kind}}`, end: braced ? close + 2 : close + 1 };
}

// MathLive-eigene Befehle (MathJax 3 kennt sie nicht) → Gleichwertiges, das MathJax kennt. Nur außerhalb der Kästchen.
// Ermittelt aus mathlive@0.111.1: Zeichen → Befehl beim Tippen, Inline-Shortcuts und Tastenbelegung.
export const MATH_MACROS: ReadonlyMap<string, string> = new Map(Object.entries({
  doubleprime: String.raw`\prime\prime`,
  tripleprime: String.raw`\prime\prime\prime`,
  differentialD: String.raw`\mathrm{d}`,
  capitalDifferentialD: String.raw`\mathrm{D}`,
  exponentialE: String.raw`\mathrm{e}`,
  imaginaryI: String.raw`\mathrm{i}`,
  imaginaryJ: String.raw`\mathrm{j}`,
  questeq: String.raw`\stackrel{?}{=}`,
  coloneq: ":=",
  Colon: "::",
  slash: "/",
  lparen: "(",
  rparen: ")",
  degree: "°",
  euro: "€",
  pounds: "£",
  textbullet: "•",
  backdoubleprime: "‶",
  Coppa: "Ϙ", coppa: "ϙ", Sampi: "Ϡ", sampi: "ϡ", Yup: "⅄",
  mapsfrom: "↤", lightning: "↯", nvrightarrow: "⇸", leftarrowtriangle: "⇽", rightarrowtriangle: "⇾",
  leftrightarrowtriangle: "⇿", differencedelta: "∆", measeq: "≝", eqdef: "≞", nsubset: "⊄", nsupset: "⊅",
  originalof: "⊶", imageof: "⊷", parallelogram: "▱", boxbar: "◫", Lbag: "⟅", Rbag: "⟆", llbracket: "⟦",
  rrbracket: "⟧", biconditional: "⟷", longmapsfrom: "⟻", Longmapsfrom: "⟽", Longmapsto: "⟾",
  nvtwoheadrightarrow: "⤀", Mapsfrom: "⤆", MapsTo: "⤇", nvrightarrowtail: "⤔", twoheadrightarrowtail: "⤖",
  nvtwoheadrightarrowtail: "⤗", roundimplies: "⥰", boxslash: "⧄", boxbslash: "⧅", boxast: "⧆", boxcircle: "⧇",
  boxbox: "⧈", fatsemi: "⨟", leftslice: "⪦", rightslice: "⪧", interleave: "⫴", biginterleave: "⫼", sslash: "⫽",
  talloblong: "⫾",
}));

// Buchstaben, die MathLive im Text-Modus als Befehl schreibt (\ss für ß …). MathJax zeigt sie in \text{…} wörtlich
// als „\ss“; der Buchstabe selbst sieht überall gleich aus. Satzzeichen und Symbole (\%, \&, \#, \_, \euro …) bleiben
// stehen: \text{50\%} ist gültiges LaTeX (z. B. mit textmacros) und wird nicht umgeschrieben.
export const TEXT_MACROS: ReadonlyMap<string, string> = new Map(Object.entries({
  ss: "ß", ae: "æ", oe: "œ", AE: "Æ", OE: "Œ", o: "ø", O: "Ø", i: "ı", j: "ȷ", aa: "å", AA: "Å",
}));
const PRIMES = /\^(?:\{\s*((?:\\(?:prime|doubleprime|tripleprime)(?![a-zA-Z])\s*)+)\}|\\(prime|doubleprime|tripleprime)(?![a-zA-Z])\s*)/y;
const PRIME_COUNT: Record<string, number> = { prime: 1, doubleprime: 2, tripleprime: 3 };

type Mode = "math" | "text" | "textmath";

/**
 * Rückweg: MathLive-LaTeX → STACK-LaTeX. Kästchen werden streng dekodiert; null = ein Kästchen ist nicht sicher
 * lesbar (Rückfall auf das Codefeld). Außerhalb der Kästchen werden nur MathLive-eigene Befehle ersetzt.
 */
export function mathLiveToCas(latex: string): string | null {
  let out = "";
  let outside = ""; // Ausgabe ohne Kästchen, für den Kollisionsschutz
  let outsideFrom = 0;
  const groups: Mode[] = [];
  const mode = (): Mode => groups[groups.length - 1] ?? "math";
  let pendingText = false;
  let i = 0;
  const skipSpaces = () => { while (i < latex.length && /\s/.test(latex[i])) i++; };
  while (i < latex.length) {
    const box = readBox(latex, i);
    if (box === FAIL) return null;
    if (box) {
      outside += out.slice(outsideFrom) + "\0";
      out += box.cas;
      outsideFrom = out.length;
      i = box.end;
      pendingText = false;
      continue;
    }
    const c = latex[i];
    const inText = mode() === "text";
    if (c === "\\") {
      CONTROL_SEQ.lastIndex = i;
      const m = CONTROL_SEQ.exec(latex)!;
      i = CONTROL_SEQ.lastIndex;
      const word = m[1];
      if (word === undefined) {
        out += m[0];
      } else if (!inText && word === "placeholder") {
        // \placeholder[…]{x} → {x}
        skipSpaces();
        if (latex[i] === "[") {
          const close = latex.indexOf("]", i);
          if (close >= 0) i = close + 1;
        }
      } else {
        const rep = (inText ? TEXT_MACROS : MATH_MACROS).get(word);
        if (rep === undefined) out += m[0];
        else {
          skipSpaces();
          out += rep;
          if (/\\[a-zA-Z]+$/.test(rep) && /[a-zA-Z]/.test(latex[i] ?? "")) out += " ";
        }
      }
      pendingText = word !== undefined && TEXT_ARG_COMMANDS.has(word);
      continue;
    }
    if (c === "^" && !inText) {
      PRIMES.lastIndex = i;
      const m = PRIMES.exec(latex);
      if (m) {
        const words = m[1] !== undefined ? [...m[1].matchAll(/[a-z]+/g)].map((w) => w[0]) : [m[2]];
        out += "'".repeat(words.reduce((n, w) => n + PRIME_COUNT[w], 0));
        i = PRIMES.lastIndex;
        pendingText = false;
        continue;
      }
    }
    if (c === "{") groups.push(pendingText || inText ? "text" : "math");
    else if (c === "}") groups.pop();
    else if (c === "$" && inText) groups.push("textmath");
    else if (c === "$" && mode() === "textmath") groups.pop();
    if (!/\s/.test(c)) pendingText = false;
    out += c;
    i++;
  }
  // Fail closed: Was außerhalb der Kästchen wie ein Kästchen aussieht, ist nicht sicher lesbar.
  if (COLLISION_RE.test(outside + out.slice(outsideFrom))) return null;
  return out;
}

// ---- Übernehmen --------------------------------------------------------------------------

/**
 * Ergebnis von „Übernehmen“:
 * - source: der neue Formeltext für das HTML
 * - empty: die Formel ist leer (neu: nichts einfügen; vorhanden: nach Rückfrage entfernen)
 * - undecodable: zuletzt in der Formel bearbeitet, aber ein Kästchen ist nicht sicher lesbar. Der Aufrufer meldet das
 *   und wechselt ins Codefeld; nichts wird geschrieben.
 */
export type ApplyResult = { kind: "source"; source: string } | { kind: "empty" } | { kind: "undecodable" };

/** Übernahme-Regel: unverändert → original; Code zuletzt bearbeitet → code; sonst MathLive-Ausgabe rückübersetzt. */
export function resolveApply(o: {
  original: Formula | null;
  kind: FormulaKind;
  lastEdited: "none" | "field" | "code";
  code: string;
  fieldLatex: string;
}): ApplyResult {
  const { original, kind } = o;
  if (o.lastEdited === "none" && original && kind === original.kind) return { kind: "source", source: original.source };
  let tex: string;
  if (o.lastEdited === "field") {
    const cas = mathLiveToCas(o.fieldLatex);
    if (cas === null) return { kind: "undecodable" };
    tex = cas;
  } else if (o.lastEdited === "code" || !original) {
    tex = o.code;
  } else {
    tex = original.tex; // nichts bearbeitet, höchstens die Art umgeschaltet
  }
  if (tex.trim() === "") return { kind: "empty" };
  // Inhalt und Art wie im Original → Originaltext (Byte-Gleichheit)
  if (original && kind === original.kind && tex === original.tex) return { kind: "source", source: original.source };
  return { kind: "source", source: formulaSource(kind, tex) };
}
