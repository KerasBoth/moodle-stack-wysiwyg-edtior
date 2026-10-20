// Liest die Namen der STACK-Aufgaben aus einer Moodle-XML-Datei (für Listen und Dashboard).

import { parseQuiz } from "../stack/xml.ts";

export type XmlMeta = { ok: true; questions: string[] } | { ok: false; error: string };

export function describeXml(content: string): XmlMeta {
  try {
    const quiz = parseQuiz(content);
    const questions = quiz.items.flatMap((it) => (it.kind === "stack" ? [it.q.name || "(ohne Namen)"] : []));
    if (!questions.length) return { ok: false, error: "Die Datei enthält keine STACK-Aufgabe" };
    return { ok: true, questions };
  } catch (e) {
    return { ok: false, error: `Ungültiges XML: ${e instanceof Error ? e.message : String(e)}` };
  }
}
