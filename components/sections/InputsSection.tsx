"use client";

import { useState } from "react";
import { toMaxima } from "@/lib/maxima/print";
import { type StackQuestion, defaultInput, defaultPrt } from "@/lib/stack/model";
import type { SectionProps } from "../App";
import { MaximaEditor } from "../editors/CodeEditors";
import { IconDown, IconPlus, IconTrash, IconUp, IconX } from "../icons";
import { useDialogs } from "../Dialogs";
import { Field, SectionHead, Select } from "./BasicSections";
import ItemTabs, { useTabSelection } from "./ItemTabs";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "../I18nProvider";

/** Eingabetypen: [Typ, Schlüssel der Bezeichnung, Schlüssel der Beschreibung] */
export const INPUT_TYPES: [string, MessageKey, MessageKey][] = ([
  "algebraic", "numerical", "units", "matrix", "varmatrix", "dropdown", "radio", "checkbox",
  "boolean", "singlechar", "string", "textarea", "equiv", "notes", "geogebra", "parsons",
] as const).map((type) => [type, `sections.inputs.types.${type}.label`, `sections.inputs.types.${type}.desc`]);

/** Benennt eine Eingabe um und passt alle Verweise an. */
function renameInput(q: StackQuestion, from: string, to: string) {
  const re = new RegExp(`(?<![A-Za-z0-9_%])${from}(?![A-Za-z0-9_%])`, "g");
  const ph = new RegExp(`\\[\\[(input|validation):${from}\\]\\]`, "g");
  for (const k of ["questiontext", "specificfeedback", "generalfeedback"] as const) {
    q.texts[k].text = q.texts[k].text.replace(ph, `[[$1:${to}]]`).replace(new RegExp(`input-ref-${from}=`, "g"), `input-ref-${to}=`);
  }
  for (const p of q.prts) {
    p.feedbackvariables = p.feedbackvariables.replace(re, to);
    for (const n of p.nodes) {
      n.fields.sans = n.fields.sans.replace(re, to);
      n.fields.tans = n.fields.tans.replace(re, to);
    }
  }
  for (const t of q.qtests) for (const i of t.inputs) if (i.name === from) i.name = to;
}

function nextName(prefix: string, existing: string[]) {
  let i = 1;
  while (existing.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function NameField({ name, onRename, taken }: { name: string; onRename: (n: string) => void; taken: string[] }) {
  const t = useT();
  const [draft, setDraft] = useState(name);
  const [err, setErr] = useState("");
  const commit = () => {
    const n = draft.trim();
    if (n === name) return setErr("");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n)) return setErr(t("sections.inputs.nameInvalid"));
    if (taken.includes(n)) return setErr(t("sections.inputs.nameTaken"));
    setErr("");
    onRename(n);
  };
  return (
    <div>
      <input className="inp mono" style={{ width: 130 }} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()} title={t("sections.inputs.renameTitle")} />
      {err && <div className="hint" style={{ color: "var(--err)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

export default function InputsSection({ q, update, build }: SectionProps) {
  const t = useT();
  const dialogs = useDialogs();
  const typeLabel = (type: string) => {
    const it = INPUT_TYPES.find((x) => x[0] === type);
    return it ? t(it[1]) : type;
  };
  const names = q.inputs.map((i) => i.fields.name);
  const [open, setOpen] = useTabSelection(names);

  const add = (withPrt: boolean) => {
    const name = nextName("ans", names);
    const taName = `ta${name.slice(3)}`;
    update((x) => {
      x.inputs.push(defaultInput(name, withPrt ? taName : ""));
      x.texts.questiontext.text += `\n<p>[[input:${name}]] [[validation:${name}]]</p>`;
      if (withPrt) {
        const prt = nextName("prt", x.prts.map((p) => p.name));
        x.prts.push(defaultPrt(prt, name, taName));
        x.texts.questiontext.text += `\n<p>[[feedback:${prt}]]</p>`;
        if (!new RegExp(`(^|[^\\w])${taName}\\s*:`).test(x.questionvariables)) {
          const sep = !x.questionvariables || x.questionvariables.endsWith("\n") ? "" : "\n";
          x.questionvariables += `${sep}${taName}: 0; /* Musterlösung für ${name} */\n`; // Inhalt (ins XML), nicht übersetzen
        }
      }
    });
    setOpen([name]);
  };

  return (
    <div className="section">
      <SectionHead title={t("editor.nav.inputs")} desc={t("sections.inputs.desc")}>
        <button className="btn" onClick={() => add(false)}><IconPlus /> {t("sections.inputs.add")}</button>
        <button className="btn primary" onClick={() => add(true)}><IconPlus /> {t("sections.inputs.addWithPrt")}</button>
      </SectionHead>
      {q.inputs.length === 0 && <div className="empty">{t("sections.inputs.empty")}</div>}
      {q.inputs.length > 0 && (
        <ItemTabs label={t("editor.nav.inputs")} open={open} setOpen={setOpen}
          items={q.inputs.map((i) => ({
            name: i.fields.name,
            sub: typeLabel(i.fields.type),
            warn: !!build?.inputs[i.fields.name]?.tansError,
          }))} />
      )}
      {q.inputs.map((inp, idx) => {
        const f = inp.fields;
        if (!open.includes(f.name)) return null;
        const info = build?.inputs[f.name];
        const set = (k: string, v: string) => update((x) => { x.inputs[idx].fields[k] = v; });
        const flag = (k: string, label: string, title?: string) => (
          <label className="check" title={title}>
            <input type="checkbox" checked={f[k] === "1"} onChange={(e) => set(k, e.target.checked ? "1" : "0")} /> {label}
          </label>
        );
        const typeDescKey = INPUT_TYPES.find((x) => x[0] === f.type)?.[2];
        const typeDesc = typeDescKey ? t(typeDescKey) : undefined;
        const isChoice = ["dropdown", "radio", "checkbox"].includes(f.type);
        return (
          <div className="card prt-card" key={f.name}>
            <div className="card-head">
              <NameField key={f.name} name={f.name} taken={names.filter((n) => n !== f.name)}
                onRename={(n) => {
                  update((x) => { renameInput(x, f.name, n); x.inputs[idx].fields.name = n; });
                  setOpen(open.map((o) => (o === f.name ? n : o)));
                }} />
              <span className="chip">{typeLabel(f.type)}</span>
              {info?.tansError && <span className="chip err" title={info.tansError}>{t("sections.inputs.tansError")}</span>}
              <div className="right">
                {open.length > 1 && (
                  <button className="btn small ghost" title={t("sections.inputs.close")} aria-label={t("sections.closeNamed", { name: f.name })}
                    onClick={() => setOpen(open.filter((o) => o !== f.name))}><IconX /></button>
                )}
                <button className="btn small ghost" disabled={idx === 0} title={t("sections.moveUp")} onClick={() => update((x) => { const [it] = x.inputs.splice(idx, 1); x.inputs.splice(idx - 1, 0, it); })}><IconUp /></button>
                <button className="btn small ghost" disabled={idx === q.inputs.length - 1} title={t("sections.moveDown")} onClick={() => update((x) => { const [it] = x.inputs.splice(idx, 1); x.inputs.splice(idx + 1, 0, it); })}><IconDown /></button>
                <button className="btn small danger" title={t("sections.inputs.delete")} onClick={async () => {
                  const ok = await dialogs.confirm({ title: t("sections.inputs.deleteTitle"), message: t("sections.inputs.deleteMessage", { name: f.name }), confirmLabel: t("common.delete"), danger: true });
                  if (ok) update((x) => { const i = x.inputs.findIndex((it) => it.fields.name === f.name); if (i >= 0) x.inputs.splice(i, 1); });
                }}><IconTrash /></button>
              </div>
            </div>
            <div className="card-body">
              <div className="grid2">
                <Field label={t("sections.inputs.type")} hint={typeDesc}>
                  <Select value={f.type} onChange={(v) => set("type", v)} options={INPUT_TYPES.map(([v, l]) => [v, t(l)])} />
                </Field>
                <Field label={t("sections.inputs.boxSize")}>
                  <input className="inp" type="number" min="1" value={f.boxsize} onChange={(e) => set("boxsize", e.target.value)} />
                </Field>
              </div>
              <Field label={t("sections.inputs.tans")} hint={t(isChoice ? "sections.inputs.tansHintChoice" : "sections.inputs.tansHint")}>
                <MaximaEditor mode="expr" value={f.tans} onChange={(v) => set("tans", v)} placeholder="ta1" />
                {info?.tans && (
                  <div className="hint mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                    {t("sections.inputs.currentVariant", { value: toMaxima(info.tans).slice(0, 300) })}
                  </div>
                )}
                {info?.tansError && <div className="issue error" style={{ marginTop: 6 }}>{info.tansError}</div>}
              </Field>
              <div className="grid3">
                <Field label={t("sections.inputs.showValidation")}>
                  <Select value={f.showvalidation} onChange={(v) => set("showvalidation", v)}
                    options={[["1", t("sections.inputs.validationWithVars")], ["2", t("sections.inputs.validationNoVars")], ["3", t("sections.inputs.validationCompact")], ["0", t("common.no")]]} />
                </Field>
                <Field label={t("sections.inputs.insertStars")} hint={t("sections.inputs.insertStarsHint")}>
                  <Select value={f.insertstars} onChange={(v) => set("insertstars", v)}
                    options={[["0", t("common.no")], ["1", t("sections.inputs.starsImplicit")], ["2", t("sections.inputs.starsSpaces")], ["3", t("sections.inputs.starsBoth")], ["4", t("sections.inputs.starsSingleChar")], ["5", t("sections.inputs.starsSingleCharSpaces")]]} />
                </Field>
                <Field label={t("sections.inputs.syntaxAttribute")}>
                  <Select value={f.syntaxattribute} onChange={(v) => set("syntaxattribute", v)} options={[["0", t("sections.inputs.syntaxValue")], ["1", t("sections.inputs.syntaxPlaceholder")]]} />
                </Field>
              </div>
              <div className="grid3">
                <Field label={t("sections.inputs.syntaxHint")}><input className="inp mono" value={f.syntaxhint} onChange={(e) => set("syntaxhint", e.target.value)} /></Field>
                <Field label={t("sections.inputs.forbidWords")} hint={t("sections.inputs.commaSeparated")}><input className="inp mono" value={f.forbidwords} onChange={(e) => set("forbidwords", e.target.value)} /></Field>
                <Field label={t("sections.inputs.allowWords")}><input className="inp mono" value={f.allowwords} onChange={(e) => set("allowwords", e.target.value)} /></Field>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginBottom: 10 }}>
                {flag("forbidfloat", t("sections.inputs.forbidFloat"))}
                {flag("requirelowestterms", t("sections.inputs.lowestTerms"))}
                {flag("checkanswertype", t("sections.inputs.checkType"), t("sections.inputs.checkTypeTitle"))}
                {flag("mustverify", t("sections.inputs.mustVerify"))}
                {flag("strictsyntax", t("sections.inputs.strictSyntax"))}
              </div>
              <Field label={t("sections.inputs.extraOptions")} hint={t("sections.inputs.extraOptionsHint")}>
                <input className="inp mono" value={f.options} onChange={(e) => set("options", e.target.value)} />
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}
