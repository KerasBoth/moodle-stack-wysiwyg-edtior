"use client";

import { useState } from "react";
import { ANSWER_TESTS } from "@/lib/stack/answertests";
import { type Prt, type StackQuestion, defaultNode, defaultPrt } from "@/lib/stack/model";
import { usedInputs } from "@/lib/stack/preview";
import type { SectionProps } from "../App";
import { CasTextEditor, MaximaEditor } from "../editors/CodeEditors";
import { IconDown, IconPencil, IconPlus, IconTrash, IconTree, IconX } from "../icons";
import { useDialogs } from "../Dialogs";
import { Field, SectionHead, Select } from "./BasicSections";
import { PrtOverview, PrtTree } from "./PrtDiagram";
import ItemTabs, { useTabSelection } from "./ItemTabs";
import ValueField, { type ValueGroup, assignedNames } from "../editors/ValueField";
import { toMaxima } from "@/lib/maxima/print";

function renamePrt(q: StackQuestion, from: string, to: string) {
  for (const k of ["questiontext", "specificfeedback", "generalfeedback"] as const) {
    q.texts[k].text = q.texts[k].text.split(`[[feedback:${from}]]`).join(`[[feedback:${to}]]`);
  }
  for (const t of q.qtests) for (const e of t.expected) if (e.name === from) e.name = to;
}

function nodeLabel(name: string) {
  return `Knoten ${Number(name) + 1}`;
}

function PrtName({ name, taken, onRename }: { name: string; taken: string[]; onRename: (n: string) => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const n = draft.trim();
    if (n === name) return;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n) || taken.includes(n)) { setDraft(name); return; }
    onRename(n);
  };
  return (
    <input className="inp mono" style={{ width: 120, fontWeight: 700 }} value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} title="Umbenennen passt [[feedback:…]] und Tests an" />
  );
}

/** Zum Knoten-Editor springen (Karte ggf. vorher aufklappen). */
function scrollToNode(prt: string, index: number) {
  window.setTimeout(() => {
    const el = document.getElementById(`node-${prt}-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.classList.add("flash");
    window.setTimeout(() => el?.classList.remove("flash"), 1200);
  }, 30);
}

export default function PrtsSection({ q, update, build }: SectionProps) {
  const dialogs = useDialogs();
  const [view, setView] = useState<"overview" | "edit">("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const names = q.prts.map((p) => p.name);
  // nur vorhandene PRTs; ohne Auswahl ist der erste geöffnet
  const [open, setOpen] = useTabSelection(names);
  const selPrt = q.prts.find((p) => p.name === selected) ?? q.prts[0];
  const openNode = (prt: string, index: number) => {
    setView("edit");
    setOpen(open.includes(prt) ? open : [prt]);
    scrollToNode(prt, index);
  };

  const addPrt = () => {
    let i = 1;
    while (names.includes(`prt${i}`)) i++;
    const name = `prt${i}`;
    const firstInput = q.inputs[0]?.fields.name ?? "ans1";
    update((x) => {
      x.prts.push(defaultPrt(name, firstInput, q.inputs[0]?.fields.tans || "ta1"));
      x.texts.questiontext.text += `\n<p>[[feedback:${name}]]</p>`;
    });
    setView("edit");
    setOpen([name]);
  };

  return (
    <div className="section">
      <SectionHead title="Rückmeldebäume (PRTs)" desc="Jeder PRT vergleicht Antworten über Knoten mit Antworttests und vergibt Punkte und Feedback.">
        <div className="mode-switch small" role="radiogroup" aria-label="Ansicht">
          <button role="radio" aria-checked={view === "overview"} className={view === "overview" ? "on" : ""} onClick={() => setView("overview")}><IconTree /> Übersicht</button>
          <button role="radio" aria-checked={view === "edit"} className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}><IconPencil /> Bearbeiten</button>
        </div>
        <button className="btn primary" onClick={addPrt}><IconPlus /> PRT</button>
      </SectionHead>
      {q.prts.length === 0 && <div className="empty">Keine Rückmeldebäume vorhanden.</div>}
      {view === "overview" && (
        <>
          <div className="card">
            <div className="card-head">
              <h3>Welche Eingabe wird in welchem Baum ausgewertet?</h3>
              <span className="sub">Reihenfolge wie im Fragetext. Fahre über einen Eintrag, um seine Verbindungen zu sehen.</span>
            </div>
            <div className="card-body"><PrtOverview q={q} selected={selPrt?.name ?? null} onSelect={setSelected} /></div>
          </div>
          {selPrt && (
            <div className="card">
              <div className="card-head">
                <h3>Baum <span className="tok tok-feedback">{selPrt.name}</span></h3>
                <span className="sub">Klick auf einen Knoten öffnet seine Einstellungen.</span>
                <div className="right">
                  <button className="btn small" onClick={() => openNode(selPrt.name, 0)}><IconPencil /> Bearbeiten</button>
                </div>
              </div>
              <div className="card-body"><PrtTree prt={selPrt} onNode={(i) => openNode(selPrt.name, i)} /></div>
            </div>
          )}
        </>
      )}
      {view === "edit" && q.prts.length > 0 && <ItemTabs label="Rückmeldebäume" open={open} setOpen={setOpen}
        items={q.prts.map((p) => { const used = usedInputs(p, q); return { name: p.name, sub: used.length ? used.join(", ") : "keine Eingabe", warn: !used.length }; })} />}
      {view === "edit" && q.prts.map((p, pi) => {
        if (!open.includes(p.name)) return null;
        const setP = (fn: (x: Prt) => void) => update((x) => fn(x.prts[pi]));
        const used = usedInputs(p, q);
        // Auswahl für SAns/TAns: definierte Eingaben und Variablen, Freitext bleibt möglich
        const feedbackVars: ValueGroup = { label: "Feedback-Variablen dieses PRT", options: assignedNames(p.feedbackvariables).map((v) => ({ value: v })) };
        const sansGroups: ValueGroup[] = [
          { label: "Eingaben", options: [...q.inputs].sort((a, b) => a.fields.name.localeCompare(b.fields.name, undefined, { numeric: true })).map((i) => ({ value: i.fields.name, detail: `${i.fields.type}${i.fields.tans ? `, Musterlösung ${i.fields.tans}` : ""}` })) },
          feedbackVars,
        ];
        const tansGroups: ValueGroup[] = [
          { label: "Musterlösungen der Eingaben", options: [...new Set(q.inputs.map((i) => i.fields.tans).filter(Boolean))].map((t) => ({
            value: t, detail: q.inputs.filter((i) => i.fields.tans === t).map((i) => i.fields.name).join(", "),
          })) },
          { label: "Fragevariablen", options: (build?.vars.variables ?? assignedNames(q.questionvariables).map((name) => ({ name, value: null })))
            .map((v) => ({ value: v.name, detail: v.value ? `= ${toMaxima(v.value)}` : undefined })) },
          feedbackVars,
        ];
        return (
          <div className="card prt-card" key={p.name}>
            <div className="card-head">
              <PrtName key={p.name} name={p.name} taken={names.filter((n) => n !== p.name)}
                onRename={(n) => {
                  update((x) => { renamePrt(x, p.name, n); x.prts[pi].name = n; });
                  setOpen(open.map((o) => (o === p.name ? n : o)));
                }} />
              <span className="sub">{p.nodes.length} Knoten, Eingaben: {used.length ? used.join(", ") : <span style={{ color: "var(--warn)" }}>keine</span>}</span>
              <div className="right">
                {open.length > 1 && (
                  <button className="btn small ghost" title="Diesen PRT schließen" aria-label={`${p.name} schließen`}
                    onClick={() => setOpen(open.filter((o) => o !== p.name))}><IconX /></button>
                )}
                <button className="btn small danger" title="PRT löschen" onClick={async () => {
                  const ok = await dialogs.confirm({ title: "PRT löschen?", message: `PRT ${p.name} löschen?`, confirmLabel: "Löschen", danger: true });
                  if (ok) update((x) => { x.prts.splice(pi, 1); });
                }}><IconTrash /></button>
              </div>
            </div>
            <div className="card-body">
              <div className="grid3">
                <Field label="Gewichtung" hint="Anteil an der Gesamtpunktzahl">
                  <input className="inp" type="number" min="0" step="0.5" value={p.value} onChange={(e) => setP((x) => { x.value = e.target.value; })} />
                </Field>
                <Field label="Automatisch vereinfachen">
                  <Select value={p.autosimplify} onChange={(v) => setP((x) => { x.autosimplify = v; })} options={[["1", "Ja"], ["0", "Nein"]]} />
                </Field>
                <Field label="Feedback-Stil">
                  <Select value={p.feedbackstyle} onChange={(v) => setP((x) => { x.feedbackstyle = v; })}
                    options={[["1", "Standard"], ["0", "Formativ (ohne Wertung)"], ["2", "Kompakt"], ["3", "Nur Symbol"]]} />
                </Field>
              </div>
              <Field label="Feedback-Variablen" hint="Maxima, wird vor den Knoten ausgewertet; Schülerantworten verfügbar">
                <MaximaEditor value={p.feedbackvariables} onChange={(v) => setP((x) => { x.feedbackvariables = v; })} minHeight="56px" placeholder="/* z. B. sa: expand(ans1); */" />
              </Field>
              <div className="field">
                <label>Ablauf</label>
                <PrtTree prt={p} onNode={(i) => scrollToNode(p.name, i)} />
              </div>
              {p.nodes.map((n, ni) => {
                const nf = n.fields;
                const setN = (k: string, v: string) => setP((x) => { x.nodes[ni].fields[k] = v; });
                const at = ANSWER_TESTS.find((t) => t.name === nf.answertest);
                const others: [string, string][] = [["-1", "Ende"], ...p.nodes.filter((_, j) => j !== ni).map((o) => [o.fields.name, nodeLabel(o.fields.name)] as [string, string])];
                return (
                  <div className="node" key={ni} id={`node-${p.name}-${ni}`}>
                    <div className="node-head">
                      <span className="node-num">{Number(nf.name) + 1}</span>
                      <input className="inp" style={{ maxWidth: 360 }} placeholder="Beschreibung (optional)" value={nf.description} onChange={(e) => setN("description", e.target.value)} />
                      <label className="check" title="Automatisches Feedback des Antworttests unterdrücken">
                        <input type="checkbox" checked={nf.quiet === "1"} onChange={(e) => setN("quiet", e.target.checked ? "1" : "0")} /> still
                      </label>
                      <div className="right" style={{ marginLeft: "auto" }}>
                        <button className="btn small danger" disabled={p.nodes.length < 2} title="Knoten löschen" onClick={() => setP((x) => {
                          const removed = x.nodes[ni].fields.name;
                          x.nodes.splice(ni, 1);
                          for (const o of x.nodes) {
                            if (o.fields.truenextnode === removed) o.fields.truenextnode = "-1";
                            if (o.fields.falsenextnode === removed) o.fields.falsenextnode = "-1";
                          }
                        })}><IconTrash /></button>
                      </div>
                    </div>
                    <div className="node-body">
                      <div className="node-compare">
                        <Field label="Schülerantwort (SAns)">
                          <ValueField label="Schülerantwort" value={nf.sans} onChange={(v) => setN("sans", v)} placeholder="ans1" groups={sansGroups} />
                        </Field>
                        <Field label="Antworttest">
                          <Select value={nf.answertest} onChange={(v) => setN("answertest", v)} options={ANSWER_TESTS.map((t) => [t.name, t.name])} />
                        </Field>
                        <Field label="Musterlösung (TAns)">
                          <ValueField label="Musterlösung" align="right" value={nf.tans} onChange={(v) => setN("tans", v)} placeholder="ta1" groups={tansGroups} />
                        </Field>
                      </div>
                      {at && <div className="at-desc" style={{ marginTop: -6, marginBottom: 10 }}>{at.description}</div>}
                      {(at?.needsOptions || nf.testoptions) && (
                        <Field label="Testoptionen" hint={at?.optionHint}>
                          <MaximaEditor mode="expr" value={nf.testoptions} onChange={(v) => setN("testoptions", v)} placeholder={at?.optionHint} />
                        </Field>
                      )}
                      <div className="branches">
                        {(["true", "false"] as const).map((b) => (
                          <div key={b} className={`branch ${b === "true" ? "t" : "f"}`}>
                            <h4>{b === "true" ? "✔ wahr" : "✘ falsch"}</h4>
                            <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 1fr", gap: "0 10px" }}>
                              <Field label="Modus">
                                <Select value={nf[`${b}scoremode`]} onChange={(v) => setN(`${b}scoremode`, v)} options={[["=", "="], ["+", "+"], ["-", "−"]]} />
                              </Field>
                              <Field label="Punkte">
                                <input className="inp" value={nf[`${b}score`]} onChange={(e) => setN(`${b}score`, e.target.value)} />
                              </Field>
                              <Field label="Strafe">
                                <input className="inp" placeholder="Standard" value={nf[`${b}penalty`]} onChange={(e) => setN(`${b}penalty`, e.target.value)} />
                              </Field>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 0.8fr) 1.2fr", gap: "0 10px" }}>
                              <Field label="Weiter zu">
                                <Select value={nf[`${b}nextnode`]} onChange={(v) => setN(`${b}nextnode`, v)} options={others} />
                              </Field>
                              <Field label="Antwortnotiz">
                                <input className="inp mono" value={nf[`${b}answernote`]} onChange={(e) => setN(`${b}answernote`, e.target.value)} />
                              </Field>
                            </div>
                            <Field label="Feedback">
                              <CasTextEditor compact minHeight="44px" value={(b === "true" ? n.truefeedback : n.falsefeedback).text}
                                onChange={(v) => setP((x) => { (b === "true" ? x.nodes[ni].truefeedback : x.nodes[ni].falsefeedback).text = v; })} />
                            </Field>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button className="btn" onClick={() => setP((x) => {
                const next = Math.max(-1, ...x.nodes.map((o) => Number(o.fields.name))) + 1;
                const prev = x.nodes[x.nodes.length - 1];
                x.nodes.push(defaultNode(next, x.name, prev?.fields.sans, prev?.fields.tans));
              })}><IconPlus /> Knoten</button>
              <span className="hint" style={{ marginLeft: 10, fontSize: 12, color: "var(--ink-3)" }}>
                <IconDown style={{ width: 12, verticalAlign: -2 }} /> Verknüpfung über „Weiter zu“
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
