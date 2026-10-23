// Werkzeugleiste des Formel-Editors (Entwurf C): Gruppen, deren Tasten als Palette aufklappen.
// `latex` verwendet MathLive-Platzhalter: #0 = Auswahl bzw. erste offene Stelle, #? = weitere offene Stelle.
// Beschriftung und Tooltip: Text (Symbol, LaTeX-Name – nicht übersetzt) oder Msg (wird übersetzt).

import type { MessageKey, Msg } from "../../lib/i18n/index.ts";

export interface PaletteKey {
  label: string | Msg;
  latex: string;
  title: string | Msg;
  /** Statt Einfügen: MathLive-Befehl ausführen (Zeile/Spalte einer Matrix). `latex` bleibt leer. */
  command?: "addRowAfter" | "addRowBefore" | "addColumnAfter" | "addColumnBefore" | "removeRow" | "removeColumn";
  /**
   * Sonderfunktion:
   * - "matrix": Größe über einen Dialog abfragen; `latex` ist die Umgebung (pmatrix, bmatrix, vmatrix).
   * - "cas": neues Maxima-Kästchen; `latex` ist die STACK-Form ({@expr@} bzw. {#expr#}).
   */
  special?: "matrix" | "cas";
}

export interface PaletteGroup {
  id: string;
  label: MessageKey;
  icon: string;
  keys: PaletteKey[];
}

const r = String.raw;
/** Taste mit Symbol und übersetztem Tooltip `formula.keys.<title>`. */
const sym = (label: string | Msg, latex: string, title: KeyTitle): PaletteKey => ({ label, latex, title: { key: `formula.keys.${title}` } });
type KeyTitle = MessageKey extends infer K ? (K extends `formula.keys.${infer T}` ? T : never) : never;
/** Wort-Beschriftung `formula.labels.<name>`. */
type LabelName = MessageKey extends infer K ? (K extends `formula.labels.${infer T}` ? T : never) : never;
const word = (name: LabelName): Msg => ({ key: `formula.labels.${name}` });

/** Matrix mit `rows` × `cols` offenen Stellen (#0 zuerst). */
export function matrixLatex(env: string, rows: number, cols: number): string {
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const cells: string[] = [];
    for (let j = 0; j < cols; j++) cells.push(i === 0 && j === 0 ? "#0" : "#?");
    lines.push(cells.join("&"));
  }
  return r`\begin{${env}}${lines.join(r`\\`)}\end{${env}}`;
}

/** Atome, nach denen getipptes „dx“ & Co. das Differential eines Integranden ist (MathLive-`after`-Kategorien).
 *  Nicht nach Anfang/Operator/Klammer auf/Relation/Leerraum, damit z. B. „dy/dx“ und „\int dx“ unverändert bleiben. */
const DIFFERENTIAL_AFTER = "letter+digit+frac+surd+closefence+array";

/** Inline-Kürzel: „dx“, „dt“ … hinter einem Integranden werden zu `\,\mathrm{d}x` … (halber Abstand, aufrechtes d wie in der Palette). */
export const DIFFERENTIAL_SHORTCUTS: Record<string, { value: string; after: string }> = Object.fromEntries(
  ["x", "y", "z", "t", "u", "v", "r", "s"].map((v) => [`d${v}`, { value: r`\,\mathrm{d}${v}`, after: DIFFERENTIAL_AFTER }]),
);

const GREEK_LOWER: [string, string][] = [
  ["α", "alpha"], ["β", "beta"], ["γ", "gamma"], ["δ", "delta"], ["ε", "varepsilon"], ["ϵ", "epsilon"], ["ζ", "zeta"],
  ["η", "eta"], ["θ", "theta"], ["ϑ", "vartheta"], ["ι", "iota"], ["κ", "kappa"], ["λ", "lambda"], ["μ", "mu"],
  ["ν", "nu"], ["ξ", "xi"], ["π", "pi"], ["ρ", "rho"], ["σ", "sigma"], ["τ", "tau"], ["υ", "upsilon"], ["φ", "varphi"],
  ["ϕ", "phi"], ["χ", "chi"], ["ψ", "psi"], ["ω", "omega"],
];
const GREEK_UPPER: [string, string][] = [
  ["Γ", "Gamma"], ["Δ", "Delta"], ["Θ", "Theta"], ["Λ", "Lambda"], ["Ξ", "Xi"], ["Π", "Pi"], ["Σ", "Sigma"],
  ["Υ", "Upsilon"], ["Φ", "Phi"], ["Ψ", "Psi"], ["Ω", "Omega"],
];

export const PALETTES: PaletteGroup[] = [
  {
    id: "roots", label: "formula.groups.roots", icon: "√x",
    keys: [
      sym("√x", r`\sqrt{#0}`, "sqrt"),
      sym("ⁿ√x", r`\sqrt[#?]{#0}`, "nthRoot"),
      sym("a⁄b", r`\frac{#0}{#?}`, "fraction"),
      sym("xⁿ", r`#0^{#?}`, "power"),
      sym("xₙ", r`#0_{#?}`, "subscript"),
      sym("xₙᵐ", r`#0_{#?}^{#?}`, "subSuperscript"),
      sym("eˣ", r`e^{#0}`, "expPower"),
      sym("( )", r`\left(#0\right)`, "parens"),
      sym("[ ]", r`\left[#0\right]`, "brackets"),
      sym("{ }", r`\left\{#0\right\}`, "braces"),
      sym("|x|", r`\left|#0\right|`, "abs"),
    ],
  },
  {
    id: "analysis", label: "formula.groups.analysis", icon: "∫",
    keys: [
      sym("∫", r`\int #0\,\mathrm{d}x`, "indefiniteIntegral"),
      sym("∫ₐᵇ", r`\int_{#?}^{#?} #0\,\mathrm{d}x`, "definiteIntegral"),
      sym("∬", r`\iint_{#?} #0\,\mathrm{d}A`, "doubleIntegral"),
      sym("∮", r`\oint_{#?} #0\,\mathrm{d}s`, "contourIntegral"),
      sym("∑", r`\sum_{#?}^{#?} #0`, "sum"),
      sym("∏", r`\prod_{#?}^{#?} #0`, "product"),
      sym("lim", r`\lim_{#? \to #?} #0`, "limit"),
      sym("∞", r`\infty`, "infinity"),
      sym("d⁄dx", r`\frac{d}{dx}#0`, "derivative"),
      sym("dy⁄dx", r`\frac{d#0}{d#?}`, "differentialQuotient"),
      sym("∂⁄∂x", r`\frac{\partial #0}{\partial #?}`, "partialDerivative"),
      sym("∂", r`\partial`, "partial"),
      sym("f′", r`^{\prime}`, "prime"),
      sym("∇", r`\nabla`, "nabla"),
    ],
  },
  {
    id: "matrix", label: "formula.groups.matrix", icon: "[ ]",
    keys: [
      sym("(2×2)", matrixLatex("pmatrix", 2, 2), "pmatrix2"),
      sym("(3×3)", matrixLatex("pmatrix", 3, 3), "pmatrix3"),
      sym("[2×2]", matrixLatex("bmatrix", 2, 2), "bmatrix2"),
      sym("[3×3]", matrixLatex("bmatrix", 3, 3), "bmatrix3"),
      sym("|2×2|", matrixLatex("vmatrix", 2, 2), "vmatrix2"),
      sym("|3×3|", matrixLatex("vmatrix", 3, 3), "vmatrix3"),
      { ...sym("(m×n)", "pmatrix", "pmatrixFree"), special: "matrix" },
      { ...sym("[m×n]", "bmatrix", "bmatrixFree"), special: "matrix" },
      { ...sym("|m×n|", "vmatrix", "vmatrixFree"), special: "matrix" },
      sym(word("column"), matrixLatex("pmatrix", 3, 1), "columnVector"),
      sym(word("row"), matrixLatex("pmatrix", 1, 3), "rowVector"),
      sym("v⃗", r`\vec{#0}`, "vector"),
      sym("‖v‖", r`\left\|#0\right\|`, "norm"),
      sym("·", r`\cdot`, "dotProduct"),
      sym("×", r`\times`, "crossProduct"),
      sym("Aᵀ", r`^{T}`, "transpose"),
      { ...sym(word("addRowAfter"), "", "addRowAfter"), command: "addRowAfter" },
      { ...sym(word("addRowBefore"), "", "addRowBefore"), command: "addRowBefore" },
      { ...sym(word("addColumnAfter"), "", "addColumnAfter"), command: "addColumnAfter" },
      { ...sym(word("addColumnBefore"), "", "addColumnBefore"), command: "addColumnBefore" },
      { ...sym(word("removeRow"), "", "removeRow"), command: "removeRow" },
      { ...sym(word("removeColumn"), "", "removeColumn"), command: "removeColumn" },
    ],
  },
  {
    id: "greek", label: "formula.groups.greek", icon: "α",
    // Tooltip: LaTeX-Name des Buchstabens (nicht übersetzt)
    keys: [...GREEK_LOWER, ...GREEK_UPPER].map(([label, name]) => ({ label, latex: `\\${name}`, title: name })),
  },
  {
    id: "logic", label: "formula.groups.logic", icon: "∀",
    keys: [
      sym("∀", r`\forall`, "forAll"),
      sym("∃", r`\exists`, "exists"),
      sym("¬", r`\neg`, "not"),
      sym("∧", r`\land`, "and"),
      sym("∨", r`\lor`, "or"),
      sym("⇒", r`\Rightarrow`, "implies"),
      sym("⇔", r`\Leftrightarrow`, "equivalent"),
      sym("∈", r`\in`, "elementOf"),
      sym("∉", r`\notin`, "notElementOf"),
      sym("⊂", r`\subset`, "properSubset"),
      sym("⊆", r`\subseteq`, "subset"),
      sym("∪", r`\cup`, "union"),
      sym("∩", r`\cap`, "intersection"),
      sym("∖", r`\setminus`, "setDifference"),
      sym("∅", r`\emptyset`, "emptySet"),
      sym("{ | }", r`\left\{#0\mid #?\right\}`, "setBuilder"),
      sym("ℕ", r`\mathbb{N}`, "naturals"),
      sym("ℤ", r`\mathbb{Z}`, "integers"),
      sym("ℚ", r`\mathbb{Q}`, "rationals"),
      sym("ℝ", r`\mathbb{R}`, "reals"),
      sym("ℂ", r`\mathbb{C}`, "complexes"),
    ],
  },
  {
    id: "functions", label: "formula.groups.functions", icon: "sin",
    keys: [
      // Tooltip: Funktionsname (nicht übersetzt)
      ...["sin", "cos", "tan", "arcsin", "arccos", "arctan", "ln", "log", "exp", "sinh", "cosh"].map((f): PaletteKey =>
        ({ label: f, latex: `\\${f}\\left(#0\\right)`, title: f })),
      sym("logₐ", r`\log_{#?}\left(#0\right)`, "logBase"),
    ],
  },
  {
    id: "relations", label: "formula.groups.relations", icon: "≤",
    keys: [
      sym("=", "=", "equal"),
      sym("≠", r`\neq`, "notEqual"),
      sym("<", "<", "less"),
      sym(">", ">", "greater"),
      sym("≤", r`\leq`, "lessEqual"),
      sym("≥", r`\geq`, "greaterEqual"),
      sym("≈", r`\approx`, "approx"),
      sym("≡", r`\equiv`, "identical"),
      sym("∼", r`\sim`, "similar"),
      sym("±", r`\pm`, "plusMinus"),
      sym("·", r`\cdot`, "timesDot"),
      sym("×", r`\times`, "timesCross"),
      sym("→", r`\to`, "to"),
      sym("↦", r`\mapsto`, "mapsTo"),
    ],
  },
  {
    id: "maxima", label: "formula.groups.maxima", icon: "{@…@}",
    keys: [
      { ...sym("{@…@}", "{@expr@}", "casDisplay"), special: "cas" },
      { ...sym("{#…#}", "{#expr#}", "casValue"), special: "cas" },
    ],
  },
];
