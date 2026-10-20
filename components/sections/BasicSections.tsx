"use client";

import type { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState } from "react";
import { toMaxima } from "@/lib/maxima/print";
import { CASTEXT_BLOCKS } from "@/lib/stack/docs";
import type { TextField } from "@/lib/stack/model";
import type { SectionProps } from "../App";
import { CasTextEditor, MaximaEditor, XmlViewer, insertSnippet } from "../editors/CodeEditors";
import VisualEditor from "../editors/VisualEditor";
import { IconBraces, IconChart, IconCode, IconCopy, IconDownload, IconList, IconPara, IconText, IconX } from "../icons";
import JsxBuilder, { type JsxApplyResult } from "../editors/JsxBuilder";
import { type JsxModel, findJsxBlock, generateJsx } from "@/lib/stack/jsxbuilder";
import { parseJsxBlock } from "@/lib/stack/jsxparse";
import { defaultInput } from "@/lib/stack/model";
import { EditorFooter, type InsertTokens, type PlaceholderInfo, PlaceholderMenus, TBtn, TGroup, TMenu, Toolbar } from "../editors/TextToolbar";

export function SectionHead({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}{hint && <span className="hint">– {hint}</span>}</label>
      {children}
    </div>
  );
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const known = options.some(([v]) => v === value);
  return (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{value || "(leer)"}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------------------------------------

export interface FileInfoProps {
  name: string | null;
  suggestedName: string;
  canRename: boolean;
  ownerName: string;
  /** Liefert eine Fehlermeldung oder null. */
  onRename: (name: string) => Promise<string | null>;
}

export function GeneralSection({ q, update, fileInfo }: SectionProps & { fileInfo: FileInfoProps }) {
  const [tag, setTag] = useState("");
  const [fileDraft, setFileDraft] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const renaming = useRef(false);
  const shownName = fileDraft ?? fileInfo.name ?? "";
  const commitRename = async () => {
    if (fileDraft === null || renaming.current) return;
    const v = fileDraft.trim();
    if (!v || v === fileInfo.name) { setFileDraft(null); setRenameError(null); return; }
    renaming.current = true;
    try {
      const err = await fileInfo.onRename(v);
      setRenameError(err);
      setFileDraft(null);
    } finally {
      renaming.current = false;
    }
  };
  return (
    <div className="section">
      <SectionHead title="Allgemein" desc="Name, Bewertung und Fragenotiz" />
      <div className="card"><div className="card-body">
        <Field label="Fragetitel">
          <input className="inp" value={q.name} onChange={(e) => update((x) => { x.name = e.target.value; })} />
        </Field>
        <Field label="Dateiname" hint={fileInfo.name !== null && !fileInfo.canRename ? `Geteilt von ${fileInfo.ownerName}` : undefined}>
          <input className="inp" value={shownName} disabled={fileInfo.name === null}
            readOnly={fileInfo.name !== null && !fileInfo.canRename}
            placeholder={fileInfo.name === null ? `wird beim Speichern: ${fileInfo.suggestedName}` : undefined}
            onChange={(e) => { setFileDraft(e.target.value); setRenameError(null); }}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } }} />
          {renameError && <div className="issue error" style={{ marginTop: 6 }}>{renameError}</div>}
        </Field>
        <div className="grid4">
          <Field label="Erreichbare Punkte">
            <input className="inp" type="number" min="0" step="0.5" value={q.scalars.defaultgrade} onChange={(e) => update((x) => { x.scalars.defaultgrade = e.target.value; })} />
          </Field>
          <Field label="Strafabzug" hint="je Fehlversuch">
            <input className="inp" type="number" min="0" max="1" step="0.05" value={q.scalars.penalty} onChange={(e) => update((x) => { x.scalars.penalty = e.target.value; })} />
          </Field>
          <Field label="ID-Nummer">
            <input className="inp" value={q.scalars.idnumber} onChange={(e) => update((x) => { x.scalars.idnumber = e.target.value; })} />
          </Field>
          <Field label="STACK-Version">
            <input className="inp mono" value={q.stackversion} onChange={(e) => update((x) => { x.stackversion = e.target.value; })} />
          </Field>
        </div>
        <Field label="Schlagwörter (Tags)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {q.tags.map((t, i) => (
              <span key={i} className="chip accent">{t}
                <button className="btn ghost small" style={{ height: 18, padding: "0 2px" }} onClick={() => update((x) => { x.tags.splice(i, 1); })}>×</button>
              </span>
            ))}
            <input className="inp" style={{ width: 180 }} placeholder="Tag + Enter" value={tag} onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && tag.trim()) { update((x) => { x.tags.push(tag.trim()); }); setTag(""); } }} />
          </div>
        </Field>
      </div></div>

      <div className="card">
        <div className="card-head"><h3>Fragenotiz</h3><span className="sub">identifiziert die Variante eindeutig – sollte alle Zufallswerte enthalten</span></div>
        <div className="card-body">
          <CasTextEditor value={q.texts.questionnote.text} onChange={(v) => update((x) => { x.texts.questionnote.text = v; })} minHeight="44px" compact placeholder="{@[a,b]@}" />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Fragebeschreibung</h3><span className="sub">nur für Lehrende sichtbar</span></div>
        <div className="card-body">
          <CasTextEditor value={q.texts.questiondescription.text} onChange={(v) => update((x) => { x.texts.questiondescription.text = v; })} minHeight="60px" compact />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function VariablesSection({ q, update, build, seed }: SectionProps) {
  const diagnostics = useMemo(
    () => (build?.vars.errors ?? []).filter((e) => e.severity === "error").map((e) => ({ ...e })),
    [build],
  );
  return (
    <div className="section">
      <SectionHead title="Fragevariablen" desc="Maxima-Code, der für jede Variante ausgewertet wird. Strg+Leertaste für Vorschläge, Maus über Funktionen für Hilfe." />
      <MaximaEditor
        value={q.questionvariables}
        onChange={(v) => update((x) => { x.questionvariables = v; })}
        minHeight="340px"
        diagnostics={diagnostics}
        placeholder="a: rand(10)+1;"
      />
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Ausgewertete Variablen</h3>
          <span className="sub">Seed {seed}</span>
          <div className="right">
            {build?.vars.simp === false && <span className="chip warn">simp:false</span>}
            {(build?.vars.warnings.length ?? 0) > 0 && <span className="chip warn" title={build?.vars.warnings.join("\n")}>{build?.vars.warnings.length} Hinweis(e)</span>}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {build && build.vars.variables.length > 0 ? (
            <table className="vt">
              <thead><tr><th style={{ width: 160 }}>Name</th><th>Wert</th></tr></thead>
              <tbody>
                {build.vars.variables.map((v) => (
                  <tr key={v.name}><td className="name">{v.name}</td><td className="val">{toMaxima(v.value)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty" style={{ margin: 12 }}>Noch keine Variablen</div>}
          {build?.vars.warnings.map((w, i) => <div key={i} className="issue info" style={{ margin: 8 }}>{w}</div>)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const MODE_KEY = "stack-editor-textmode";

export function EditorModeSwitch({ mode, setMode, small }: { mode: "html" | "visual"; setMode: (m: "html" | "visual") => void; small?: boolean }) {
  return (
    <div className={`mode-switch${small ? " small" : ""}`} role="radiogroup" aria-label="Editormodus">
      <button role="radio" aria-checked={mode === "visual"} className={mode === "visual" ? "on" : ""} onClick={() => setMode("visual")}
        title="Visuell bearbeiten (wie in einem Textverarbeitungsprogramm)">
        <IconText /> Text
      </button>
      <button role="radio" aria-checked={mode === "html"} className={mode === "html" ? "on" : ""} onClick={() => setMode("html")}
        title="HTML-Quelltext mit Vervollständigung">
        <IconCode /> HTML
      </button>
    </div>
  );
}

/** Gewählter Modus je Frage und Feld – nur solange die Seite offen ist. */
const modeMemory = new Map<string, "html" | "visual">();

/**
 * Editormodus (Text/HTML). Jede Frage öffnet im HTML-Modus; ein Wechsel gilt für diese Frage,
 * bis die Seite neu geladen wird (auch beim Wechsel zwischen den Abschnitten).
 */
export function useEditorMode(uid: string, field?: string): ["html" | "visual", (m: "html" | "visual") => void] {
  const key = `${uid}:${field ?? MODE_KEY}`;
  const [mode, setModeState] = useState<"html" | "visual">(() => modeMemory.get(key) ?? "html");
  useEffect(() => { setModeState(modeMemory.get(key) ?? "html"); }, [key]);
  const setMode = (m: "html" | "visual") => {
    modeMemory.set(key, m);
    setModeState(m);
  };
  return [mode, setMode];
}

/** Werkzeugleiste des HTML-Modus. */
function CasToolbar({ view, lead, end }: { view: React.RefObject<EditorView | null>; lead?: React.ReactNode; end?: React.ReactNode }) {
  const ins = (s: string) => insertSnippet(view.current, s);
  return (
    <Toolbar>
      {lead && <TGroup label="STACK-Elemente">{lead}</TGroup>}
      <TGroup label="Mathematik">
        <TBtn title="Maxima-Wert als LaTeX {@…@}" onClick={() => ins("{@|@}")} wide><span className="glyph-code">{"{@ @}"}</span></TBtn>
        <TBtn title="Maxima-Wert als Text {#…#}" onClick={() => ins("{#|#}")} wide><span className="glyph-code">{"{# #}"}</span></TBtn>
        <TBtn title="Formel im Text \( … \)" onClick={() => ins("\\(|\\)")} wide><span className="glyph-code">{"\\( \\)"}</span></TBtn>
        <TBtn title="Abgesetzte Formel \[ … \]" onClick={() => ins("\\[|\\]")} wide><span className="glyph-code">{"\\[ \\]"}</span></TBtn>
      </TGroup>
      <TGroup label="Format">
        <TBtn title="Fett <b>" onClick={() => ins("<b>|</b>")}><b>B</b></TBtn>
        <TBtn title="Kursiv <i>" onClick={() => ins("<i>|</i>")}><i>I</i></TBtn>
        <TBtn title="Absatz <p>" onClick={() => ins("<p>|</p>")}><IconPara /></TBtn>
        <TBtn title="Aufzählung <ul>" onClick={() => ins("<ul>\n  <li>|</li>\n</ul>")}><IconList /></TBtn>
      </TGroup>
      <TGroup label="Blöcke">
        <TMenu label="Block" icon={<IconBraces />}>
          {(close) => (
            <>
              <div className="tmenu-head">CASText-Block einfügen</div>
              {CASTEXT_BLOCKS.map((b) => (
                <button key={b.label} type="button" role="menuitem" className="tmenu-item" title={b.info} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { ins(b.insert.replace(/\$\{\}/, "|").replace(/\$\{([^}]*)\}/g, "$1")); close(); }}>
                  <span className="tok tok-block">{b.label}</span>
                  <span className="tmenu-sub">{b.detail}</span>
                </button>
              ))}
            </>
          )}
        </TMenu>
      </TGroup>
      {end && <TGroup label="Ansicht" end>{end}</TGroup>}
    </Toolbar>
  );
}

/** Gerahmter CASText-Editor mit Werkzeugleiste, Einfüge-Menüs und Fußzeile (HTML- oder Text-Modus). */
function CasTextFrame({ value, onChange, minHeight, info, uid, compact, mode, setMode, onGraph, onGraphBlock }: {
  value: string; onChange: (v: string) => void; minHeight: string; info: PlaceholderInfo;
  uid: string; compact?: boolean; mode: "html" | "visual";
  /** Ohne setMode steht der Moduswechsel nicht in der Leiste (z. B. im Kartenkopf). */
  setMode?: (m: "html" | "visual") => void;
  /** Öffnet den Grafik-Editor; übergibt die Cursorposition im HTML-Modus. */
  onGraph?: (cursor: number | null) => void;
  /** Öffnet eine vorhandene Grafik (Originaltext des Blocks), z. B. per Doppelklick im Text-Modus. */
  onGraphBlock?: (block: string) => void;
}) {
  const view = useRef<EditorView | null>(null);
  const visualInsert = useRef<InsertTokens | null>(null);
  const insert: InsertTokens = (tokens) => {
    if (mode === "html") insertSnippet(view.current, `${tokens.join(" ")}|`);
    else visualInsert.current?.(tokens);
  };
  const hasPlaceholders = info.inputs.length + info.prts.length > 0;
  const graphBtn = onGraph && (
    <TBtn title="Grafik-Editor (JSXGraph): neue Grafik anlegen oder die Grafik an der Cursorposition bearbeiten"
      onClick={() => onGraph(mode === "html" ? view.current?.state.selection.main.head ?? null : null)} wide>
      <IconChart /> Grafik
    </TBtn>
  );
  const lead = hasPlaceholders || graphBtn
    ? <>{hasPlaceholders && <PlaceholderMenus info={info} text={value} insert={insert} />}{graphBtn}</>
    : undefined;
  const end = setMode && <EditorModeSwitch small mode={mode} setMode={setMode} />;
  return (
    <div className={`textframe${compact ? " compact" : ""}`}>
      {mode === "html" ? (
        <>
          <CasToolbar view={view} lead={lead} end={end} />
          <CasTextEditor value={value} onChange={onChange} minHeight={minHeight} compact={compact} onView={(v) => { view.current = v; }} />
        </>
      ) : (
        <VisualEditor key={uid} value={value} onChange={onChange} minHeight={minHeight} lead={lead} end={end}
          onInsertApi={(fn) => { visualInsert.current = fn; }}
          onEditGraph={onGraphBlock} />
      )}
      {(!compact || hasPlaceholders) && <EditorFooter info={info} text={value} insert={insert} legend={!compact} />}
    </div>
  );
}

/**
 * Ziel einer Grafik: `src` = Originaltext des bearbeiteten Blocks. Er wird beim Übernehmen im *aktuellen*
 * Text gesucht – Positionen können sich inzwischen verschoben haben (z. B. durch den Text-Modus).
 */
type GraphTarget = { initial: JsxModel | null; src: string | null; insertAt: number; notice?: string };

export function QuestionTextSection({ q, update }: SectionProps) {
  const [mode, setMode] = useEditorMode(q.uid);
  const [graph, setGraph] = useState<GraphTarget | null>(null);
  const [graphInfo, setGraphInfo] = useState<string | null>(null);
  const text = q.texts.questiontext.text;

  /** Vorhandene Grafik (Originaltext des Blocks) im Grafik-Editor öffnen. */
  const openGraphBlock = (src: string, insertAfter: number) => {
    setGraphInfo(null);
    const block = findJsxBlock(src, 1);
    if (block) {
      // Gespeicherter Stand des Grafik-Editors passt noch genau zum Code: diesen verwenden (Terme bleiben wie eingegeben)
      if (block.model && generateJsx(block.model).code === src) return setGraph({ initial: block.model, src, insertAt: insertAfter });
      // sonst den aktuellen Code einlesen – auch von Hand geschriebene oder geänderte Grafiken
      const parsed = parseJsxBlock(src);
      if (parsed.ok) {
        const parts = [block.model
          ? "Der Code der Grafik wurde von Hand geändert. Der Grafik-Editor zeigt den aktuellen Stand aus dem Code."
          : "Diese Grafik wurde von Hand geschrieben und wird einmalig importiert. Mit „Grafik aktualisieren“ wird sie in das Format des Grafik-Editors übernommen; „Abbrechen“ lässt den Code unverändert."];
        if (parsed.note) parts.push(parsed.note);
        else if (parsed.custom) parts.push(`${parsed.custom} nicht erkannte(r) Abschnitt(e) bleiben als „Eigener Code“ unverändert erhalten.`);
        return setGraph({ initial: parsed.model, src, insertAt: insertAfter, notice: parts.join(" ") });
      }
      return setGraph({
        initial: null, src: null, insertAt: insertAfter,
        notice: `Die Grafik an der Cursorposition lässt sich nicht einlesen (${parsed.error}). Es wird eine neue Grafik dahinter angelegt.`,
      });
    }
  };

  const openGraph = (cursor: number | null) => {
    setGraphInfo(null);
    if (cursor === null) return setGraph({ initial: null, src: null, insertAt: text.length });
    const block = findJsxBlock(text, cursor);
    if (block) return openGraphBlock(text.slice(block.from, block.to), block.to);
    setGraph({ initial: null, src: null, insertAt: cursor });
  };

  const applyGraph = (r: JsxApplyResult) => {
    if (!graph) return;
    const target = graph;
    const missing = r.boundInputs.filter((n) => !new RegExp(`\\[\\[\\s*input:${n}\\s*\\]\\]`).test(text));
    const fields = missing.map((n) => r.hideInputs
      ? `<div style="display:none">[[input:${n}]] [[validation:${n}]]</div>`
      : `<p>[[input:${n}]] [[validation:${n}]]</p>`).join("\n");
    update((x) => {
      const t = x.texts.questiontext.text;
      const block = fields ? `${r.code}\n${fields}` : r.code;
      const at = target.src ? t.indexOf(target.src) : -1;
      if (at >= 0) {
        x.texts.questiontext.text = t.slice(0, at) + block + t.slice(at + target.src!.length);
      } else {
        // neue Grafik – oder der alte Block ist nicht mehr auffindbar: einfügen statt etwas Falsches zu überschreiben
        const pos = Math.min(target.insertAt, t.length);
        x.texts.questiontext.text = `${t.slice(0, pos)}${pos > 0 ? "\n" : ""}${block}\n${t.slice(pos)}`;
      }
      for (const ni of r.newInputs) {
        if (x.inputs.some((i) => i.fields.name === ni.name)) continue;
        x.inputs.push(defaultInput(ni.name, ni.kind === "point" ? "[0,0]" : ni.kind === "list" ? "[]" : "0"));
      }
    });
    const replaced = !!target.src && q.texts.questiontext.text.includes(target.src);
    const parts = [replaced ? "Grafik aktualisiert." : target.src ? "Die ursprüngliche Grafik wurde inzwischen geändert – die neue Fassung wurde zusätzlich eingefügt." : "Grafik eingefügt."];
    if (r.newInputs.length) parts.push(`Neue Eingabe(n) ${r.newInputs.map((n) => n.name).join(", ")} angelegt. Die Musterlösung bitte unter „Eingaben“ eintragen und die Eingabe in einem Rückmeldebaum auswerten.`);
    if (missing.length) parts.push(`Eingabefelder für ${missing.join(", ")} ${r.hideInputs ? "versteckt " : ""}hinter der Grafik eingefügt.`);
    setGraphInfo(parts.join(" "));
    setGraph(null);
  };

  const info: PlaceholderInfo = {
    inputs: q.inputs.map((i) => ({ name: i.fields.name, type: i.fields.type })),
    prts: q.prts.map((p) => p.name),
    otherText: q.texts.specificfeedback.text,
  };
  return (
    <div className="section">
      <SectionHead title="Fragetext" desc="Was Studierende sehen. Eingaben und Feedback fügst du über die Menüs links in der Leiste ein, noch nicht platzierte stehen unter dem Editor." />
      {graphInfo && (
        <div className="issue info graph-info">
          <span>{graphInfo}</span>
          <button className="btn ghost small" onClick={() => setGraphInfo(null)} aria-label="Hinweis schließen"><IconX /></button>
        </div>
      )}
      <CasTextFrame uid={q.uid} value={q.texts.questiontext.text} onChange={(v) => update((x) => { x.texts.questiontext.text = v; })}
        minHeight="460px" info={info} mode={mode} setMode={setMode} onGraph={openGraph}
        onGraphBlock={(src) => openGraphBlock(src, text.indexOf(src) >= 0 ? text.indexOf(src) + src.length : text.length)} />
      {graph && (
        <JsxBuilder initial={graph.initial} notice={graph.notice} onClose={() => setGraph(null)} onApply={applyGraph}
          inputs={q.inputs.map((i) => ({ name: i.fields.name, type: i.fields.type }))} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const FEEDBACK_FIELDS: { key: TextField; title: string; sub: string }[] = [
  { key: "specificfeedback", title: "Spezifisches Feedback", sub: "wird nach dem Prüfen angezeigt; enthält oft [[feedback:prt1]]" },
  { key: "generalfeedback", title: "Allgemeines Feedback / Lösungsweg", sub: "wird nach Abschluss des Tests angezeigt" },
  { key: "prtcorrect", title: "Standard-Rückmeldung: richtig", sub: "vor dem PRT-Feedback bei voller Punktzahl" },
  { key: "prtpartiallycorrect", title: "Standard-Rückmeldung: teilweise richtig", sub: "bei 0 < Punkte < 1" },
  { key: "prtincorrect", title: "Standard-Rückmeldung: falsch", sub: "bei 0 Punkten" },
];

function FeedbackCard({ q, update, field }: Pick<SectionProps, "q" | "update"> & { field: (typeof FEEDBACK_FIELDS)[number] }) {
  // Nur im spezifischen Feedback gehören die PRT-Platzhalter hin
  const [mode, setMode] = useEditorMode(q.uid, field.key);
  const info: PlaceholderInfo = field.key === "specificfeedback"
    ? { inputs: [], prts: q.prts.map((p) => p.name), otherText: q.texts.questiontext.text }
    : { inputs: [], prts: [] };
  const minHeight = field.key === "generalfeedback" ? "140px" : field.key === "specificfeedback" ? "90px" : "60px";
  return (
    <div className="card">
      <div className="card-head">
        <h3>{field.title}</h3>
        <span className="sub">{field.sub}</span>
        <div className="right"><EditorModeSwitch small mode={mode} setMode={setMode} /></div>
      </div>
      <div className="card-body">
        <CasTextFrame uid={`${q.uid}-${field.key}`} mode={mode} value={q.texts[field.key].text}
          onChange={(v) => update((x) => { x.texts[field.key].text = v; })} minHeight={minHeight} info={info} compact />
      </div>
    </div>
  );
}

export function FeedbackSection({ q, update }: SectionProps) {
  return (
    <div className="section">
      <SectionHead title="Feedback" desc="Rückmeldungstexte (CASText). Jedes Feld lässt sich zwischen Text- und HTML-Ansicht umschalten." />
      {FEEDBACK_FIELDS.map((f) => <FeedbackCard key={f.key} q={q} update={update} field={f} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const OPTION_DEFS: { key: string; label: string; hint?: string; options: [string, string][] }[] = [
  { key: "questionsimplify", label: "Automatisch vereinfachen", hint: "simp in Fragevariablen", options: [["1", "Ja"], ["0", "Nein"]] },
  { key: "assumepositive", label: "Variablen positiv annehmen", options: [["0", "Nein"], ["1", "Ja"]] },
  { key: "assumereal", label: "Variablen reell annehmen", options: [["0", "Nein"], ["1", "Ja"]] },
  { key: "multiplicationsign", label: "Malzeichen", options: [["dot", "Punkt ·"], ["cross", "Kreuz ×"], ["onum", "Nur zwischen Zahlen"], ["none", "Keines"]] },
  { key: "sqrtsign", label: "Wurzelzeichen", options: [["1", "Ja √"], ["0", "Nein (Potenz)"]] },
  { key: "complexno", label: "Imaginäre Einheit", options: [["i", "i"], ["j", "j"], ["symi", "Symbol i"], ["symj", "Symbol j"]] },
  { key: "inversetrig", label: "Umkehrfunktionen", options: [["cos-1", "cos⁻¹(x)"], ["acos", "acos(x)"], ["arccos", "arccos(x)"], ["arccos-arcosh", "arccos(x)/arcosh(x)"]] },
  { key: "logicsymbol", label: "Logiksymbole", options: [["lang", "Sprache (and/or)"], ["symbol", "Symbole ∧ ∨"]] },
  { key: "matrixparens", label: "Matrixklammern", options: [["[", "[ ]"], ["(", "( )"], ["{", "{ }"], ["|", "| |"], ["", "keine"]] },
  { key: "decimals", label: "Dezimaltrennzeichen", options: [[".", "Punkt ."], [",", "Komma ,"]] },
  { key: "scientificnotation", label: "Wissenschaftliche Notation", options: [["*10", "×10ⁿ"], ["E", "E"]] },
];

export function OptionsSection({ q, update }: SectionProps) {
  return (
    <div className="section">
      <SectionHead title="Optionen" desc="Darstellung und CAS-Einstellungen der Aufgabe" />
      <div className="card"><div className="card-body">
        <div className="grid3">
          {OPTION_DEFS.map((o) => (
            <Field key={o.key} label={o.label} hint={o.hint}>
              <Select value={q.scalars[o.key] ?? ""} onChange={(v) => update((x) => { x.scalars[o.key] = v; })} options={o.options} />
            </Field>
          ))}
          <Field label="Seed für Variantenauswahl" hint="optional">
            <input className="inp mono" value={q.scalars.variantsselectionseed} onChange={(e) => update((x) => { x.scalars.variantsselectionseed = e.target.value; })} />
          </Field>
          <Field label="Textformat des Fragetexts" hint="Moodle-Attribut; STACK erwartet HTML">
            <Select value={q.texts.questiontext.format} onChange={(v) => update((x) => { x.texts.questiontext.format = v; })}
              options={[["html", "HTML (empfohlen)"], ["moodle_auto_format", "Moodle-Auto-Format"], ["markdown", "Markdown"], ["plain_text", "Reiner Text"]]} />
          </Field>
          <Field label="Als defekt markiert">
            <Select value={q.scalars.isbroken} onChange={(v) => update((x) => { x.scalars.isbroken = v; })} options={[["0", "Nein"], ["1", "Ja"]]} />
          </Field>
        </div>
      </div></div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function XmlSection({ xml, onCopy, onDownload }: SectionProps & { xml: string; onCopy: () => void; onDownload: () => void }) {
  return (
    <div className="section" style={{ maxWidth: "none" }}>
      <SectionHead title="XML" desc="Exportiertes Moodle-XML (schreibgeschützt). Unbekannte Elemente der Originaldatei bleiben erhalten.">
        <button className="btn" onClick={onCopy}><IconCopy /> Kopieren</button>
        <button className="btn primary" onClick={onDownload}><IconDownload /> Herunterladen</button>
      </SectionHead>
      <XmlViewer value={xml} />
    </div>
  );
}
