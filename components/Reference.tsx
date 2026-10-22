"use client";

import { useMemo, useState } from "react";
import { insertIntoLastEditor } from "@/lib/editor/context";
import { ANSWER_TESTS } from "@/lib/stack/answertests";
import { CASTEXT_BLOCKS, CATEGORIES, FUNCTION_DOCS, STACK_JXG_DOCS } from "@/lib/stack/docs";
import { useT } from "./I18nProvider";
import { IconX } from "./icons";

// Interne Kennungen der Filter (die Funktionskategorien aus lib/stack/docs kommen mit ihren Namen, Task 8)
const ALL = "Alle";
const TESTS = "Antworttests";
const EXTRA = [TESTS, "CASText", "JSXGraph"];

export default function Reference({ onClose, notify }: { onClose: () => void; notify: (m: string, err?: boolean) => void }) {
  const t = useT();
  const catLabel = (c: string) => (c === ALL ? t("editor.reference.all") : c === TESTS ? t("editor.reference.answerTests") : c);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>(ALL);

  const norm = query.trim().toLowerCase();
  const match = (...s: string[]) => !norm || s.some((x) => x.toLowerCase().includes(norm));

  const fns = useMemo(
    () => FUNCTION_DOCS.filter((f) => (cat === ALL || f.cat === cat) && match(f.name, f.sig, f.desc)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cat, norm],
  );

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
          {(cat === ALL || CATEGORIES.includes(cat as (typeof CATEGORIES)[number])) && fns.map((f) => (
            <div className="ref" key={f.name}>
              <div className="ref-head">
                <span className="ref-sig">{f.sig}</span>
                <button className="btn small" onClick={() => insert(f.cat === "Konstanten" ? f.name : `${f.name}()`)}>{t("editor.reference.insert")}</button>
              </div>
              <p>{f.desc}</p>
              <div className="ret"><b>{t("editor.reference.returns")}</b> {f.returns} <span className="chip" style={{ marginLeft: 6 }}>{f.cat}</span></div>
              {f.example && <pre>{f.example}</pre>}
            </div>
          ))}
          {(cat === ALL || cat === TESTS) && ANSWER_TESTS.filter((a) => match(a.name, a.description)).map((a) => (
            <div className="ref" key={a.name}>
              <div className="ref-head"><span className="ref-sig">{a.name}</span><span className="chip accent">{t("editor.reference.answerTest")}</span></div>
              <p>{a.description}</p>
              {a.needsOptions && <div className="ret"><b>{t("editor.reference.testOption")}</b> {a.optionHint}</div>}
            </div>
          ))}
          {(cat === ALL || cat === "CASText") && CASTEXT_BLOCKS.filter((b) => match(b.label, b.info)).map((b) => (
            <div className="ref" key={b.label}>
              <div className="ref-head">
                <span className="ref-sig">{b.label}</span>
                <button className="btn small" onClick={() => insert(b.insert.replace(/\$\{([^}]*)\}/g, "$1"))}>{t("editor.reference.insert")}</button>
              </div>
              <p>{b.info}</p>
            </div>
          ))}
          {(cat === ALL || cat === "CASText") && match("{@", "{#", "latex", "platzhalter") && (
            <div className="ref">
              <div className="ref-head"><span className="ref-sig">{"{@ausdruck@}  ·  {#ausdruck#}  ·  [[input:ans1]]"}</span></div>
              <p>
                <code>{"{@…@}"}</code> setzt den Wert als LaTeX ein (außerhalb von Formeln automatisch mit \( \)),
                <code>{" {#…#}"}</code> als reinen Maxima-Text (z. B. für JavaScript). Mit <code>{"{@a*x,simp=false@}"}</code> wird nicht vereinfacht.
                Platzhalter <code>[[input:…]]</code>, <code>[[validation:…]]</code> und <code>[[feedback:…]]</code> binden Eingaben und Rückmeldungen ein.
              </p>
            </div>
          )}
          {(cat === ALL || cat === "JSXGraph") && STACK_JXG_DOCS.filter((f) => match(f.name, f.desc)).map((f) => (
            <div className="ref" key={f.name}>
              <div className="ref-head">
                <span className="ref-sig">{f.sig}</span>
                <button className="btn small" onClick={() => insert(f.sig)}>{t("editor.reference.insert")}</button>
              </div>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
