// Referenz der wichtigsten STACK- und Maxima-Funktionen (für Autovervollständigung, Hover und Referenzpanel).

export interface FnDoc {
  name: string;
  sig: string;
  desc: string;
  returns: string;
  example?: string;
  cat: string;
}

export const CATEGORIES = [
  "Zufall",
  "Arithmetik",
  "Algebra",
  "Analysis",
  "Listen",
  "Mengen",
  "Logik & Prädikate",
  "Zeichenketten",
  "Matrizen",
  "Ausgabe & Darstellung",
  "Multiple Choice",
  "Steuerung",
  "Konstanten",
] as const;

const d = (cat: string, name: string, sig: string, desc: string, returns: string, example?: string): FnDoc => ({
  cat, name, sig, desc, returns, example,
});

export const FUNCTION_DOCS: FnDoc[] = [
  // ---- Zufall
  d("Zufall", "rand", "rand(n)", "Zufallszahl. Für eine ganze Zahl n eine ganze Zahl aus 0 … n−1, für eine Gleitkommazahl eine Zahl aus [0, n), für eine Liste ein zufälliges Element.", "Ganze Zahl, Gleitkommazahl oder Listenelement", "rand(6)+1  → 1 … 6\nrand([2,3,5,7]) → z. B. 5"),
  d("Zufall", "rand_with_step", "rand_with_step(lower, upper, step)", "Zufallszahl aus {lower, lower+step, …, upper}.", "Zahl", "rand_with_step(-5, 5, 2) → z. B. -1"),
  d("Zufall", "rand_with_prohib", "rand_with_prohib(lower, upper, list)", "Ganze Zufallszahl aus [lower, upper], die nicht in list vorkommt. Praktisch, um 0 oder Sonderfälle auszuschließen.", "Ganze Zahl", "rand_with_prohib(-3, 3, [0]) → -3 … 3 ohne 0"),
  d("Zufall", "rand_selection", "rand_selection(list, n)", "Wählt n verschiedene Elemente zufällig aus der Liste (ohne Zurücklegen).", "Liste mit n Elementen", "rand_selection([a,b,c,d], 2) → z. B. [d,a]"),
  d("Zufall", "rand_selection_with_replacement", "rand_selection_with_replacement(list, n)", "Wählt n Elemente mit Zurücklegen.", "Liste mit n Elementen"),
  d("Zufall", "random_permutation", "random_permutation(list)", "Zufällige Anordnung der Liste.", "Liste", "random_permutation([1,2,3]) → z. B. [3,1,2]"),

  // ---- Arithmetik
  d("Arithmetik", "abs", "abs(x)", "Betrag.", "Ausdruck", "abs(-3) → 3"),
  d("Arithmetik", "sqrt", "sqrt(x)", "Quadratwurzel; wird intern als x^(1/2) dargestellt und teilweise vereinfacht.", "Ausdruck", "sqrt(12) → 2*sqrt(3)"),
  d("Arithmetik", "mod", "mod(a, b)", "Rest der Division a durch b (nicht negativ für b>0).", "Zahl", "mod(7, 3) → 1"),
  d("Arithmetik", "floor", "floor(x)", "Abrunden auf die nächste ganze Zahl.", "Ganze Zahl", "floor(2.7) → 2"),
  d("Arithmetik", "ceiling", "ceiling(x)", "Aufrunden auf die nächste ganze Zahl.", "Ganze Zahl", "ceiling(2.1) → 3"),
  d("Arithmetik", "round", "round(x)", "Runden auf die nächste ganze Zahl.", "Ganze Zahl", "round(2.5) → 3"),
  d("Arithmetik", "truncate", "truncate(x)", "Nachkommastellen abschneiden.", "Ganze Zahl"),
  d("Arithmetik", "signum", "signum(x)", "Vorzeichen: −1, 0 oder 1.", "Ganze Zahl"),
  d("Arithmetik", "max", "max(a, b, …)", "Maximum der Argumente.", "Zahl/Ausdruck", "max(3, 7, 2) → 7"),
  d("Arithmetik", "min", "min(a, b, …)", "Minimum der Argumente.", "Zahl/Ausdruck"),
  d("Arithmetik", "lmax", "lmax(list)", "Maximum einer Liste.", "Zahl"),
  d("Arithmetik", "lmin", "lmin(list)", "Minimum einer Liste.", "Zahl"),
  d("Arithmetik", "gcd", "gcd(a, b)", "Größter gemeinsamer Teiler.", "Ganze Zahl", "gcd(12, 18) → 6"),
  d("Arithmetik", "lcm", "lcm(a, b)", "Kleinstes gemeinsames Vielfaches.", "Ganze Zahl", "lcm(4, 6) → 12"),
  d("Arithmetik", "factorial", "factorial(n)  bzw. n!", "Fakultät.", "Ganze Zahl", "5! → 120"),
  d("Arithmetik", "binomial", "binomial(n, k)", "Binomialkoeffizient „n über k“.", "Ganze Zahl", "binomial(5, 2) → 10"),
  d("Arithmetik", "num", "num(q)", "Zähler einer rationalen Zahl/eines Bruchs.", "Ausdruck", "num(3/4) → 3"),
  d("Arithmetik", "denom", "denom(q)", "Nenner einer rationalen Zahl/eines Bruchs.", "Ausdruck", "denom(3/4) → 4"),
  d("Arithmetik", "float", "float(expr)", "Wandelt Zahlen und Konstanten in Gleitkommazahlen.", "Gleitkommazahl/Ausdruck", "float(1/3) → 0.3333333333333333"),
  d("Arithmetik", "ifactors", "ifactors(n)", "Primfaktorzerlegung als Liste von [Primzahl, Exponent].", "Liste", "ifactors(12) → [[2,2],[3,1]]"),
  d("Arithmetik", "primep", "primep(n)", "Ist n eine Primzahl?", "true/false"),
  d("Arithmetik", "next_prime", "next_prime(n)", "Nächste Primzahl größer als n.", "Ganze Zahl"),
  d("Arithmetik", "divisors", "divisors(n)", "Menge aller positiven Teiler.", "Menge", "divisors(12) → {1,2,3,4,6,12}"),
  d("Arithmetik", "significantfigures", "significantfigures(x, n)", "Rundet x auf n signifikante Stellen.", "Gleitkommazahl", "significantfigures(3.14159, 3) → 3.14"),
  d("Arithmetik", "decimalplaces", "decimalplaces(x, n)", "Rundet x auf n Nachkommastellen.", "Gleitkommazahl", "decimalplaces(2.71828, 2) → 2.72"),

  // ---- Algebra
  d("Algebra", "expand", "expand(expr)", "Multipliziert Produkte und Potenzen von Summen aus.", "Ausdruck", "expand((x+1)^2) → x^2+2*x+1"),
  d("Algebra", "factor", "factor(expr)", "Faktorisiert Polynome bzw. ganze Zahlen. (In der lokalen Vorschau nicht ausgeführt.)", "Ausdruck", "factor(x^2-1) → (x-1)*(x+1)"),
  d("Algebra", "ratsimp", "ratsimp(expr)", "Vereinfacht rationale Ausdrücke (gemeinsamer Nenner, gekürzt).", "Ausdruck"),
  d("Algebra", "fullratsimp", "fullratsimp(expr)", "Wiederholtes ratsimp bis keine Änderung mehr eintritt.", "Ausdruck"),
  d("Algebra", "radcan", "radcan(expr)", "Vereinfacht Ausdrücke mit Wurzeln, Logarithmen und Exponentialfunktionen.", "Ausdruck"),
  d("Algebra", "trigsimp", "trigsimp(expr)", "Vereinfacht trigonometrische Ausdrücke (sin²+cos²=1 …).", "Ausdruck"),
  d("Algebra", "subst", "subst(neu, alt, expr)  bzw.  subst(alt=neu, expr)", "Ersetzt alt durch neu in expr.", "Ausdruck", "subst(2, x, x^2+1) → 5"),
  d("Algebra", "ev", "ev(expr, opt1, …)", "Wertet expr mit Optionen aus, z. B. simp, numer, expand oder Belegungen x=2.", "Ausdruck", "ev(x^2, x=3) → 9\nev(2+3, simp) → 5"),
  d("Algebra", "solve", "solve(eq, x)", "Löst Gleichung(en) nach x. (In der lokalen Vorschau nicht ausgeführt.)", "Liste von Gleichungen [x=…]", "solve(x^2=4, x) → [x=-2, x=2]"),
  d("Algebra", "coeff", "coeff(expr, x, n)", "Koeffizient von x^n im (ausmultiplizierten) Ausdruck.", "Ausdruck", "coeff(3*x^2+2*x, x, 2) → 3"),
  d("Algebra", "hipow", "hipow(expr, x)", "Höchste Potenz von x.", "Ganze Zahl", "hipow(x^3+x, x) → 3"),
  d("Algebra", "lhs", "lhs(eq)", "Linke Seite einer Gleichung/Ungleichung.", "Ausdruck", "lhs(y=2*x) → y"),
  d("Algebra", "rhs", "rhs(eq)", "Rechte Seite einer Gleichung/Ungleichung.", "Ausdruck", "rhs(y=2*x) → 2*x"),
  d("Algebra", "part", "part(expr, n)", "n-ter Teil eines Ausdrucks (0 = Operator).", "Ausdruck", "part(a+b, 1) → b (interne Ordnung)"),
  d("Algebra", "args", "args(expr)", "Argumente des obersten Operators als Liste.", "Liste"),
  d("Algebra", "op", "op(expr)", "Oberster Operator des Ausdrucks.", "Operator", "op(a+b) → \"+\""),
  d("Algebra", "exp", "exp(x)", "Exponentialfunktion e^x.", "Ausdruck"),
  d("Algebra", "log", "log(x)", "Natürlicher Logarithmus (Basis e). Achtung: log ist ln!", "Ausdruck", "log(%e) → 1"),
  d("Algebra", "lg", "lg(x, b)", "Logarithmus zur Basis b (STACK). Ohne b: Basis 10.", "Ausdruck"),
  d("Algebra", "sin", "sin(x)", "Sinus (Bogenmaß).", "Ausdruck"),
  d("Algebra", "cos", "cos(x)", "Kosinus (Bogenmaß).", "Ausdruck"),
  d("Algebra", "tan", "tan(x)", "Tangens (Bogenmaß).", "Ausdruck"),
  d("Algebra", "asin", "asin(x)", "Arkussinus.", "Ausdruck"),
  d("Algebra", "acos", "acos(x)", "Arkuskosinus.", "Ausdruck"),
  d("Algebra", "atan", "atan(x)", "Arkustangens.", "Ausdruck"),

  // ---- Analysis
  d("Analysis", "diff", "diff(expr, x, n)", "n-te Ableitung nach x (n optional, Standard 1).", "Ausdruck", "diff(x^3, x) → 3*x^2\ndiff(sin(x), x, 2) → -sin(x)"),
  d("Analysis", "integrate", "integrate(expr, x)  bzw.  integrate(expr, x, a, b)", "Stammfunktion bzw. bestimmtes Integral. Lokal nur für Polynome und Grundfunktionen.", "Ausdruck", "integrate(x^2, x) → x^3/3\nintegrate(x, x, 0, 2) → 2"),
  d("Analysis", "limit", "limit(expr, x, a)", "Grenzwert für x → a (a kann inf/minf sein). (Lokal nicht ausgewertet.)", "Ausdruck", "limit(1/x, x, inf) → 0"),
  d("Analysis", "taylor", "taylor(expr, x, a, n)", "Taylorpolynom vom Grad n um a. (Lokal nicht ausgewertet.)", "Ausdruck"),
  d("Analysis", "sum", "sum(expr, i, a, b)", "Summe für i = a … b.", "Ausdruck", "sum(k^2, k, 1, 3) → 14"),
  d("Analysis", "product", "product(expr, i, a, b)", "Produkt für i = a … b.", "Ausdruck", "product(k, k, 1, 4) → 24"),

  // ---- Listen
  d("Listen", "makelist", "makelist(expr, i, a, b)  bzw.  makelist(expr, i, list)", "Erzeugt eine Liste, indem expr für i = a … b (oder alle Elemente von list) ausgewertet wird.", "Liste", "makelist(i^2, i, 1, 4) → [1,4,9,16]"),
  d("Listen", "length", "length(list)", "Anzahl der Elemente (auch Anzahl der Argumente eines Ausdrucks).", "Ganze Zahl", "length([a,b,c]) → 3"),
  d("Listen", "first", "first(list)", "Erstes Element.", "Element", "first([5,6,7]) → 5"),
  d("Listen", "second", "second(list)", "Zweites Element.", "Element"),
  d("Listen", "third", "third(list)", "Drittes Element.", "Element"),
  d("Listen", "last", "last(list)", "Letztes Element.", "Element", "last([5,6,7]) → 7"),
  d("Listen", "rest", "rest(list, n)", "Liste ohne die ersten n Elemente (n optional, Standard 1; negativ: ohne die letzten).", "Liste", "rest([1,2,3]) → [2,3]"),
  d("Listen", "append", "append(l1, l2, …)", "Hängt Listen aneinander.", "Liste", "append([1,2],[3]) → [1,2,3]"),
  d("Listen", "cons", "cons(x, list)", "Fügt x am Anfang ein.", "Liste"),
  d("Listen", "endcons", "endcons(x, list)", "Fügt x am Ende ein.", "Liste"),
  d("Listen", "reverse", "reverse(list)", "Kehrt die Reihenfolge um.", "Liste"),
  d("Listen", "sort", "sort(list)  bzw.  sort(list, pred)", "Sortiert die Liste (optional mit Vergleichsfunktion).", "Liste", "sort([3,1,2]) → [1,2,3]"),
  d("Listen", "unique", "unique(list)", "Entfernt Duplikate (sortiert).", "Liste"),
  d("Listen", "flatten", "flatten(list)", "Verschachtelte Listen zu einer flachen Liste.", "Liste"),
  d("Listen", "member", "member(x, list)", "Ist x in der Liste enthalten?", "true/false"),
  d("Listen", "delete", "delete(x, list)", "Entfernt alle Vorkommen von x.", "Liste"),
  d("Listen", "sublist", "sublist(list, pred)", "Alle Elemente, für die pred true liefert.", "Liste", "sublist([1,2,3,4], evenp) → [2,4]"),
  d("Listen", "sublist_indices", "sublist_indices(list, pred)", "Indizes der Elemente, für die pred true liefert.", "Liste"),
  d("Listen", "map", "map(f, list)", "Wendet f auf jedes Element an.", "Liste", "map(lambda([t], t^2), [1,2,3]) → [1,4,9]"),
  d("Listen", "apply", "apply(f, list)", "Ruft f mit den Listenelementen als Argumente auf.", "Ausdruck", "apply(\"+\", [1,2,3]) → 6\napply(max, [4,9,2]) → 9"),
  d("Listen", "lsum", "lsum(expr, i, list)", "Summe von expr über alle i aus der Liste.", "Ausdruck"),
  d("Listen", "zip_with", "zip_with(f, l1, l2)", "Kombiniert zwei Listen elementweise mit f.", "Liste"),

  // ---- Mengen
  d("Mengen", "setify", "setify(list)", "Wandelt eine Liste in eine Menge.", "Menge", "setify([1,2,2]) → {1,2}"),
  d("Mengen", "listify", "listify(set)", "Wandelt eine Menge in eine Liste.", "Liste"),
  d("Mengen", "union", "union(A, B, …)", "Vereinigungsmenge.", "Menge"),
  d("Mengen", "intersection", "intersection(A, B, …)", "Schnittmenge.", "Menge"),
  d("Mengen", "setdifference", "setdifference(A, B)", "Differenzmenge A \\ B.", "Menge"),
  d("Mengen", "elementp", "elementp(x, A)", "Ist x Element von A?", "true/false"),
  d("Mengen", "subsetp", "subsetp(A, B)", "Ist A Teilmenge von B?", "true/false"),
  d("Mengen", "cardinality", "cardinality(A)", "Anzahl der Elemente einer Menge.", "Ganze Zahl"),

  // ---- Logik & Prädikate
  d("Logik & Prädikate", "is", "is(expr)", "Wertet eine Bedingung zu true/false aus (unknown, falls nicht entscheidbar).", "true/false/unknown", "is(3>2) → true"),
  d("Logik & Prädikate", "numberp", "numberp(x)", "Ist x eine Zahl?", "true/false"),
  d("Logik & Prädikate", "integerp", "integerp(x)", "Ist x eine ganze Zahl?", "true/false"),
  d("Logik & Prädikate", "floatnump", "floatnump(x)", "Ist x eine Gleitkommazahl?", "true/false"),
  d("Logik & Prädikate", "listp", "listp(x)", "Ist x eine Liste?", "true/false"),
  d("Logik & Prädikate", "setp", "setp(x)", "Ist x eine Menge?", "true/false"),
  d("Logik & Prädikate", "stringp", "stringp(x)", "Ist x eine Zeichenkette?", "true/false"),
  d("Logik & Prädikate", "evenp", "evenp(n)", "Ist n gerade?", "true/false"),
  d("Logik & Prädikate", "oddp", "oddp(n)", "Ist n ungerade?", "true/false"),
  d("Logik & Prädikate", "emptyp", "emptyp(x)", "Ist die Liste/Menge leer?", "true/false"),
  d("Logik & Prädikate", "freeof", "freeof(x, expr)", "Kommt x in expr nicht vor?", "true/false"),
  d("Logik & Prädikate", "equationp", "equationp(x)", "Ist x eine Gleichung (a=b)?", "true/false"),
  d("Logik & Prädikate", "inequalityp", "inequalityp(x)", "Ist x eine Ungleichung?", "true/false"),
  d("Logik & Prädikate", "polynomialpsimp", "polynomialpsimp(p)", "Ist p ein Polynom in seinen Variablen? (STACK)", "true/false"),
  d("Logik & Prädikate", "expandp", "expandp(p)", "Ist p ausmultipliziert? (STACK)", "true/false"),
  d("Logik & Prädikate", "factorp", "factorp(p)", "Ist p faktorisiert? (STACK)", "true/false"),

  // ---- Zeichenketten
  d("Zeichenketten", "string", "string(expr)", "Wandelt einen Ausdruck in eine Zeichenkette.", "Zeichenkette", "string(x^2) → \"x^2\""),
  d("Zeichenketten", "sconcat", "sconcat(a, b, …)", "Verkettet zu einer Zeichenkette.", "Zeichenkette", "sconcat(\"a=\", 3) → \"a=3\""),
  d("Zeichenketten", "simplode", "simplode(list, sep)", "Verbindet Listenelemente mit Trennzeichen.", "Zeichenkette", "simplode([1,2,3], \", \") → \"1, 2, 3\""),
  d("Zeichenketten", "slength", "slength(s)", "Länge der Zeichenkette.", "Ganze Zahl"),
  d("Zeichenketten", "sdowncase", "sdowncase(s)", "In Kleinbuchstaben.", "Zeichenkette"),
  d("Zeichenketten", "supcase", "supcase(s)", "In Großbuchstaben.", "Zeichenkette"),
  d("Zeichenketten", "ssubst", "ssubst(neu, alt, s)", "Ersetzt alt durch neu in s.", "Zeichenkette"),
  d("Zeichenketten", "split", "split(s, sep)", "Zerlegt die Zeichenkette.", "Liste von Zeichenketten"),
  d("Zeichenketten", "parse_string", "parse_string(s)", "Wandelt eine Zeichenkette in einen Ausdruck (ohne Auswertung).", "Ausdruck"),
  d("Zeichenketten", "eval_string", "eval_string(s)", "Parst und wertet die Zeichenkette aus.", "Ausdruck"),
  d("Zeichenketten", "castext", "castext(\"…\")", "CASText innerhalb von Variablen, z. B. für Feedback: castext(\"Wert {@a@}\").", "CASText"),

  // ---- Matrizen
  d("Matrizen", "matrix", "matrix([a,b], [c,d], …)", "Matrix aus Zeilenlisten.", "Matrix", "matrix([1,2],[3,4])"),
  d("Matrizen", "transpose", "transpose(M)", "Transponierte Matrix.", "Matrix"),
  d("Matrizen", "determinant", "determinant(M)", "Determinante.", "Ausdruck"),
  d("Matrizen", "invert", "invert(M)", "Inverse Matrix. (Lokal nicht ausgewertet.)", "Matrix"),
  d("Matrizen", "zeromatrix", "zeromatrix(m, n)", "Nullmatrix m×n.", "Matrix"),
  d("Matrizen", "ident", "ident(n)", "Einheitsmatrix n×n.", "Matrix"),

  // ---- Ausgabe & Darstellung
  d("Ausgabe & Darstellung", "dispdp", "dispdp(x, n)", "Zeigt x mit genau n Nachkommastellen an (auch nachfolgende Nullen).", "Darstellungsobjekt", "dispdp(2.5, 2) → 2.50"),
  d("Ausgabe & Darstellung", "displaydp", "displaydp(x, n)", "Wie dispdp (ältere Bezeichnung).", "Darstellungsobjekt"),
  d("Ausgabe & Darstellung", "dispsf", "dispsf(x, n)", "Zeigt x mit n signifikanten Stellen an.", "Darstellungsobjekt"),
  d("Ausgabe & Darstellung", "stackunits", "stackunits(zahl, einheit)", "Zahl mit Einheit (für Eingabetyp units).", "Ausdruck", "stackunits(9.81, m/s^2)"),
  d("Ausgabe & Darstellung", "texput", "texput(name, \"tex\")", "Legt die LaTeX-Darstellung eines Symbols fest.", "done", "texput(v, \"\\\\vec{v}\")"),
  d("Ausgabe & Darstellung", "stack_include", "stack_include(\"url\")", "Bindet externe Maxima-Bibliotheken ein (STACK ≥ 4.4).", "done"),

  // ---- Multiple Choice
  d("Multiple Choice", "mcq_correct", "mcq_correct(ta)", "Liefert die als richtig markierten Werte einer MC-Musterlösung [[wert, true/false, anzeige], …].", "Liste", "first(mcq_correct([[a,false],[b,true]])) → b"),
  d("Multiple Choice", "mcq_incorrect", "mcq_incorrect(ta)", "Liefert die als falsch markierten Werte.", "Liste"),

  // ---- Steuerung
  d("Steuerung", "if", "if bed then a elseif bed2 then b else c", "Bedingte Auswertung. Bedingungen werden wie mit is() ausgewertet.", "Wert des gewählten Zweigs", "a: if n>0 then 1 else -1;"),
  d("Steuerung", "for", "for i:a thru b do expr  |  for x in list do expr", "Schleife (Rückgabe: done). Für Listen meist makelist/map einfacher.", "done"),
  d("Steuerung", "block", "block([lokal1, lokal2], ausdr1, ausdr2, …)", "Gruppiert Anweisungen mit lokalen Variablen; Rückgabe ist der letzte Ausdruck.", "Wert des letzten Ausdrucks", "block([t:2], t^2) → 4"),
  d("Steuerung", "lambda", "lambda([x, …], expr)", "Anonyme Funktion, z. B. für map oder sublist.", "Funktion", "map(lambda([t], 2*t), [1,2]) → [2,4]"),
  d("Steuerung", "define", "define(f(x), expr)", "Definiert eine Funktion mit ausgewertetem Rumpf.", "Funktion"),
  d("Steuerung", "return", "return(x)", "Beendet einen block vorzeitig mit Wert x.", "x"),
  d("Steuerung", "simp", "simp: true | false", "Schaltet die automatische Vereinfachung um (Option „Vereinfachen“ der Frage).", "true/false"),

  // ---- Konstanten
  d("Konstanten", "%pi", "%pi", "Kreiszahl π.", "Konstante"),
  d("Konstanten", "%e", "%e", "Eulersche Zahl e.", "Konstante"),
  d("Konstanten", "%i", "%i", "Imaginäre Einheit i.", "Konstante"),
  d("Konstanten", "inf", "inf", "+∞ (z. B. in limit).", "Konstante"),
  d("Konstanten", "minf", "minf", "−∞.", "Konstante"),
  d("Konstanten", "true", "true", "Wahrheitswert wahr.", "Boolesch"),
  d("Konstanten", "false", "false", "Wahrheitswert falsch.", "Boolesch"),
];

export const DOC_BY_NAME = new Map(FUNCTION_DOCS.map((f) => [f.name, f]));

export const MAXIMA_KEYWORDS = ["if", "then", "elseif", "else", "and", "or", "not", "for", "thru", "step", "do", "in", "while", "unless", "from"];

/** CASText-Elemente für die Vervollständigung im Fragetext. */
export interface CasTextSnippet { label: string; insert: string; detail: string; info: string }

export const CASTEXT_BLOCKS: CasTextSnippet[] = [
  { label: "[[if test=…]]", insert: '[[if test="${bed}"]]\n${}\n[[else]]\n\n[[/if]]', detail: "Bedingter Block", info: "Zeigt den Inhalt nur, wenn die Maxima-Bedingung true ist. Mit [[elif test=\"…\"]] und [[else]] erweiterbar." },
  { label: "[[foreach x=…]]", insert: '[[foreach ${x}="${liste}"]]${}[[/foreach]]', detail: "Schleife", info: "Wiederholt den Inhalt für jedes Listenelement." },
  { label: "[[define x=…]]", insert: '[[define ${x}="${ausdruck}"]]', detail: "Variable setzen", info: "Setzt eine Variable innerhalb des CASTexts." },
  { label: "[[comment]]", insert: "[[comment]]${}[[/comment]]", detail: "Kommentar", info: "Inhalt wird nie angezeigt." },
  { label: "[[escape]]", insert: '[[escape value="${text}"]]', detail: "Unverarbeiteter Text", info: "Gibt Text ohne CASText-Auswertung aus." },
  { label: "[[hint title=…]]", insert: '[[hint title="${Hinweis}"]]${}[[/hint]]', detail: "Aufklappbarer Hinweis", info: "Ausklappbarer Hinweisbereich." },
  { label: "[[lang code=…]]", insert: '[[lang code="${de}"]]${}[[/lang]]', detail: "Sprachblock", info: "Inhalt nur für die angegebenen Sprachen (z. B. de,en,other)." },
  { label: "[[jsxgraph]]", insert: '[[jsxgraph width="500px" height="400px"]]\nvar board = JXG.JSXGraph.initBoard(divid, {boundingbox: [-5, 5, 5, -5], axis: true, showCopyright: false});\n${}\n[[/jsxgraph]]', detail: "Interaktive Grafik", info: "JSXGraph-Code. divid enthält die ID des Grafikbereichs; {#ausdruck#} setzt Maxima-Werte ein. Mit input-ref-ans1=\"ans1Ref\" an eine Eingabe binden." },
  { label: "[[todo]]", insert: "[[todo]]${}[[/todo]]", detail: "Notiz", info: "Markiert offene Punkte (wird Studierenden nicht angezeigt)." },
];

export const STACK_JXG_DOCS: FnDoc[] = [
  d("JSXGraph", "stack_jxg.bind_point", "stack_jxg.bind_point(inputRef, point)", "Verknüpft einen Punkt mit einer Eingabe; die Koordinaten werden als [x,y] gespeichert.", "–"),
  d("JSXGraph", "stack_jxg.bind_slider", "stack_jxg.bind_slider(inputRef, slider)", "Verknüpft einen Schieberegler mit einer Eingabe (Zahlenwert).", "–"),
  d("JSXGraph", "stack_jxg.bind_point_dual", "stack_jxg.bind_point_dual(inputRef, point)", "Wie bind_point, Wert als [x,y] in Doppellisten-Form.", "–"),
  d("JSXGraph", "stack_jxg.bind_list_of", "stack_jxg.bind_list_of(inputRef, [obj1, obj2, …])", "Bindet mehrere Punkte/Regler als Liste an eine Eingabe.", "–"),
];
