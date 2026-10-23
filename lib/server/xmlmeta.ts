// Liest die Namen der STACK-Aufgaben aus einer Moodle-XML-Datei (für Listen und Dashboard).

import { type Msg, errorMsg } from "../i18n/index.ts";
import { parseQuiz } from "../stack/xml.ts";
import { UNNAMED_QUESTION } from "../filename.ts";

export type XmlMeta = { ok: true; questions: string[] } | { ok: false; error: Msg };

export function describeXml(content: string): XmlMeta {
  try {
    const quiz = parseQuiz(content);
    const questions = quiz.items.flatMap((it) => (it.kind === "stack" ? [it.q.name || UNNAMED_QUESTION] : []));
    if (!questions.length) return { ok: false, error: { key: "server.noStackQuestion" } };
    return { ok: true, questions };
  } catch (e) {
    // XmlError als Meldung: die API übersetzt sie in die Sprache des Anfragenden
    return { ok: false, error: { key: "server.invalidXml", params: { detail: errorMsg(e) } } };
  }
}
