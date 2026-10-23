// Einlesen und Schreiben von Moodle-XML mit STACK-Aufgaben.
// Eigener kleiner XML-Parser, damit unbekannte Elemente byte-genau erhalten bleiben
// und der Code sowohl im Browser als auch in Node (Tests, API) läuft.

import {
  type FText, type Prt, type PrtNode, type QTest, type Quiz, type QuizItem, type StackInput, type StackQuestion,
  INPUT_FIELDS, NODE_BRANCH_FIELDS, NODE_FIELDS_BEFORE, SCALAR_FIELDS, TEXT_FIELDS, newUid,
} from "./model.ts";
import { LocalizedError, type MessageKey, type Msg, type Params } from "../i18n/index.ts";

// ---- Mini-XML-Parser ---------------------------------------------------------

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Textinhalt (inkl. CDATA), direkt unter diesem Element. */
  text: string;
  /** Kommentare unmittelbar vor diesem Element. */
  comments: string[];
  start: number;
  end: number;
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    switch (e) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return '"';
      case "apos": return "'";
    }
    return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

/** Fehler beim Einlesen; `.msg` für die Anzeige, `.message` bleibt deutsch. Ändert nichts am erzeugten XML. */
export class XmlError extends LocalizedError {
  constructor(key: MessageKey, params?: Params) {
    super(key, params);
    this.name = "XmlError";
  }
}

export function parseXml(src: string): XNode {
  let i = 0;
  const n = src.length;
  const root: XNode = { name: "#document", attrs: {}, children: [], text: "", comments: [], start: 0, end: n };
  const stack: XNode[] = [root];
  let pendingComments: string[] = [];

  while (i < n) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(src.slice(i, lt));
    i = lt;
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i);
      if (end < 0) throw new XmlError("lib.xml.commentNotClosed");
      pendingComments.push(src.slice(i + 4, end).trim());
      i = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i);
      if (end < 0) throw new XmlError("lib.xml.cdataNotClosed");
      top.text += src.slice(i + 9, end);
      i = end + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (src.startsWith("<!", i)) {
      const end = src.indexOf(">", i);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (src.startsWith("</", i)) {
      const end = src.indexOf(">", i);
      const name = src.slice(i + 2, end).trim();
      const node = stack.pop();
      if (!node || node.name !== name) {
        throw new XmlError("lib.xml.unexpectedClose", { name, open: node?.name ?? "-", pos: i });
      }
      node.end = end + 1;
      i = end + 1;
      continue;
    }
    // Start-Tag
    const m = /^<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(src.slice(i, i + 4096));
    if (!m) throw new XmlError("lib.xml.invalidTag", { pos: i });
    const attrs: Record<string, string> = {};
    for (const am of m[2].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[am[1]] = decodeEntities(am[2] ?? am[3] ?? "");
    }
    const node: XNode = { name: m[1], attrs, children: [], text: "", comments: pendingComments, start: i, end: i + m[0].length };
    pendingComments = [];
    top.children.push(node);
    i += m[0].length;
    if (!m[3]) stack.push(node);
  }
  if (stack.length > 1) throw new XmlError("lib.xml.notClosed", { name: stack[stack.length - 1].name });
  return root;
}

const child = (n: XNode, name: string) => n.children.find((c) => c.name === name);
const childText = (n: XNode, name: string): string => {
  const c = child(n, name);
  if (!c) return "";
  const t = child(c, "text");
  return t ? t.text : c.text.trim();
};
const fText = (n: XNode, name: string, def = "html"): FText => {
  const c = child(n, name);
  if (!c) return { format: def, text: "" };
  return { format: c.attrs.format ?? def, text: child(c, "text")?.text ?? "" };
};

// ---- XML -> Modell -----------------------------------------------------------

const KNOWN_QUESTION_CHILDREN = new Set<string>([
  "name", ...TEXT_FIELDS, ...SCALAR_FIELDS, "stackversion", "questionvariables",
  "input", "prt", "deployedseed", "qtest", "tags",
]);

function parseInput(n: XNode): StackInput {
  const fields: Record<string, string> = {};
  for (const c of n.children) fields[c.name] = c.text;
  for (const f of INPUT_FIELDS) fields[f] ??= "";
  return { fields };
}

function parseNode(n: XNode): PrtNode {
  const fields: Record<string, string> = {};
  for (const c of n.children) {
    if (c.name === "truefeedback" || c.name === "falsefeedback") continue;
    fields[c.name] = c.text;
  }
  return { fields, truefeedback: fText(n, "truefeedback"), falsefeedback: fText(n, "falsefeedback") };
}

function parsePrt(n: XNode, src: string): Prt {
  const known = new Set(["name", "value", "autosimplify", "feedbackstyle", "feedbackvariables", "node"]);
  return {
    name: childText(n, "name"),
    value: childText(n, "value"),
    autosimplify: childText(n, "autosimplify") || "1",
    feedbackstyle: childText(n, "feedbackstyle") || "1",
    feedbackvariables: childText(n, "feedbackvariables"),
    nodes: n.children.filter((c) => c.name === "node").map(parseNode),
    extra: n.children.filter((c) => !known.has(c.name)).map((c) => src.slice(c.start, c.end)),
  };
}

function parseQTest(n: XNode): QTest {
  return {
    testcase: childText(n, "testcase"),
    description: childText(n, "description"),
    inputs: n.children.filter((c) => c.name === "testinput").map((c) => ({
      name: childText(c, "name"),
      value: childText(c, "value"),
    })),
    expected: n.children.filter((c) => c.name === "expected").map((c) => ({
      name: childText(c, "name"),
      expectedscore: childText(c, "expectedscore"),
      expectedpenalty: childText(c, "expectedpenalty"),
      expectedanswernote: childText(c, "expectedanswernote"),
    })),
  };
}

function parseStackQuestion(n: XNode, src: string): StackQuestion {
  const texts = {} as StackQuestion["texts"];
  for (const f of TEXT_FIELDS) texts[f] = fText(n, f, f === "questionnote" ? "moodle_auto_format" : "html");
  const scalars: Record<string, string> = {};
  for (const f of SCALAR_FIELDS) {
    const c = child(n, f);
    scalars[f] = c ? c.text.trim() : "";
  }
  const tagsNode = child(n, "tags");
  return {
    uid: newUid(),
    comment: n.comments.join(" "),
    name: childText(n, "name"),
    texts,
    scalars,
    stackversion: childText(n, "stackversion"),
    questionvariables: childText(n, "questionvariables"),
    inputs: n.children.filter((c) => c.name === "input").map(parseInput),
    prts: n.children.filter((c) => c.name === "prt").map((c) => parsePrt(c, src)),
    deployedseeds: n.children.filter((c) => c.name === "deployedseed").map((c) => c.text.trim()),
    qtests: n.children.filter((c) => c.name === "qtest").map(parseQTest),
    tags: tagsNode ? tagsNode.children.filter((c) => c.name === "tag").map((c) => child(c, "text")?.text ?? c.text.trim()) : [],
    extra: n.children.filter((c) => !KNOWN_QUESTION_CHILDREN.has(c.name)).map((c) => src.slice(c.start, c.end)),
  };
}

export function parseQuiz(src: string): Quiz {
  const doc = parseXml(src);
  const quiz = child(doc, "quiz");
  if (!quiz) {
    const q = child(doc, "question");
    if (q) return { items: [itemFrom(q, src)] };
    throw new XmlError("lib.xml.noQuiz");
  }
  return { items: quiz.children.filter((c) => c.name === "question").map((q) => itemFrom(q, src)) };
}

function itemFrom(q: XNode, src: string): QuizItem {
  if (q.attrs.type === "stack") return { kind: "stack", q: parseStackQuestion(q, src) };
  // Beschriftung nur für die Anzeige; ins XML geht unverändert `xml`
  const label: Msg = q.attrs.type === "category"
    ? { key: "lib.xml.categoryLabel", params: { name: childText(q, "category") } }
    : { key: "lib.xml.otherLabel", params: { type: q.attrs.type ?? "?", name: childText(q, "name") } };
  return { kind: "raw", xml: src.slice(q.start, q.end), label, comment: q.comments.join(" ") };
}

// ---- Modell -> XML -----------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}
/** Text als CDATA, falls nötig (wie Moodle). */
function cdata(s: string): string {
  if (!/[<>&]/.test(s)) return s;
  return `<![CDATA[${s.split("]]>").join("]]]]><![CDATA[>")}]]>`;
}

function textEl(name: string, value: string, indent: string): string {
  return `${indent}<${name}>\n${indent}  <text>${cdata(value)}</text>\n${indent}</${name}>\n`;
}
function fTextEl(name: string, f: FText, indent: string): string {
  return `${indent}<${name} format="${escAttr(f.format)}">\n${indent}  <text>${cdata(f.text)}</text>\n${indent}</${name}>\n`;
}
function scalarEl(name: string, value: string, indent: string): string {
  return `${indent}<${name}>${esc(value)}</${name}>\n`;
}

function writeInput(inp: StackInput): string {
  const ind = "      ";
  let s = "    <input>\n";
  const keys = [...INPUT_FIELDS, ...Object.keys(inp.fields).filter((k) => !INPUT_FIELDS.includes(k))];
  for (const k of keys) s += scalarEl(k, inp.fields[k] ?? "", ind);
  return s + "    </input>\n";
}

function writeNode(node: PrtNode): string {
  const ind = "        ";
  let s = "      <node>\n";
  const f = node.fields;
  for (const k of NODE_FIELDS_BEFORE) s += scalarEl(k, f[k] ?? "", ind);
  for (const branch of ["true", "false"] as const) {
    for (const k of NODE_BRANCH_FIELDS) s += scalarEl(branch + k, f[branch + k] ?? "", ind);
    s += fTextEl(`${branch}feedback`, branch === "true" ? node.truefeedback : node.falsefeedback, ind);
  }
  const known = new Set([...NODE_FIELDS_BEFORE, ...NODE_BRANCH_FIELDS.flatMap((k) => [`true${k}`, `false${k}`])]);
  for (const k of Object.keys(f)) if (!known.has(k)) s += scalarEl(k, f[k], ind);
  return s + "      </node>\n";
}

function writePrt(p: Prt): string {
  const ind = "      ";
  let s = "    <prt>\n";
  s += scalarEl("name", p.name, ind);
  s += scalarEl("value", p.value, ind);
  s += scalarEl("autosimplify", p.autosimplify, ind);
  s += scalarEl("feedbackstyle", p.feedbackstyle, ind);
  s += textEl("feedbackvariables", p.feedbackvariables, ind);
  for (const n of p.nodes) s += writeNode(n);
  for (const x of p.extra) s += `${ind}${x}\n`;
  return s + "    </prt>\n";
}

function writeQTest(t: QTest): string {
  let s = "    <qtest>\n";
  s += scalarEl("testcase", t.testcase, "      ");
  s += scalarEl("description", t.description, "      ");
  for (const i of t.inputs) {
    s += "      <testinput>\n";
    s += scalarEl("name", i.name, "        ");
    s += scalarEl("value", i.value, "        ");
    s += "      </testinput>\n";
  }
  for (const e of t.expected) {
    s += "      <expected>\n";
    s += scalarEl("name", e.name, "        ");
    s += scalarEl("expectedscore", e.expectedscore, "        ");
    s += scalarEl("expectedpenalty", e.expectedpenalty, "        ");
    s += scalarEl("expectedanswernote", e.expectedanswernote, "        ");
    s += "      </expected>\n";
  }
  return s + "    </qtest>\n";
}

export function writeQuestion(q: StackQuestion): string {
  const ind = "    ";
  let s = "";
  if (q.comment) s += `<!-- ${q.comment.replace(/--/g, "- -")} -->\n`;
  s += `  <question type="stack">\n`;
  s += textEl("name", q.name, ind);
  s += fTextEl("questiontext", q.texts.questiontext, ind);
  s += fTextEl("generalfeedback", q.texts.generalfeedback, ind);
  s += scalarEl("defaultgrade", q.scalars.defaultgrade, ind);
  s += scalarEl("penalty", q.scalars.penalty, ind);
  s += scalarEl("hidden", q.scalars.hidden, ind);
  s += scalarEl("idnumber", q.scalars.idnumber, ind);
  s += textEl("stackversion", q.stackversion, ind);
  s += textEl("questionvariables", q.questionvariables, ind);
  s += fTextEl("specificfeedback", q.texts.specificfeedback, ind);
  s += fTextEl("questionnote", q.texts.questionnote, ind);
  s += fTextEl("questiondescription", q.texts.questiondescription, ind);
  for (const k of ["questionsimplify", "assumepositive", "assumereal"]) s += scalarEl(k, q.scalars[k], ind);
  s += fTextEl("prtcorrect", q.texts.prtcorrect, ind);
  s += fTextEl("prtpartiallycorrect", q.texts.prtpartiallycorrect, ind);
  s += fTextEl("prtincorrect", q.texts.prtincorrect, ind);
  for (const k of [
    "decimals", "scientificnotation", "multiplicationsign", "sqrtsign", "complexno", "inversetrig",
    "logicsymbol", "matrixparens", "isbroken", "variantsselectionseed",
  ]) s += scalarEl(k, q.scalars[k] ?? "", ind);
  for (const i of q.inputs) s += writeInput(i);
  for (const p of q.prts) s += writePrt(p);
  for (const d of q.deployedseeds) s += scalarEl("deployedseed", d, ind);
  for (const t of q.qtests) s += writeQTest(t);
  if (q.tags.length) {
    s += `${ind}<tags>\n`;
    for (const t of q.tags) s += `${ind}  <tag><text>${cdata(t)}</text></tag>\n`;
    s += `${ind}</tags>\n`;
  }
  for (const x of q.extra) s += `${ind}${x}\n`;
  s += "  </question>\n";
  return s;
}

export function writeQuiz(quiz: Quiz): string {
  let s = '<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n';
  for (const it of quiz.items) {
    if (it.kind === "stack") s += writeQuestion(it.q);
    else {
      if (it.comment) s += `<!-- ${it.comment} -->\n`;
      s += `  ${it.xml}\n`;
    }
    s += "\n";
  }
  return s + "</quiz>\n";
}
