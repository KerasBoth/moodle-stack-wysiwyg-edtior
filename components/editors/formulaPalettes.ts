// Werkzeugleiste des Formel-Editors (Entwurf C): Gruppen, deren Tasten als Palette aufklappen.
// `latex` verwendet MathLive-Platzhalter: #0 = Auswahl bzw. erste offene Stelle, #? = weitere offene Stelle.

export interface PaletteKey {
  label: string;
  latex: string;
  title: string;
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
  label: string;
  icon: string;
  keys: PaletteKey[];
}

const r = String.raw;
const sym = (label: string, latex: string, title: string): PaletteKey => ({ label, latex, title });

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

/** Inline-Kürzel: „dx“, „dt“ … hinter einem Integranden werden zu `\,dx`, `\,dt` … (halber Abstand wie in der Palette). */
export const DIFFERENTIAL_SHORTCUTS: Record<string, { value: string; after: string }> = Object.fromEntries(
  ["x", "y", "z", "t", "u", "v", "r", "s"].map((v) => [`d${v}`, { value: r`\,d${v}`, after: DIFFERENTIAL_AFTER }]),
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
    id: "roots", label: "Wurzeln & Brüche", icon: "√x",
    keys: [
      sym("√x", r`\sqrt{#0}`, "Quadratwurzel"),
      sym("ⁿ√x", r`\sqrt[#?]{#0}`, "n-te Wurzel"),
      sym("a⁄b", r`\frac{#0}{#?}`, "Bruch"),
      sym("xⁿ", r`#0^{#?}`, "Potenz"),
      sym("xₙ", r`#0_{#?}`, "Index"),
      sym("xₙᵐ", r`#0_{#?}^{#?}`, "Index und Exponent"),
      sym("eˣ", r`e^{#0}`, "e-Funktion als Potenz"),
      sym("( )", r`\left(#0\right)`, "Runde Klammern"),
      sym("[ ]", r`\left[#0\right]`, "Eckige Klammern"),
      sym("{ }", r`\left\{#0\right\}`, "Geschweifte Klammern"),
      sym("|x|", r`\left|#0\right|`, "Betrag"),
    ],
  },
  {
    id: "analysis", label: "Analysis", icon: "∫",
    keys: [
      sym("∫", r`\int #0\,dx`, "Unbestimmtes Integral"),
      sym("∫ₐᵇ", r`\int_{#?}^{#?} #0\,dx`, "Bestimmtes Integral"),
      sym("∬", r`\iint_{#?} #0\,dA`, "Doppelintegral"),
      sym("∮", r`\oint_{#?} #0\,ds`, "Kurvenintegral"),
      sym("∑", r`\sum_{#?}^{#?} #0`, "Summe"),
      sym("∏", r`\prod_{#?}^{#?} #0`, "Produkt"),
      sym("lim", r`\lim_{#? \to #?} #0`, "Grenzwert"),
      sym("∞", r`\infty`, "Unendlich"),
      sym("d⁄dx", r`\frac{d}{dx}#0`, "Ableitung d/dx"),
      sym("dy⁄dx", r`\frac{d#0}{d#?}`, "Differentialquotient"),
      sym("∂⁄∂x", r`\frac{\partial #0}{\partial #?}`, "Partielle Ableitung"),
      sym("∂", r`\partial`, "Partielles Differential"),
      sym("f′", r`^{\prime}`, "Strich (Ableitung)"),
      sym("∇", r`\nabla`, "Nabla"),
    ],
  },
  {
    id: "matrix", label: "Matrizen & Vektoren", icon: "[ ]",
    keys: [
      sym("(2×2)", matrixLatex("pmatrix", 2, 2), "Matrix 2×2, runde Klammern"),
      sym("(3×3)", matrixLatex("pmatrix", 3, 3), "Matrix 3×3, runde Klammern"),
      sym("[2×2]", matrixLatex("bmatrix", 2, 2), "Matrix 2×2, eckige Klammern"),
      sym("[3×3]", matrixLatex("bmatrix", 3, 3), "Matrix 3×3, eckige Klammern"),
      sym("|2×2|", matrixLatex("vmatrix", 2, 2), "Determinante 2×2"),
      sym("|3×3|", matrixLatex("vmatrix", 3, 3), "Determinante 3×3"),
      { label: "(m×n)", latex: "pmatrix", title: "Matrix frei wählbarer Größe, runde Klammern", special: "matrix" },
      { label: "[m×n]", latex: "bmatrix", title: "Matrix frei wählbarer Größe, eckige Klammern", special: "matrix" },
      { label: "|m×n|", latex: "vmatrix", title: "Determinante frei wählbarer Größe", special: "matrix" },
      sym("Spalte", matrixLatex("pmatrix", 3, 1), "Spaltenvektor"),
      sym("Zeile", matrixLatex("pmatrix", 1, 3), "Zeilenvektor"),
      sym("v⃗", r`\vec{#0}`, "Vektorpfeil"),
      sym("‖v‖", r`\|#0\|`, "Norm"),
      sym("·", r`\cdot`, "Skalarprodukt"),
      sym("×", r`\times`, "Kreuzprodukt"),
      sym("Aᵀ", r`^{T}`, "Transponiert"),
      { label: "+Zeile↓", latex: "", title: "Zeile unterhalb einfügen (Cursor in der Matrix)", command: "addRowAfter" },
      { label: "+Zeile↑", latex: "", title: "Zeile oberhalb einfügen (Cursor in der Matrix)", command: "addRowBefore" },
      { label: "+Spalte→", latex: "", title: "Spalte rechts einfügen (Cursor in der Matrix)", command: "addColumnAfter" },
      { label: "+Spalte←", latex: "", title: "Spalte links einfügen (Cursor in der Matrix)", command: "addColumnBefore" },
      { label: "−Zeile", latex: "", title: "Zeile entfernen (Cursor in der Matrix)", command: "removeRow" },
      { label: "−Spalte", latex: "", title: "Spalte entfernen (Cursor in der Matrix)", command: "removeColumn" },
    ],
  },
  {
    id: "greek", label: "Griechisch", icon: "α",
    keys: [...GREEK_LOWER, ...GREEK_UPPER].map(([label, name]) => sym(label, `\\${name}`, name)),
  },
  {
    id: "logic", label: "Logik & Mengen", icon: "∀",
    keys: [
      sym("∀", r`\forall`, "Für alle"),
      sym("∃", r`\exists`, "Es existiert"),
      sym("¬", r`\neg`, "Nicht"),
      sym("∧", r`\land`, "Und"),
      sym("∨", r`\lor`, "Oder"),
      sym("⇒", r`\Rightarrow`, "Folgt"),
      sym("⇔", r`\Leftrightarrow`, "Äquivalent"),
      sym("∈", r`\in`, "Element von"),
      sym("∉", r`\notin`, "Nicht Element von"),
      sym("⊂", r`\subset`, "Echte Teilmenge"),
      sym("⊆", r`\subseteq`, "Teilmenge"),
      sym("∪", r`\cup`, "Vereinigung"),
      sym("∩", r`\cap`, "Schnitt"),
      sym("∖", r`\setminus`, "Differenzmenge"),
      sym("∅", r`\emptyset`, "Leere Menge"),
      sym("{ | }", r`\left\{#0\mid #?\right\}`, "Mengenklammer mit Bedingung"),
      sym("ℕ", r`\mathbb{N}`, "Natürliche Zahlen"),
      sym("ℤ", r`\mathbb{Z}`, "Ganze Zahlen"),
      sym("ℚ", r`\mathbb{Q}`, "Rationale Zahlen"),
      sym("ℝ", r`\mathbb{R}`, "Reelle Zahlen"),
      sym("ℂ", r`\mathbb{C}`, "Komplexe Zahlen"),
    ],
  },
  {
    id: "functions", label: "Funktionen", icon: "sin",
    keys: [
      ...["sin", "cos", "tan", "arcsin", "arccos", "arctan", "ln", "log", "exp", "sinh", "cosh"].map((f) =>
        sym(f, `\\${f}\\left(#0\\right)`, f)),
      sym("logₐ", r`\log_{#?}\left(#0\right)`, "Logarithmus zur Basis a"),
    ],
  },
  {
    id: "relations", label: "Relationen", icon: "≤",
    keys: [
      sym("=", "=", "Gleich"),
      sym("≠", r`\neq`, "Ungleich"),
      sym("<", "<", "Kleiner"),
      sym(">", ">", "Größer"),
      sym("≤", r`\leq`, "Kleiner oder gleich"),
      sym("≥", r`\geq`, "Größer oder gleich"),
      sym("≈", r`\approx`, "Ungefähr gleich"),
      sym("≡", r`\equiv`, "Identisch"),
      sym("∼", r`\sim`, "Ähnlich"),
      sym("±", r`\pm`, "Plus-minus"),
      sym("·", r`\cdot`, "Mal (Punkt)"),
      sym("×", r`\times`, "Mal (Kreuz)"),
      sym("→", r`\to`, "Pfeil, gegen"),
      sym("↦", r`\mapsto`, "Wird abgebildet auf"),
    ],
  },
  {
    id: "maxima", label: "Maxima", icon: "{@…@}",
    keys: [
      { label: "{@…@}", latex: "{@expr@}", title: "Maxima-Ausdruck {@…@} (Wert wird angezeigt)", special: "cas" },
      { label: "{#…#}", latex: "{#expr#}", title: "Maxima-Ausdruck {#…#} (Wert als Maxima-Code)", special: "cas" },
    ],
  },
];
