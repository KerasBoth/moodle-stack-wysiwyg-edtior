"use client";

import { Fragment, useMemo, useState } from "react";
import { insertIntoLastEditor } from "@/lib/editor/context";
import { ANSWER_TESTS, answerTestText } from "@/lib/stack/answertests";
import {
  CASTEXT_BLOCKS, CATEGORIES, FUNCTION_DOCS, STACK_JXG_DOCS, casTextBlockText, categoryLabel, docText,
} from "@/lib/stack/docs";
import { useT } from "./I18nProvider";
import { IconX } from "./icons";

// Interne Kennungen der Filter neben den Funktionskategorien aus lib/stack/docs
const ALL = "all";
const TESTS = "tests";
const CASTEXT = "castext";
const JSXGRAPH = "jsxgraph";
const EXTRA = [TESTS, CASTEXT, JSXGRAPH];

// Code-Teile der CASText-Erläuterung (Platzhalter in reference.casTextHelp)
const CASTEXT_CODE: Record<string, string> = {
  at: "{@…@}",
  hash: "{#…#}",
  nosimp: "{@a*x,simp=false@}",
  input: "[[input:…]]",
  validation: "[[validation:…]]",
  feedback: "[[feedback:…]]",
};

/** Text mit {name}-Platzhaltern; die Platzhalter werden als <code> eingesetzt. */
function withCode(text: string) {
  return text.split(/\{(\w+)\}/).map((part, i) =>
    i % 2 ? <code key={i}>{CASTEXT_CODE[part] ?? part}</code> : <Fragment key={i}>{part}</Fragment>);
}

export default function Reference({ onClose, notify }: { onClose: () => void; notify: (m: string, err?: boolean) => void }) {
  const t = useT();
  const catLabel = (c: string) =>
    c === ALL ? t("editor.reference.all")
      : c === TESTS ? t("editor.reference.answerTests")
        : c === CASTEXT ? "CASText"
          : c === JSXGRAPH ? "JSXGraph"
            : categoryLabel(c as (typeof CATEGORIES)[number], t);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>(ALL);

  const norm = query.trim().toLowerCase();
  const match = (...s: string[]) => !norm || s.some((x) => x.toLowerCase().includes(norm));

  // Texte in der Sprache der Oberfläche (t wechselt mit der Sprache)
  const fnTexts = useMemo(() => FUNCTION_DOCS.map((f) => ({ f, x: docText(f, t) })), [t]);
  const jxgTexts = useMemo(() => STACK_JXG_DOCS.map((f) => ({ f, x: docText(f, t) })), [t]);
  const testTexts = useMemo(() => ANSWER_TESTS.map((a) => ({ a, x: answerTestText(a, t) })), [t]);
  const blockTexts = useMemo(() => CASTEXT_BLOCKS.map((b) => casTextBlockText(b, t)), [t]);
  const casTextHelp = t("reference.casTextHelp");

  const fns = fnTexts.filter(({ f, x }) => (cat === ALL || f.cat === cat) && match(f.name, f.sig, x.desc));

  const insert = (text: string) => {
    if (insertIntoLastEditor(text)) notify(t("editor.reference.inserted", { text }));
    else notify(t("editor.reference.clickEditorFirst"), true);
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={t("editor.reference.title")}>
        <div className="drawer-head">
          <h3>{t("editor.reference.title")}</h3>
          <span className="chip">{t("editor.reference.functions", { count: FUNCTION_DOCS.length })}</span>
          <button className="btn ghost small" style={{ marginLeft: "auto" }} onClick={onClose} aria-label={t("common.close")}><IconX /></button>
        </div>
        <div className="drawer-search">
          <input className="inp" autoFocus placeholder={t("editor.reference.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="cats">
            {[ALL, ...CATEGORIES, ...EXTRA].map((c) => (
              <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{catLabel(c)}</button>
            ))}
          </div>
        </div>
        <div className="drawer-list">
          {(cat === ALL || CATEGORIES.includes(cat as (typeof CATEGORIES)[number])) && fns.map(({ f, x }) => (
            <div className="ref" key={f.name}>
              <div className="ref-head">
                <span className="ref-sig">{f.sig}</span>
                <button className="btn small" onClick={() => insert(f.cat === "constants" ? f.name : `${f.name}()`)}>{t("editor.reference.insert")}</button>
              </div>
              <p>{x.desc}</p>
              <div className="ret"><b>{t("editor.reference.returns")}</b> {x.returns} <span className="chip" style={{ marginLeft: 6 }}>{x.cat}</span></div>
              {x.example && <pre>{x.example}</pre>}
            </div>
          ))}
          {(cat === ALL || cat === TESTS) && testTexts.filter(({ a, x }) => match(a.name, x.description)).map(({ a, x }) => (
            <div className="ref" key={a.name}>
              <div className="ref-head"><span className="ref-sig">{a.name}</span><span className="chip accent">{t("editor.reference.answerTest")}</span></div>
              <p>{x.description}</p>
              {x.optionHint !== undefined && <div className="ret"><b>{t("editor.reference.testOption")}</b> {x.optionHint}</div>}
            </div>
          ))}
          {(cat === ALL || cat === CASTEXT) && blockTexts.filter((b) => match(b.label, b.info)).map((b) => (
            <div className="ref" key={b.label}>
              <div className="ref-head">
                <span className="ref-sig">{b.label}</span>
                <button className="btn small" onClick={() => insert(b.insert.replace(/\$\{([^}]*)\}/g, "$1"))}>{t("editor.reference.insert")}</button>
              </div>
              <p>{b.info}</p>
            </div>
          ))}
          {(cat === ALL || cat === CASTEXT) && match("{@", "{#", "latex", casTextHelp) && (
            <div className="ref">
              <div className="ref-head"><span className="ref-sig">{"{@ausdruck@}  ·  {#ausdruck#}  ·  [[input:ans1]]"}</span></div>
              <p>{withCode(casTextHelp)}</p>
            </div>
          )}
          {(cat === ALL || cat === JSXGRAPH) && jxgTexts.filter(({ f, x }) => match(f.name, x.desc)).map(({ f, x }) => (
            <div className="ref" key={f.name}>
              <div className="ref-head">
                <span className="ref-sig">{f.sig}</span>
                <button className="btn small" onClick={() => insert(f.sig)}>{t("editor.reference.insert")}</button>
              </div>
              <p>{x.desc}</p>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
