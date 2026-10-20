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

export const INPUT_TYPES: [string, string, string][] = [
  ["algebraic", "Algebraische Eingabe", "Standard für Terme, Gleichungen, Ungleichungen, Listen …"],
  ["numerical", "Numerisch", "Nur Zahlen; mit Optionen wie floatnum, rationalnum"],
  ["units", "Einheiten", "Zahl mit Einheit, z. B. 9.81*m/s^2"],
  ["matrix", "Matrix", "Feste Größe, aus der Musterlösung übernommen"],
  ["varmatrix", "Matrix (variabel)", "Größe wird von Studierenden festgelegt"],
  ["dropdown", "Dropdown", "Musterlösung: [[wert, true/false, anzeige], …]"],
  ["radio", "Radio-Buttons", "Einfachauswahl, Musterlösung wie Dropdown"],
  ["checkbox", "Checkboxen", "Mehrfachauswahl, Musterlösung wie Dropdown"],
  ["boolean", "Wahr/Falsch", "Auswahl true/false"],
  ["singlechar", "Einzelnes Zeichen", "Ein Buchstabe"],
  ["string", "Zeichenkette", "Freier Text, wird als String verglichen"],
  ["textarea", "Textbereich", "Mehrere Zeilen, ergibt eine Liste"],
  ["equiv", "Äquivalenzumformung", "Zeilenweise Umformungen"],
  ["notes", "Notizen", "Wird nicht bewertet"],
  ["geogebra", "GeoGebra", "Eingabe über GeoGebra-Applet"],
  ["parsons", "Parsons (Beweise)", "Sortieraufgabe"],
];

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
  const [draft, setDraft] = useState(name);
  const [err, setErr] = useState("");
  const commit = () => {
    const n = draft.trim();
    if (n === name) return setErr("");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n)) return setErr("Nur Buchstaben, Ziffern, _ (Beginn mit Buchstabe)");
    if (taken.includes(n)) return setErr("Name bereits vergeben");
    setErr("");
    onRename(n);
  };
  return (
    <div>
      <input className="inp mono" style={{ width: 130 }} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()} title="Umbenennen passt Fragetext, PRTs und Tests an" />
      {err && <div className="hint" style={{ color: "var(--err)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

export default function InputsSection({ q, update, build }: SectionProps) {
  const dialogs = useDialogs();
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
          x.questionvariables += `${sep}${taName}: 0; /* Musterlösung für ${name} */\n`;
        }
      }
    });
    setOpen([name]);
  };

  return (
    <div className="section">
      <SectionHead title="Eingaben" desc="Antwortfelder der Studierenden. Platzhalter im Fragetext: [[input:name]] und [[validation:name]].">
        <button className="btn" onClick={() => add(false)}><IconPlus /> Eingabe</button>
        <button className="btn primary" onClick={() => add(true)}><IconPlus /> Eingabe + PRT</button>
      </SectionHead>
      {q.inputs.length === 0 && <div className="empty">Keine Eingaben vorhanden.</div>}
      {q.inputs.length > 0 && (
        <ItemTabs label="Eingaben" open={open} setOpen={setOpen}
          items={q.inputs.map((i) => ({
            name: i.fields.name,
            sub: INPUT_TYPES.find((t) => t[0] === i.fields.type)?.[1] ?? i.fields.type,
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
        const typeDesc = INPUT_TYPES.find((t) => t[0] === f.type)?.[2];
        const isChoice = ["dropdown", "radio", "checkbox"].includes(f.type);
        return (
          <div className="card prt-card" key={f.name}>
            <div className="card-head">
              <NameField key={f.name} name={f.name} taken={names.filter((n) => n !== f.name)}
                onRename={(n) => {
                  update((x) => { renameInput(x, f.name, n); x.inputs[idx].fields.name = n; });
                  setOpen(open.map((o) => (o === f.name ? n : o)));
                }} />
              <span className="chip">{INPUT_TYPES.find((t) => t[0] === f.type)?.[1] ?? f.type}</span>
              {info?.tansError && <span className="chip err" title={info.tansError}>Fehler in Musterlösung</span>}
              <div className="right">
                {open.length > 1 && (
                  <button className="btn small ghost" title="Diese Eingabe schließen" aria-label={`${f.name} schließen`}
                    onClick={() => setOpen(open.filter((o) => o !== f.name))}><IconX /></button>
                )}
                <button className="btn small ghost" disabled={idx === 0} title="Nach oben" onClick={() => update((x) => { const [it] = x.inputs.splice(idx, 1); x.inputs.splice(idx - 1, 0, it); })}><IconUp /></button>
                <button className="btn small ghost" disabled={idx === q.inputs.length - 1} title="Nach unten" onClick={() => update((x) => { const [it] = x.inputs.splice(idx, 1); x.inputs.splice(idx + 1, 0, it); })}><IconDown /></button>
                <button className="btn small danger" title="Eingabe löschen" onClick={async () => {
                  const ok = await dialogs.confirm({ title: "Eingabe löschen?", message: `Eingabe ${f.name} löschen? Platzhalter im Fragetext bleiben bestehen.`, confirmLabel: "Löschen", danger: true });
                  if (ok) update((x) => { const i = x.inputs.findIndex((it) => it.fields.name === f.name); if (i >= 0) x.inputs.splice(i, 1); });
                }}><IconTrash /></button>
              </div>
            </div>
            <div className="card-body">
              <div className="grid2">
                <Field label="Eingabetyp" hint={typeDesc}>
                  <Select value={f.type} onChange={(v) => set("type", v)} options={INPUT_TYPES.map(([v, l]) => [v, l])} />
                </Field>
                <Field label="Feldbreite">
                  <input className="inp" type="number" min="1" value={f.boxsize} onChange={(e) => set("boxsize", e.target.value)} />
                </Field>
              </div>
              <Field label="Musterlösung (tans)" hint={isChoice ? "Liste [[wert, true/false, anzeige], …]" : "Maxima-Ausdruck, z. B. ta1"}>
                <MaximaEditor mode="expr" value={f.tans} onChange={(v) => set("tans", v)} placeholder="ta1" />
                {info?.tans && (
                  <div className="hint mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                    aktuelle Variante: {toMaxima(info.tans).slice(0, 300)}
                  </div>
                )}
                {info?.tansError && <div className="issue error" style={{ marginTop: 6 }}>{info.tansError}</div>}
              </Field>
              <div className="grid3">
                <Field label="Validierung anzeigen">
                  <Select value={f.showvalidation} onChange={(v) => set("showvalidation", v)}
                    options={[["1", "Ja, mit Variablenliste"], ["2", "Ja, ohne Variablenliste"], ["3", "Ja, kompakt"], ["0", "Nein"]]} />
                </Field>
                <Field label="Sterne einfügen" hint="implizite Multiplikation">
                  <Select value={f.insertstars} onChange={(v) => set("insertstars", v)}
                    options={[["0", "Nein"], ["1", "Implizite Multiplikation"], ["2", "Leerzeichen = Mal"], ["3", "Beides"], ["4", "Einbuchst. Variablen"], ["5", "Einbuchst. + Leerzeichen"]]} />
                </Field>
                <Field label="Syntaxhinweis als">
                  <Select value={f.syntaxattribute} onChange={(v) => set("syntaxattribute", v)} options={[["0", "Wert"], ["1", "Platzhalter"]]} />
                </Field>
              </div>
              <div className="grid3">
                <Field label="Syntaxhinweis"><input className="inp mono" value={f.syntaxhint} onChange={(e) => set("syntaxhint", e.target.value)} /></Field>
                <Field label="Verbotene Wörter" hint="kommagetrennt"><input className="inp mono" value={f.forbidwords} onChange={(e) => set("forbidwords", e.target.value)} /></Field>
                <Field label="Erlaubte Wörter"><input className="inp mono" value={f.allowwords} onChange={(e) => set("allowwords", e.target.value)} /></Field>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginBottom: 10 }}>
                {flag("forbidfloat", "Gleitkommazahlen verbieten")}
                {flag("requirelowestterms", "Vollständig gekürzt")}
                {flag("checkanswertype", "Antworttyp prüfen", "Typ muss zur Musterlösung passen (z. B. Gleichung)")}
                {flag("mustverify", "Zweistufige Validierung")}
                {flag("strictsyntax", "Strikte Syntax")}
              </div>
              <Field label="Zusatzoptionen" hint="z. B. hideanswer, allowempty, nounits, floatnum">
                <input className="inp mono" value={f.options} onChange={(e) => set("options", e.target.value)} />
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}
