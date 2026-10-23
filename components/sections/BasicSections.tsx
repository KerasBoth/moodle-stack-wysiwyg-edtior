"use client";

import type { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState } from "react";
import { toMaxima } from "@/lib/maxima/print";
import { CASTEXT_BLOCKS, casTextBlockText } from "@/lib/stack/docs";
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
import type { MessageKey } from "@/lib/i18n";
import { useT } from "../I18nProvider";

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
  const t = useT();
  const known = options.some(([v]) => v === value);
  return (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{value || t("sections.emptyOption")}</option>}
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
  const t = useT();
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
      <SectionHead title={t("editor.nav.general")} desc={t("sections.general.desc")} />
      <div className="card"><div className="card-body">
        <Field label={t("sections.general.questionName")}>
          <input className="inp" value={q.name} onChange={(e) => update((x) => { x.name = e.target.value; })} />
        </Field>
        <Field label={t("sections.general.fileName")} hint={fileInfo.name !== null && !fileInfo.canRename ? t("editor.sharedBy", { name: fileInfo.ownerName }) : undefined}>
          <input className="inp" value={shownName} disabled={fileInfo.name === null}
            readOnly={fileInfo.name !== null && !fileInfo.canRename}
            placeholder={fileInfo.name === null ? t("sections.general.fileNameOnSave", { name: fileInfo.suggestedName }) : undefined}
            onChange={(e) => { setFileDraft(e.target.value); setRenameError(null); }}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } }} />
          {renameError && <div className="issue error" style={{ marginTop: 6 }}>{renameError}</div>}
        </Field>
        <div className="grid4">
          <Field label={t("sections.general.maxMark")}>
            <input className="inp" type="number" min="0" step="0.5" value={q.scalars.defaultgrade} onChange={(e) => update((x) => { x.scalars.defaultgrade = e.target.value; })} />
          </Field>
          <Field label={t("sections.general.penalty")} hint={t("sections.general.penaltyHint")}>
            <input className="inp" type="number" min="0" max="1" step="0.05" value={q.scalars.penalty} onChange={(e) => update((x) => { x.scalars.penalty = e.target.value; })} />
          </Field>
          <Field label={t("sections.general.idNumber")}>
            <input className="inp" value={q.scalars.idnumber} onChange={(e) => update((x) => { x.scalars.idnumber = e.target.value; })} />
          </Field>
          <Field label={t("sections.general.stackVersion")}>
            <input className="inp mono" value={q.stackversion} onChange={(e) => update((x) => { x.stackversion = e.target.value; })} />
          </Field>
        </div>
        <Field label={t("sections.general.tags")}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {q.tags.map((tg, i) => (
              <span key={i} className="chip accent">{tg}
                <button className="btn ghost small" style={{ height: 18, padding: "0 2px" }} onClick={() => update((x) => { x.tags.splice(i, 1); })}>×</button>
              </span>
            ))}
            <input className="inp" style={{ width: 180 }} placeholder={t("sections.general.tagPlaceholder")} value={tag} onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && tag.trim()) { update((x) => { x.tags.push(tag.trim()); }); setTag(""); } }} />
          </div>
        </Field>
      </div></div>

      <div className="card">
        <div className="card-head"><h3>{t("sections.general.questionNote")}</h3><span className="sub">{t("sections.general.questionNoteSub")}</span></div>
        <div className="card-body">
          <CasTextEditor value={q.texts.questionnote.text} onChange={(v) => update((x) => { x.texts.questionnote.text = v; })} minHeight="44px" compact placeholder="{@[a,b]@}" />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>{t("sections.general.questionDescription")}</h3><span className="sub">{t("sections.general.questionDescriptionSub")}</span></div>
        <div className="card-body">
          <CasTextEditor value={q.texts.questiondescription.text} onChange={(v) => update((x) => { x.texts.questiondescription.text = v; })} minHeight="60px" compact />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function VariablesSection({ q, update, build, seed }: SectionProps) {
  const t = useT();
  const diagnostics = useMemo(
    () => (build?.vars.errors ?? []).filter((e) => e.severity === "error").map((e) => ({ ...e })),
    [build],
  );
  return (
    <div className="section">
      <SectionHead title={t("editor.nav.variables")} desc={t("sections.variables.desc")} />
      <MaximaEditor
        value={q.questionvariables}
        onChange={(v) => update((x) => { x.questionvariables = v; })}
        minHeight="340px"
        diagnostics={diagnostics}
        placeholder="a: rand(10)+1;"
      />
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>{t("sections.variables.evaluated")}</h3>
          <span className="sub">{t("sections.variables.seed", { seed })}</span>
          <div className="right">
            {build?.vars.simp === false && <span className="chip warn">simp:false</span>}
            {(build?.vars.warnings.length ?? 0) > 0 && <span className="chip warn" title={build?.vars.warnings.map((w) => t(w)).join("\n")}>{t("sections.variables.hints", { count: build?.vars.warnings.length ?? 0 })}</span>}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {build && build.vars.variables.length > 0 ? (
            <table className="vt">
              <thead><tr><th style={{ width: 160 }}>{t("sections.variables.name")}</th><th>{t("sections.variables.value")}</th></tr></thead>
              <tbody>
                {build.vars.variables.map((v) => (
                  <tr key={v.name}><td className="name">{v.name}</td><td className="val">{toMaxima(v.value)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty" style={{ margin: 12 }}>{t("sections.variables.empty")}</div>}
          {build?.vars.warnings.map((w, i) => <div key={i} className="issue info" style={{ margin: 8 }}>{t(w)}</div>)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const MODE_KEY = "stack-editor-textmode";

export function EditorModeSwitch({ mode, setMode, small }: { mode: "html" | "visual"; setMode: (m: "html" | "visual") => void; small?: boolean }) {
  const t = useT();
  return (
    <div className={`mode-switch${small ? " small" : ""}`} role="radiogroup" aria-label={t("sections.text.modeLabel")}>
      <button role="radio" aria-checked={mode === "visual"} className={mode === "visual" ? "on" : ""} onClick={() => setMode("visual")}
        title={t("sections.text.modeVisualTitle")}>
        <IconText /> {t("sections.text.modeVisual")}
      </button>
      <button role="radio" aria-checked={mode === "html"} className={mode === "html" ? "on" : ""} onClick={() => setMode("html")}
        title={t("sections.text.modeHtmlTitle")}>
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
  const t = useT();
  const ins = (s: string) => insertSnippet(view.current, s);
  return (
    <Toolbar>
      {lead && <TGroup label={t("editor.visual.stackElements")}>{lead}</TGroup>}
      <TGroup label={t("editor.visual.math")}>
        <TBtn title={t("sections.text.casLatex")} onClick={() => ins("{@|@}")} wide><span className="glyph-code">{"{@ @}"}</span></TBtn>
        <TBtn title={t("sections.text.casText")} onClick={() => ins("{#|#}")} wide><span className="glyph-code">{"{# #}"}</span></TBtn>
        <TBtn title={t("sections.text.inlineFormula")} onClick={() => ins("\\(|\\)")} wide><span className="glyph-code">{"\\( \\)"}</span></TBtn>
        <TBtn title={t("sections.text.displayFormula")} onClick={() => ins("\\[|\\]")} wide><span className="glyph-code">{"\\[ \\]"}</span></TBtn>
      </TGroup>
      <TGroup label={t("sections.text.format")}>
        <TBtn title={`${t("editor.visual.bold")} <b>`} onClick={() => ins("<b>|</b>")}><b>B</b></TBtn>
        <TBtn title={`${t("editor.visual.italic")} <i>`} onClick={() => ins("<i>|</i>")}><i>I</i></TBtn>
        <TBtn title={`${t("editor.visual.paragraph")} <p>`} onClick={() => ins("<p>|</p>")}><IconPara /></TBtn>
        <TBtn title={`${t("editor.visual.bulletList")} <ul>`} onClick={() => ins("<ul>\n  <li>|</li>\n</ul>")}><IconList /></TBtn>
      </TGroup>
      <TGroup label={t("sections.text.blocks")}>
        <TMenu label={t("sections.text.block")} icon={<IconBraces />}>
          {(close) => (
            <>
              <div className="tmenu-head">{t("sections.text.insertBlock")}</div>
              {CASTEXT_BLOCKS.map((block) => casTextBlockText(block, t)).map((b) => (
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
      {end && <TGroup label={t("editor.visual.view")} end>{end}</TGroup>}
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
  const t = useT();
  const view = useRef<EditorView | null>(null);
  const visualInsert = useRef<InsertTokens | null>(null);
  const insert: InsertTokens = (tokens) => {
    if (mode === "html") insertSnippet(view.current, `${tokens.join(" ")}|`);
    else visualInsert.current?.(tokens);
  };
  const hasPlaceholders = info.inputs.length + info.prts.length > 0;
  const graphBtn = onGraph && (
    <TBtn title={t("sections.text.graphTitle")}
      onClick={() => onGraph(mode === "html" ? view.current?.state.selection.main.head ?? null : null)} wide>
      <IconChart /> {t("sections.text.graph")}
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
  const t = useT();
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
        const parts = [t(block.model ? "sections.text.graphHandEdited" : "sections.text.graphImported")];
        if (parsed.note) {
          const { cause, ...note } = parsed.note;
          parts.push(t(note.key, cause ? { ...note.params, error: t(cause) } : note.params));
        }
        else if (parsed.custom) parts.push(t("sections.text.graphCustomCode", { count: parsed.custom }));
        return setGraph({ initial: parsed.model, src, insertAt: insertAfter, notice: parts.join(" ") });
      }
      return setGraph({
        initial: null, src: null, insertAt: insertAfter,
        notice: t("sections.text.graphUnreadable", { error: t(parsed.error) }),
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
      const cur = x.texts.questiontext.text;
      const block = fields ? `${r.code}\n${fields}` : r.code;
      const at = target.src ? cur.indexOf(target.src) : -1;
      if (at >= 0) {
        x.texts.questiontext.text = cur.slice(0, at) + block + cur.slice(at + target.src!.length);
      } else {
        // neue Grafik – oder der alte Block ist nicht mehr auffindbar: einfügen statt etwas Falsches zu überschreiben
        const pos = Math.min(target.insertAt, cur.length);
        x.texts.questiontext.text = `${cur.slice(0, pos)}${pos > 0 ? "\n" : ""}${block}\n${cur.slice(pos)}`;
      }
      for (const ni of r.newInputs) {
        if (x.inputs.some((i) => i.fields.name === ni.name)) continue;
        x.inputs.push(defaultInput(ni.name, ni.kind === "point" ? "[0,0]" : ni.kind === "list" ? "[]" : "0"));
      }
    });
    const replaced = !!target.src && q.texts.questiontext.text.includes(target.src);
    const parts = [t(replaced ? "sections.text.graphUpdated" : target.src ? "sections.text.graphChangedMeanwhile" : "sections.text.graphInserted")];
    if (r.newInputs.length) parts.push(t("sections.text.graphNewInputs", { count: r.newInputs.length, names: r.newInputs.map((n) => n.name).join(", ") }));
    if (missing.length) parts.push(t(r.hideInputs ? "sections.text.graphFieldsInsertedHidden" : "sections.text.graphFieldsInserted", { names: missing.join(", ") }));
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
      <SectionHead title={t("editor.nav.text")} desc={t("sections.text.desc")} />
      {graphInfo && (
        <div className="issue info graph-info">
          <span>{graphInfo}</span>
          <button className="btn ghost small" onClick={() => setGraphInfo(null)} aria-label={t("sections.text.closeNotice")}><IconX /></button>
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

// Nur die Beschriftungen werden übersetzt; die vorbelegten Texte (lib/stack/model.ts) gehen unverändert ins XML.
const FEEDBACK_FIELDS: { key: TextField; title: MessageKey; sub: MessageKey }[] = [
  { key: "specificfeedback", title: "sections.feedback.specific", sub: "sections.feedback.specificSub" },
  { key: "generalfeedback", title: "sections.feedback.general", sub: "sections.feedback.generalSub" },
  { key: "prtcorrect", title: "sections.feedback.correct", sub: "sections.feedback.correctSub" },
  { key: "prtpartiallycorrect", title: "sections.feedback.partial", sub: "sections.feedback.partialSub" },
  { key: "prtincorrect", title: "sections.feedback.incorrect", sub: "sections.feedback.incorrectSub" },
];

function FeedbackCard({ q, update, field }: Pick<SectionProps, "q" | "update"> & { field: (typeof FEEDBACK_FIELDS)[number] }) {
  const t = useT();
  // Nur im spezifischen Feedback gehören die PRT-Platzhalter hin
  const [mode, setMode] = useEditorMode(q.uid, field.key);
  const info: PlaceholderInfo = field.key === "specificfeedback"
    ? { inputs: [], prts: q.prts.map((p) => p.name), otherText: q.texts.questiontext.text }
    : { inputs: [], prts: [] };
  const minHeight = field.key === "generalfeedback" ? "140px" : field.key === "specificfeedback" ? "90px" : "60px";
  return (
    <div className="card">
      <div className="card-head">
        <h3>{t(field.title)}</h3>
        <span className="sub">{t(field.sub)}</span>
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
  const t = useT();
  return (
    <div className="section">
      <SectionHead title={t("editor.nav.feedback")} desc={t("sections.feedback.desc")} />
      {FEEDBACK_FIELDS.map((f) => <FeedbackCard key={f.key} q={q} update={update} field={f} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const optionDefs = (t: ReturnType<typeof useT>): { key: string; label: string; hint?: string; options: [string, string][] }[] => {
  const yesNo: [string, string][] = [["1", t("common.yes")], ["0", t("common.no")]];
  const noYes: [string, string][] = [["0", t("common.no")], ["1", t("common.yes")]];
  return [
    { key: "questionsimplify", label: t("sections.options.simplify"), hint: t("sections.options.simplifyHint"), options: yesNo },
    { key: "assumepositive", label: t("sections.options.assumePositive"), options: noYes },
    { key: "assumereal", label: t("sections.options.assumeReal"), options: noYes },
    { key: "multiplicationsign", label: t("sections.options.multiplicationSign"), options: [["dot", t("sections.options.multDot")], ["cross", t("sections.options.multCross")], ["onum", t("sections.options.multOnum")], ["none", t("sections.options.multNone")]] },
    { key: "sqrtsign", label: t("sections.options.sqrtSign"), options: [["1", t("sections.options.sqrtYes")], ["0", t("sections.options.sqrtNo")]] },
    { key: "complexno", label: t("sections.options.complexNo"), options: [["i", "i"], ["j", "j"], ["symi", t("sections.options.symbolI")], ["symj", t("sections.options.symbolJ")]] },
    { key: "inversetrig", label: t("sections.options.inverseTrig"), options: [["cos-1", "cos⁻¹(x)"], ["acos", "acos(x)"], ["arccos", "arccos(x)"], ["arccos-arcosh", "arccos(x)/arcosh(x)"]] },
    { key: "logicsymbol", label: t("sections.options.logicSymbol"), options: [["lang", t("sections.options.logicLang")], ["symbol", t("sections.options.logicSymbols")]] },
    { key: "matrixparens", label: t("sections.options.matrixParens"), options: [["[", "[ ]"], ["(", "( )"], ["{", "{ }"], ["|", "| |"], ["", t("sections.options.matrixNone")]] },
    { key: "decimals", label: t("sections.options.decimals"), options: [[".", t("sections.options.decimalPoint")], [",", t("sections.options.decimalComma")]] },
    { key: "scientificnotation", label: t("sections.options.scientificNotation"), options: [["*10", "×10ⁿ"], ["E", "E"]] },
  ];
};

export function OptionsSection({ q, update }: SectionProps) {
  const t = useT();
  return (
    <div className="section">
      <SectionHead title={t("editor.nav.options")} desc={t("sections.options.desc")} />
      <div className="card"><div className="card-body">
        <div className="grid3">
          {optionDefs(t).map((o) => (
            <Field key={o.key} label={o.label} hint={o.hint}>
              <Select value={q.scalars[o.key] ?? ""} onChange={(v) => update((x) => { x.scalars[o.key] = v; })} options={o.options} />
            </Field>
          ))}
          <Field label={t("sections.options.variantSeed")} hint={t("sections.options.optional")}>
            <input className="inp mono" value={q.scalars.variantsselectionseed} onChange={(e) => update((x) => { x.scalars.variantsselectionseed = e.target.value; })} />
          </Field>
          <Field label={t("sections.options.textFormat")} hint={t("sections.options.textFormatHint")}>
            <Select value={q.texts.questiontext.format} onChange={(v) => update((x) => { x.texts.questiontext.format = v; })}
              options={[["html", t("sections.options.formatHtml")], ["moodle_auto_format", t("sections.options.formatMoodleAuto")], ["markdown", "Markdown"], ["plain_text", t("sections.options.formatPlain")]]} />
          </Field>
          <Field label={t("sections.options.isBroken")}>
            <Select value={q.scalars.isbroken} onChange={(v) => update((x) => { x.scalars.isbroken = v; })} options={[["0", t("common.no")], ["1", t("common.yes")]]} />
          </Field>
        </div>
      </div></div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function XmlSection({ xml, onCopy, onDownload }: SectionProps & { xml: string; onCopy: () => void; onDownload: () => void }) {
  const t = useT();
  return (
    <div className="section" style={{ maxWidth: "none" }}>
      <SectionHead title="XML" desc={t("sections.xml.desc")}>
        <button className="btn" onClick={onCopy}><IconCopy /> {t("sections.xml.copy")}</button>
        <button className="btn primary" onClick={onDownload}><IconDownload /> {t("sections.xml.download")}</button>
      </SectionHead>
      <XmlViewer value={xml} />
    </div>
  );
}
