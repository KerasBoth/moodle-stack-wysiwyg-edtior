// Datenmodell einer STACK-Aufgabe (Moodle-XML).

import type { Msg } from "../i18n/index.ts";

export interface FText {
  format: string;
  text: string;
}

export interface StackInput {
  /** Alle einfachen Felder, z. B. name, type, tans, boxsize … */
  fields: Record<string, string>;
}

export interface PrtNode {
  fields: Record<string, string>;
  truefeedback: FText;
  falsefeedback: FText;
}

export interface Prt {
  name: string;
  value: string;
  autosimplify: string;
  feedbackstyle: string;
  feedbackvariables: string;
  nodes: PrtNode[];
  extra: string[];
}

export interface QTestInput { name: string; value: string }
export interface QTestExpected {
  name: string;
  expectedscore: string;
  expectedpenalty: string;
  expectedanswernote: string;
}
export interface QTest {
  testcase: string;
  description: string;
  inputs: QTestInput[];
  expected: QTestExpected[];
}

export const TEXT_FIELDS = [
  "questiontext",
  "generalfeedback",
  "specificfeedback",
  "questionnote",
  "questiondescription",
  "prtcorrect",
  "prtpartiallycorrect",
  "prtincorrect",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** Einfache Felder in Exportreihenfolge (vor den Eingaben). */
export const SCALAR_FIELDS = [
  "defaultgrade", "penalty", "hidden", "idnumber",
  "questionsimplify", "assumepositive", "assumereal",
  "decimals", "scientificnotation", "multiplicationsign", "sqrtsign", "complexno",
  "inversetrig", "logicsymbol", "matrixparens", "isbroken", "variantsselectionseed",
] as const;

export const INPUT_FIELDS = [
  "name", "type", "tans", "boxsize", "strictsyntax", "insertstars", "syntaxhint", "syntaxattribute",
  "forbidwords", "allowwords", "forbidfloat", "requirelowestterms", "checkanswertype",
  "mustverify", "showvalidation", "options",
];

export const NODE_FIELDS_BEFORE = ["name", "description", "answertest", "sans", "tans", "testoptions", "quiet"];
export const NODE_BRANCH_FIELDS = ["scoremode", "score", "penalty", "nextnode", "answernote"];

export interface StackQuestion {
  uid: string;
  comment: string;
  name: string;
  texts: Record<TextField, FText>;
  scalars: Record<string, string>;
  stackversion: string;
  questionvariables: string;
  inputs: StackInput[];
  prts: Prt[];
  deployedseeds: string[];
  qtests: QTest[];
  tags: string[];
  /** Unbekannte Elemente – werden unverändert wieder exportiert. */
  extra: string[];
}

export type QuizItem =
  | { kind: "stack"; q: StackQuestion }
  | { kind: "raw"; xml: string; label: Msg; comment: string };

export interface Quiz {
  items: QuizItem[];
}

let uidCounter = 0;
export function newUid(): string {
  uidCounter++;
  return `q${Date.now().toString(36)}${uidCounter}`;
}

export function defaultInput(name: string, tans = ""): StackInput {
  return {
    fields: {
      name, type: "algebraic", tans, boxsize: "15", strictsyntax: "1", insertstars: "0",
      syntaxhint: "", syntaxattribute: "0", forbidwords: "", allowwords: "", forbidfloat: "1",
      requirelowestterms: "0", checkanswertype: "0", mustverify: "1", showvalidation: "1", options: "",
    },
  };
}

export function defaultNode(index: number, prtName: string, sans = "ans1", tans = "ta1"): PrtNode {
  return {
    fields: {
      name: String(index), description: "", answertest: "AlgEquiv", sans, tans, testoptions: "", quiet: "0",
      truescoremode: "=", truescore: "1", truepenalty: "", truenextnode: "-1", trueanswernote: `${prtName}-${index + 1}-T`,
      falsescoremode: "=", falsescore: "0", falsepenalty: "", falsenextnode: "-1", falseanswernote: `${prtName}-${index + 1}-F`,
    },
    truefeedback: { format: "html", text: "" },
    falsefeedback: { format: "html", text: "" },
  };
}

export function defaultPrt(name: string, sans = "ans1", tans = "ta1"): Prt {
  return {
    name, value: "1.0000000", autosimplify: "1", feedbackstyle: "1", feedbackvariables: "",
    nodes: [defaultNode(0, name, sans, tans)], extra: [],
  };
}

// Inhalt (ins XML), nicht übersetzen – Name, Texte und Rückmeldungen der neuen Aufgabe sind in jeder Sprache gleich
export function newQuestion(): StackQuestion {
  return {
    uid: newUid(),
    comment: "",
    name: "Neue STACK-Aufgabe",
    texts: {
      questiontext: { format: "html", text: "<p>Berechnen Sie \\(a+b\\) für \\(a={@a@}\\) und \\(b={@b@}\\).</p>\n<p>[[input:ans1]] [[validation:ans1]]</p>\n<p>[[feedback:prt1]]</p>" },
      generalfeedback: { format: "html", text: "" },
      specificfeedback: { format: "html", text: "" },
      questionnote: { format: "moodle_auto_format", text: "{@[a,b]@}" },
      questiondescription: { format: "html", text: "" },
      prtcorrect: { format: "html", text: '<span style="font-size: 1.5em; color:green;"><i class="fa fa-check"></i></span> Richtige Antwort, gut gemacht!' },
      prtpartiallycorrect: { format: "html", text: '<span style="font-size: 1.5em; color:orange;"><i class="fa fa-adjust"></i></span> Ihre Antwort ist teilweise korrekt.' },
      prtincorrect: { format: "html", text: '<span style="font-size: 1.5em; color:red;"><i class="fa fa-times"></i></span> Falsche Antwort.' },
    },
    scalars: {
      defaultgrade: "1", penalty: "0.1", hidden: "0", idnumber: "",
      questionsimplify: "1", assumepositive: "0", assumereal: "0",
      decimals: ".", scientificnotation: "*10", multiplicationsign: "dot", sqrtsign: "1", complexno: "i",
      inversetrig: "cos-1", logicsymbol: "lang", matrixparens: "[", isbroken: "0", variantsselectionseed: "",
    },
    stackversion: "2024012900",
    questionvariables: "a: rand(10)+1;\nb: rand(10)+1;\nta1: a+b;",
    inputs: [defaultInput("ans1", "ta1")],
    prts: [defaultPrt("prt1")],
    deployedseeds: [],
    qtests: [],
    tags: [],
    extra: [],
  };
}
