import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Formula,
  FORMULA_PATTERN,
  PROTECTED_PATTERNS,
  casToMathJax,
  casToMathLive,
  decodeEntities,
  formulaSource,
  mathLiveToCas,
  parseFormula,
  resolveApply,
  splitFormulas,
} from "../lib/editor/formula.ts";

const R = String.raw;
const sources = (parts: (string | Formula)[]) => parts.filter((p): p is Formula => typeof p !== "string").map((p) => p.source);
const join = (parts: (string | Formula)[]) => parts.map((p) => (typeof p === "string" ? p : p.source)).join("");

// ---- Erkennen und Zerlegen -------------------------------------------------------------

test("splitFormulas: Inline-Formel", () => {
  assert.deepEqual(splitFormulas("a \\(x^2\\) b"), ["a ", { kind: "inline", tex: "x^2", source: "\\(x^2\\)" }, " b"]);
});

test("splitFormulas: abgesetzte Formel", () => {
  const parts = splitFormulas(R`<p>\[ \sum_{i=1}^n i \]</p>`);
  assert.deepEqual(parts, ["<p>", { kind: "display", tex: R`\sum_{i=1}^n i`, source: R`\[ \sum_{i=1}^n i \]` }, "</p>"]);
});

test("splitFormulas: Entities werden in tex dekodiert, source bleibt", () => {
  const parts = splitFormulas(R`\( a &lt; b \)`);
  assert.deepEqual(parts, [{ kind: "inline", tex: "a < b", source: R`\( a &lt; b \)` }]);
});

test("splitFormulas: nicht erkannte Fälle bleiben Text", () => {
  for (const t of [
    R`\( a <br> b \)`,
    R`\( a <br/> b \)`,
    R`<p>\( a</p><p>b \)</p>`,
    R`\( a </div> b \)`,
    R`\( a <P class="x"> b \)`,
    R`\( offen`,
    R`{@ "\(" @}`,
    R`[[comment]]\(x\)[[/comment]]`,
    R`<script>var s = "\(x\)";</script>`,
    R`<style>/* \(x\) */</style>`,
    R`[[jsxgraph]]board("\(x\)");[[/jsxgraph]]`,
    R`\( a \] b \)`,
    R`\[ a \) b \]`,
    R`\( { \)`,
    R`\( } \)`,
    R`\( [[input:ans1]] \)`,
    R`\( {@ x \)`,
    R`\\(x\)`,
  ]) {
    assert.deepEqual(sources(splitFormulas(t)), [], t);
  }
});

test("splitFormulas: Grenzfälle", () => {
  // {@…@} in der Formel ist undurchsichtig, auch mit \) im Ausdruck
  assert.deepEqual(sources(splitFormulas(R`x \( {@ "\)" @} + 1 \) y`)), [R`\( {@ "\)" @} + 1 \)`]);
  // \) innerhalb von Klammern beendet die Formel nicht (wie MathJax)
  assert.deepEqual(sources(splitFormulas(R`\( \text{a \) b} \) c`)), [R`\( \text{a \) b} \)`]);
  // geöffnete, aber nicht passende Begrenzer im Inneren
  assert.deepEqual(sources(splitFormulas(R`\( a \[ b \)`)), [R`\( a \[ b \)`]);
  // \\ vor \( ist ein Escape, drei Backslashes nicht
  assert.deepEqual(sources(splitFormulas(R`\\\(x\)`)), [R`\(x\)`]);
  assert.deepEqual(sources(splitFormulas(R`\( a \\ b \)`)), [R`\( a \\ b \)`]);
  // zwei Formeln direkt hintereinander, leere Formel
  assert.deepEqual(sources(splitFormulas(R`\(x\)\[y\]\(\)`)), [R`\(x\)`, R`\[y\]`, R`\(\)`]);
  // Inline-Tags sind erlaubt
  assert.deepEqual(sources(splitFormulas(R`\( a<span>b</span> \)`)), [R`\( a<span>b</span> \)`]);
  // Maxima-Listen in {@…@} sind keine STACK-Blöcke
  assert.deepEqual(sources(splitFormulas(R`\( {@[[1,2],[3,4]]@} \)`)), [R`\( {@[[1,2],[3,4]]@} \)`]);
  // nach einem geschützten Block geht die Erkennung weiter
  assert.deepEqual(sources(splitFormulas(R`[[jsxgraph]]x[[/jsxgraph]] \(y\)`)), [R`\(y\)`]);
  // Formel nach einer offenen Formel
  assert.deepEqual(sources(splitFormulas(R`\( offen <br> \(z\)`)), [R`\(z\)`]);
});

test("splitFormulas: tex ohne Begrenzer, getrimmt, aber \\  am Ende bleibt", () => {
  assert.equal((splitFormulas(R`\(  x\  \)`)[0] as Formula).tex, R`x\ `);
  assert.equal((splitFormulas(R`\(&nbsp;x&nbsp;\)`)[0] as Formula).tex, "x");
  assert.equal((splitFormulas(R`\( x\\ \)`)[0] as Formula).tex, R`x\\`);
});

const SAMPLES = [
  "",
  "nur Text",
  "a \\(x^2\\) b",
  R`<p>Berechne \(\int_{@a@}^{@b@} \sqrt{x^2+1}\,dx\) und \[ \sum_{i=1}^n i \]</p>`,
  R`<p>\( a &lt; b &amp;&amp; c \)<br>\( d \)</p>`,
  R`<p>\( a</p><p>b \)</p>`,
  R`{@ "\(" @} \(x\) {#y#} [[input:ans1]] [[validation:ans1]]`,
  R`[[comment]]\(x\)[[/comment]]\(y\)`,
  R`<script>var s = "\(x\)";</script>\(z\)`,
  R`[[jsxgraph width="1"]]board("\(x\)");[[/jsxgraph]] \(w\) [[escape]]\(e\)[[/escape]]`,
  R`\( a \[ b \) \[ c \] \( offen`,
  R`x \( {@ "\)" @} + 1 \) y <br> \( {@ x \)`,
  R`\\(a\) \\\(b\) \( \text{a \) b} \)`,
  R`\( { \) \(}\) \( a \] b \) \[ a \) b \]`,
  R`<div>\(\begin{pmatrix} 1 &amp; 2 \\ 3 &amp; 4 \end{pmatrix}\)</div>`,
  R`\(f''(x)\) und \(\{x\}\) und \(\left\{ x \right\}\)`,
  R`<p>\(x<br />y\)</p><p>\[\frac{1}{@n@}\]</p>`,
];

test("splitFormulas: Roundtrip ist byte-gleich", () => {
  for (const t of SAMPLES) assert.equal(join(splitFormulas(t)), t, t);
});

test("splitFormulas: keine leeren oder benachbarten Strings", () => {
  for (const t of SAMPLES) {
    const parts = splitFormulas(t);
    parts.forEach((p, i) => {
      if (typeof p === "string") {
        assert.notEqual(p, "", t);
        assert.notEqual(typeof parts[i + 1], "string", t);
      }
    });
  }
});

test("FORMULA_PATTERN findet im PROTECT_RE dieselben Formeln wie splitFormulas", () => {
  // So wie Task 2 PROTECT_RE baut: Formel-Alternative zuerst, dann die bisherigen Alternativen aus VisualEditor.tsx
  const visualEditorAlternatives = [
    String.raw`<script[\s\S]*?<\/script>`,
    String.raw`<style[\s\S]*?<\/style>`,
    String.raw`\[\[\s*(jsxgraph|comment|escape|geogebra|parsons|textdownload|javascript)\b[^\]]*\]\][\s\S]*?\[\[\s*\/\1\s*\]\]`,
    String.raw`\[\[[^\]]*\]\]`,
    String.raw`\{@[\s\S]*?@\}`,
    String.raw`\{#[\s\S]*?#\}`,
  ];
  assert.deepEqual([...PROTECTED_PATTERNS], visualEditorAlternatives);
  const protectRe = new RegExp([FORMULA_PATTERN, ...visualEditorAlternatives].join("|"), "gi");
  for (const t of SAMPLES) {
    const all = [...t.matchAll(protectRe)].map((m) => m[0]);
    const formulas = all.filter((s) => s.startsWith("\\"));
    assert.deepEqual(formulas, sources(splitFormulas(t)), t);
  }
  // Die Rückreferenz \1 der jsxgraph-Alternative zeigt weiterhin auf den Blocknamen
  const t = R`[[jsxgraph]]a[[/comment]]\(x\)[[/jsxgraph]] \(y\)`;
  assert.deepEqual([...t.matchAll(protectRe)].map((m) => m[0]), [R`[[jsxgraph]]a[[/comment]]\(x\)[[/jsxgraph]]`, R`\(y\)`]);
  assert.equal(new RegExp(`${FORMULA_PATTERN}|(x)`).exec("x")?.length, 2, "keine Capture-Gruppen");
});

test("parseFormula", () => {
  assert.deepEqual(parseFormula(R`\[ x \]`), { kind: "display", tex: "x", source: R`\[ x \]` });
  assert.equal(parseFormula(R`\(a\)b\)`), null);
  assert.equal(parseFormula(R`x\(a\)`), null);
  assert.equal(parseFormula(R`\( a <br> \)`), null);
  assert.equal(parseFormula("x"), null);
});

// ---- Entities und Quelltext ------------------------------------------------------------

test("decodeEntities", () => {
  assert.equal(decodeEntities("&lt;&gt;&amp;&quot;&nbsp;&#39;&#x41;&apos;"), `<>&" 'A'`);
  assert.equal(decodeEntities("&amp;lt;"), "&lt;");
  assert.equal(decodeEntities("&#160;&#xA0;"), "  ");
  assert.equal(decodeEntities("a & b &foo; &#x110000;"), "a & b &foo; &#x110000;");
});

test("formulaSource", () => {
  assert.equal(formulaSource("inline", "a<b & c"), "\\(a&lt;b &amp; c\\)");
  assert.equal(formulaSource("display", "a>b"), R`\[a&gt;b\]`);
});

// ---- MathLive: Hin- und Rückweg --------------------------------------------------------

test("casToMathLive: Kästchen-Konstrukt nach Spike", () => {
  assert.equal(casToMathLive(R`{@x^2 "s"@}`), R`{\bbox[#e2e6e4]{\texttt{x\unicode{"5E}2\unicode{"20}\unicode{"22}s\unicode{"22}}}}`);
  assert.equal(casToMathLive(R`{#k#}`), R`{\bbox[#e6e2e4]{\texttt{k}}}`);
  assert.equal(casToMathLive(R`{@€@}`), R`{\bbox[#e2e6e4]{\texttt{\unicode{"20AC}}}}`);
  assert.equal(casToMathLive("{@\u{1D400}@}"), R`{\bbox[#e2e6e4]{\texttt{\unicode{"01D400}}}}`);
  assert.equal(casToMathLive(R`{@@}`), R`{\bbox[#e2e6e4]{\texttt{}}}`);
  assert.equal(casToMathLive(R`\frac{1}{@n@}`), R`\frac{1}{\bbox[#e2e6e4]{\texttt{n}}}`);
  assert.equal(casToMathLive(R`x^2+\sqrt{y}`), R`x^2+\sqrt{y}`);
});

test("casToMathLive: Kollisionsschutz und Text-Argumente → null", () => {
  assert.equal(casToMathLive(R`\texttt{a}+{@b@}`), null);
  assert.equal(casToMathLive(R`\texttt{a}`), null);
  assert.equal(casToMathLive(R`\bbox[#e2e6e4]{x}`), null);
  assert.equal(casToMathLive(R`\bbox[#E6E2E4]{x}`), null);
  assert.equal(casToMathLive(R`\text{Wert: {@a@}}`), null);
  assert.equal(casToMathLive(R`\text{@a@}`), null);
  assert.equal(casToMathLive(R`\mbox{ {@a@} }`), null);
  assert.equal(casToMathLive(R`\textbf {x {@a@}}`), null);
  assert.equal(casToMathLive(R`\{@a@}`), null);
  // \texttt innerhalb eines Kästchens ist Maxima-Text, kein Konflikt
  assert.equal(casToMathLive(R`{@"\texttt"@}`), R`{\bbox[#e2e6e4]{\texttt{\unicode{"22}\unicode{"5C}texttt\unicode{"22}}}}`);
  // nach dem Text-Argument ist wieder Mathematik
  assert.equal(casToMathLive(R`\text{a}{@b@}`), R`\text{a}{\bbox[#e2e6e4]{\texttt{b}}}`);
  assert.equal(casToMathLive(R`\textcolor{red}{{@b@}}`), R`\textcolor{red}{{\bbox[#e2e6e4]{\texttt{b}}}}`);
});

test("{@…@}-Roundtrip über MathLive-Darstellung", () => {
  for (const expr of ["a", "x^2+1", "f(x)", R`"\("`, "sqrt(2)/2", "a_1", "%pi", "{1,2}"]) {
    const t = R`\int_{@a@}^{@b@} {@` + expr + R`@}\,dx`;
    const ml = casToMathLive(t);
    assert.ok(ml !== null);
    assert.equal(mathLiveToCas(ml), t, t);
  }
  for (const t of [
    R`{@x^2_a@}`, R`{@a\b@}`, R`{@"{"@}`, R`{@"}"@}`, R`{@ a  b @}`, R`{@'diff(y,x)@}`, R`{@''x@}`, R`{@"\\"@}`, R`{#k#}`,
    R`\frac{1}{@n@}+\frac{{@n@}}{2}+x_{@i@}+{@ä€ß~$&#!*[]` + "`" + R`|<>@}`,
    R`{@@}`, R`f''(x)+{@a@}`, R`\{x\}+{@a@}`, R`{@a@@}`,
  ]) {
    assert.equal(mathLiveToCas(casToMathLive(t)!), t, t);
  }
});

test("mathLiveToCas: MathLive-Ausgaben nach Bearbeitung", () => {
  const box = (s: string, c = "#e2e6e4") => R`\bbox[${c}]{` + s + "}";
  // neu getippte Zeichen: \unicode"HH mit genau einem Leerzeichen
  assert.equal(mathLiveToCas(`{${box(R`\texttt{a\unicode"22 b\unicode"22  c}`)}}`), R`{@a"b" c@}`);
  assert.equal(mathLiveToCas(`{${box(R`\texttt{\unicode"5C}`)}}`), R`{@\@}`);
  // mehrere \texttt-Gruppen
  assert.equal(mathLiveToCas(`{${box(R`\texttt{a}\texttt{\unicode{"22}}`)}}`), R`{@a"@}`);
  // äußere Klammern
  assert.equal(mathLiveToCas(R`\int_{` + box(R`\texttt{a}`) + "}"), R`\int_{@a@}`);
  assert.equal(mathLiveToCas(R`\frac{{` + box(R`\texttt{a}`) + "}}{2}"), R`\frac{{@a@}}{2}`);
  assert.equal(mathLiveToCas("{Z" + box(R`\texttt{a}`) + "}"), "{Z{@a@}}");
  assert.equal(mathLiveToCas("{" + box(R`\texttt{a}`) + "Z}"), "{{@a@}Z}");
  assert.equal(mathLiveToCas("x+" + box(R`\texttt{k}`, "#e6e2e4") + "+1"), "x+{#k#}+1");
  // Leerraum außerhalb: MathLives Ausgabe wird übernommen
  assert.equal(mathLiveToCas(R`\{x\}+` + box(R`\texttt{a}`)), R`\{x\}+{@a@}`);
});

test("mathLiveToCas: strenger Decoder → null", () => {
  const box = (s: string) => R`{\bbox[#e2e6e4]{` + s + "}}";
  for (const inner of [
    R`\texttt{a''b}`,
    R`\texttt{a\textbackslash b}`,
    R`\texttt{a\{b}`,
    R`Q\texttt{ab}`,
    R`\texttt{ab}Q`,
    R`\texttt{"}`,
    R`\texttt{ä}`,
    R`\texttt{\unicode{"zz}}`,
    R`\texttt{\unicode{"110000}}`,
    R`\texttt{\unicode"}`,
    R`\texttt{a@\unicode{"7D}}`,
  ]) {
    assert.equal(mathLiveToCas(box(inner)), null, inner);
  }
  assert.equal(mathLiveToCas(R`\bbox[#e2e6e4]{\texttt{a}`), null);
  assert.equal(mathLiveToCas(R`\bbox[#e6e2e4]{\texttt{a\unicode{"23}\unicode{"7D}}}`), null);
  // "@}" ist nur im @-Kästchen verboten
  assert.equal(mathLiveToCas(R`\bbox[#e6e2e4]{\texttt{a\unicode{"40}\unicode{"7D}}}`), "{#a@}#}");
});

test("mathLiveToCas: MathLive-eigene Makros außerhalb der Kästchen", () => {
  assert.equal(mathLiveToCas(R`f^{\prime}(x)`), "f'(x)");
  assert.equal(mathLiveToCas(R`f^{\doubleprime}(x)`), "f''(x)");
  assert.equal(mathLiveToCas(R`f^{\tripleprime}(x)`), "f'''(x)");
  assert.equal(mathLiveToCas(R`f^\prime (x)`), "f'(x)");
  assert.equal(mathLiveToCas(R`f^\doubleprime (x)`), "f''(x)");
  assert.equal(mathLiveToCas(R`f^\tripleprime x`), "f'''x");
  assert.equal(mathLiveToCas(R`f^{\prime\prime\prime}+g^{ \prime \doubleprime }`), "f'''+g'''");
  assert.equal(mathLiveToCas(R`x^{\prime2}`), R`x^{\prime2}`);
  assert.equal(mathLiveToCas(R`\doubleprime`), R`\prime\prime`);
  assert.equal(mathLiveToCas(R`\int f\differentialD x`), R`\int f\mathrm{d}x`);
  assert.equal(mathLiveToCas(R`\exponentialE^{x}`), R`\mathrm{e}^{x}`);
  assert.equal(mathLiveToCas(R`2\imaginaryI`), R`2\mathrm{i}`);
  assert.equal(mathLiveToCas(R`\imaginaryJ+\capitalDifferentialD`), R`\mathrm{j}+\mathrm{D}`);
  assert.equal(mathLiveToCas(R`30\degree+\euro+\pounds`), "30°+€+£");
  assert.equal(mathLiveToCas(R`\left\lparen x\right\rparen`), R`\left(x\right)`);
  assert.equal(mathLiveToCas(R`a\questeq b`), R`a\stackrel{?}{=}b`);
  assert.equal(mathLiveToCas(R`a\coloneq b\Colon c\slash d`), "a:=b::c/d");
  assert.equal(mathLiveToCas(R`\llbracket a\rrbracket \nsubset B`), "⟦a⟧⊄B");
  assert.equal(mathLiveToCas(R`\frac{\placeholder{}}{2}+\sqrt{\placeholder[id]{x}}`), R`\frac{{}}{2}+\sqrt{{x}}`);
  // \^ ist ein Akzent, kein Exponent; \\ ist kein Steuerwort
  assert.equal(mathLiveToCas(R`\^{\prime}`), R`\^{\prime}`);
  assert.equal(mathLiveToCas(R`a\\\differentialD`), R`a\\\mathrm{d}`);
  // Ersetzung, die mit einem Steuerwort endet, braucht vor Buchstaben ein Leerzeichen
  assert.equal(mathLiveToCas(R`\doubleprime x`), R`\prime\prime x`);
});

test("mathLiveToCas: f''(x)+{@a@} übersteht MathLive", () => {
  const t = "f''(x)+{@a@}";
  assert.equal(mathLiveToCas(casToMathLive(t)!), t);
  assert.equal(mathLiveToCas(R`f^{\doubleprime}(x)+{\bbox[#e2e6e4]{\texttt{a}}}`), t);
  assert.equal(mathLiveToCas(R`f^\doubleprime (x)+{\bbox[#e2e6e4]{\texttt{a}}}`), t);
});

test("mathLiveToCas: Makros im Kästchen werden nicht angefasst", () => {
  assert.equal(
    mathLiveToCas(R`{\bbox[#e2e6e4]{\texttt{\unicode{"5C}differentialD\unicode{"5E}\unicode{"7B}\unicode{"5C}prime\unicode{"7D}}}}`),
    R`{@\differentialD^{\prime}@}`,
  );
});

test("mathLiveToCas: Text-Modus-Makros in \\text{…}", () => {
  assert.equal(mathLiveToCas(R`\text{gro\ss e Stra\ss e}`), R`\text{große Straße}`);
  assert.equal(mathLiveToCas(R`\text{50\% a\&b \#1 x\_y wow\!}`), R`\text{50% a&b #1 x_y wow!}`);
  assert.equal(mathLiveToCas(R`\text{\textbackslash\textasciicircum\textasciitilde\textasteriskcentered}`), R`\text{\\^~*}`);
  assert.equal(mathLiveToCas(R`\text{\lbrack a\rbrack \lbrace\textbraceright\euro\degree\textdollar}`), R`\text{[a]\{\}€°\$}`);
  assert.equal(mathLiveToCas(R`\text{\{ \} \$ \\}`), R`\text{\{ \} \$ \\}`);
  // Mathematik in Text bleibt Mathematik, nach dem Text-Argument ebenso
  assert.equal(mathLiveToCas(R`\text{a $\exponentialE\%$ b}\%\ss`), R`\text{a $\mathrm{e}\%$ b}\%\ss`);
  assert.equal(mathLiveToCas(R`\textbf{\ss}+\mbox{\ss}`), R`\textbf{ß}+\mbox{ß}`);
});

// ---- MathJax ---------------------------------------------------------------------------

test("casToMathJax", () => {
  assert.equal(casToMathJax(R`\int_{@a@}^{@b@} x`), R`\int_{\bbox[#e2e6e4]{\texttt{a}}}^{\bbox[#e2e6e4]{\texttt{b}}} x`);
  assert.equal(casToMathJax(R`{@x^2 "s{"@}+{#k$\}#}`), R`{\bbox[#e2e6e4]{\texttt{x^2 "s\{"}}}+{\bbox[#e2e6e4]{\texttt{k\$\\\}}}}`);
  assert.equal(casToMathJax(R`\frac{a}{b}`), R`\frac{a}{b}`);
});

// ---- Übernahme-Regel -------------------------------------------------------------------

test("resolveApply", () => {
  const original = parseFormula(R`\( a &lt; b \)`)!;
  const base = { original, kind: "inline" as const, code: "a < b", fieldLatex: "a<b" };
  assert.deepEqual(resolveApply({ ...base, lastEdited: "none" }), { kind: "source", source: R`\( a &lt; b \)` });
  assert.deepEqual(resolveApply({ ...base, lastEdited: "code", code: "a > b" }), { kind: "source", source: formulaSource("inline", "a > b") });
  assert.deepEqual(
    resolveApply({ ...base, lastEdited: "field", fieldLatex: R`a>{\bbox[#e2e6e4]{\texttt{b}}}` }),
    { kind: "source", source: formulaSource("inline", mathLiveToCas(R`a>{\bbox[#e2e6e4]{\texttt{b}}}`)!) },
  );
  // leerer Inhalt
  assert.deepEqual(resolveApply({ ...base, lastEdited: "code", code: "  " }), { kind: "empty" });
  assert.deepEqual(resolveApply({ ...base, lastEdited: "field", fieldLatex: "" }), { kind: "empty" });
  assert.deepEqual(resolveApply({ original: null, kind: "inline", lastEdited: "none", code: "", fieldLatex: "" }), { kind: "empty" });
  // nur die Art umgeschaltet
  assert.deepEqual(resolveApply({ ...base, lastEdited: "none", kind: "display" }), { kind: "source", source: R`\[a &lt; b\]` });
  // Code wieder auf den Ausgangsstand gebracht → Original
  assert.deepEqual(resolveApply({ ...base, lastEdited: "code", code: "a < b" }), { kind: "source", source: R`\( a &lt; b \)` });
  assert.deepEqual(resolveApply({ ...base, lastEdited: "field", fieldLatex: "a < b" }), { kind: "source", source: R`\( a &lt; b \)` });
  // Rückweg nicht sicher → eigenes Ergebnis
  assert.deepEqual(resolveApply({ ...base, lastEdited: "field", fieldLatex: R`{\bbox[#e2e6e4]{\texttt{a''}}}` }), { kind: "undecodable" });
  // neue Formel
  assert.deepEqual(resolveApply({ original: null, kind: "display", lastEdited: "field", code: "", fieldLatex: R`f^{\prime}` }), { kind: "source", source: R`\[f'\]` });
});
