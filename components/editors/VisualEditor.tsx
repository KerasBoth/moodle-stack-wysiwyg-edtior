"use client";

// Visueller Editor ("Text"-Modus) für CASText. STACK-spezifische Teile werden als
// nicht editierbare Bausteine geschützt und beim Zurückschreiben unverändert eingesetzt.

import { useCallback, useEffect, useRef, useState } from "react";
import { casToMathJax, parseFormula } from "@/lib/editor/formula";
import { type FormulaView, useFormulaView } from "@/lib/editor/formulaView";
import { renderTex } from "@/lib/editor/mathjax";
import { chipFor, piMark, protect, restoreProtected } from "@/lib/editor/protect";
import { useDialogs } from "../Dialogs";
import { IconClearFormat, IconList, IconListNum, IconPara } from "../icons";
import { type InsertTokens, TBtn, TGroup, Toolbar } from "./TextToolbar";

/** Der gespeicherte Text kommt ausschließlich aus `store`; der Inhalt der Kästchen (auch MathJax-SVG) zählt nicht. */
function unprotect(root: HTMLElement, store: string[]): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>("[data-pi]").forEach((el) => {
    el.replaceWith(document.createTextNode(piMark(Number(el.dataset.pi))));
  });
  return restoreProtected(clone.innerHTML, store).replace(/<br>(<\/p>)/g, "$1");
}

// Laufende Darstellung je Kästchen; ein späterer Auftrag (Ansichtswechsel) macht frühere Ergebnisse ungültig.
const mathJobs = new WeakMap<HTMLElement, number>();
let mathJobSeq = 0;

/** Füllt ein Formel-Kästchen gemäß Ansicht: LaTeX-Code bzw. MathJax (bis dahin der Code). Ändert `store` nicht. */
function fillMathChip(el: HTMLElement, store: string[], view: FormulaView) {
  const i = Number(el.dataset.pi);
  const source = store[i];
  const formula = source === undefined ? null : parseFormula(source);
  const job = ++mathJobSeq;
  mathJobs.set(el, job);
  el.classList.remove("vchip-rendered");
  el.classList.toggle("vchip-display", view === "rendered" && formula?.kind === "display");
  el.textContent = source ?? "";
  if (view === "latex" || !formula) return;
  renderTex(casToMathJax(formula.tex), formula.kind === "display").then(
    (node) => {
      if (!el.isConnected || mathJobs.get(el) !== job || store[i] !== source) return;
      el.replaceChildren(node);
      el.classList.add("vchip-rendered");
    },
    () => { /* Ladefehler oder TeX-Fehler: Der Code bleibt stehen. */ },
  );
}

function fillMathChips(root: HTMLElement, store: string[], view: FormulaView) {
  root.querySelectorAll<HTMLElement>(".vchip-math[data-pi]").forEach((el) => fillMathChip(el, store, view));
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  minHeight?: string;
  /** Erste Gruppe der Werkzeugleiste (z. B. Einfüge-Menüs für Eingaben/Feedback). */
  lead?: React.ReactNode;
  /** Rechts in der Werkzeugleiste (z. B. Moduswechsel). */
  end?: React.ReactNode;
  /** Liefert die Einfügefunktion für STACK-Platzhalter an den Aufrufer. */
  onInsertApi?: (insert: InsertTokens) => void;
  /** Doppelklick auf eine Grafik: Originaltext des [[jsxgraph]]-Blocks an den Grafik-Editor geben. */
  onEditGraph?: (block: string) => void;
}

export default function VisualEditor({ value, onChange, minHeight = "300px", lead, end, onInsertApi, onEditGraph }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dialogs = useDialogs();
  const store = useRef<string[]>([]);
  const lastEmitted = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [formulaView, setFormulaView] = useFormulaView();
  // Ansicht, in der die Formel-Kästchen zuletzt gefüllt wurden
  const filledView = useRef<FormulaView | null>(null);

  // Externe Änderungen (anderer Modus, andere Frage) übernehmen
  useEffect(() => {
    if (!ref.current || value === lastEmitted.current) return;
    store.current = [];
    ref.current.innerHTML = protect(value, store.current, !!onEditGraph);
    lastEmitted.current = value;
    fillMathChips(ref.current, store.current, formulaView);
    filledView.current = formulaView;
  }, [value]);

  // Ansichtswechsel: nur die Darstellung der Formel-Kästchen, der Text bleibt unverändert
  useEffect(() => {
    if (!ref.current || filledView.current === formulaView) return;
    fillMathChips(ref.current, store.current, formulaView);
    filledView.current = formulaView;
  }, [formulaView]);

  const emit = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!ref.current) return;
      const html = unprotect(ref.current, store.current);
      lastEmitted.current = html;
      onChange(html);
    }, 200);
  }, [onChange]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Aktive Formatierung an der Cursorposition (für den gedrückten Zustand der Buttons)
  const [active, setActive] = useState<Record<string, boolean>>({});
  const refreshActive = useCallback(() => {
    const root = ref.current;
    const sel = document.getSelection();
    // Bausteine (nicht editierbar, eigener Hintergrund) zeigen die Textauswahl nicht von selbst – markieren
    if (root) {
      const range = sel && sel.rangeCount && !sel.isCollapsed && root.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
      root.querySelectorAll<HTMLElement>("[data-pi]").forEach((el) => el.classList.toggle("vsel", !!range && range.intersectsNode(el)));
    }
    if (!root || !sel || !sel.anchorNode || !root.contains(sel.anchorNode)) {
      setActive((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    const next: Record<string, boolean> = {};
    for (const c of ["bold", "italic", "underline", "subscript", "superscript", "insertUnorderedList", "insertOrderedList"]) {
      try { next[c] = document.queryCommandState(c); } catch { next[c] = false; }
    }
    let block = "";
    try { block = String(document.queryCommandValue("formatBlock")).toLowerCase(); } catch { /* ignorieren */ }
    next.h3 = block === "h3";
    next.p = block === "p" || block === "div";
    setActive((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
    refreshActive();
  };

  const insertProtected = (snippet: string) => {
    store.current.push(snippet);
    const i = store.current.length - 1;
    exec("insertHTML", chipFor(snippet, i) + "&nbsp;");
    const el = ref.current?.querySelector<HTMLElement>(`.vchip-math[data-pi="${i}"]`);
    if (el) fillMathChip(el, store.current, formulaView);
  };

  // Einfügefunktion für Menüs/Fußzeile des Aufrufers (bei jedem Rendern aktuell halten)
  useEffect(() => {
    onInsertApi?.((tokens) => tokens.forEach(insertProtected));
  });

  // Auswahl im Editor vor dem Dialog sichern und danach wiederherstellen
  const saveSelection = (): Range | null => {
    const root = ref.current;
    const sel = document.getSelection();
    return root && sel && sel.rangeCount && root.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  };
  const restoreSelection = (saved: Range | null) => {
    const root = ref.current;
    if (!root) return false;
    root.focus();
    if (saved && root.contains(saved.commonAncestorContainer)) {
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(saved);
    }
    return true;
  };

  const insertCas = async () => {
    const saved = saveSelection();
    const expr = await dialogs.prompt({ title: "Maxima-Ausdruck einfügen", label: "Ausdruck", mono: true, message: "Wird als {@…@} eingefügt.", confirmLabel: "Einfügen" });
    if (!restoreSelection(saved) || !expr) return;
    insertProtected(`{@${expr}@}`);
  };

  const insertMath = async () => {
    const saved = saveSelection();
    const tex = await dialogs.prompt({ title: "LaTeX-Formel einfügen", label: "Formel", mono: true, message: "Wird als \\( … \\) eingefügt.", confirmLabel: "Einfügen" });
    if (!restoreSelection(saved) || !tex) return;
    exec("insertText", `\\(${tex}\\)`);
  };

  const onDoubleClick = async (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-pi]");
    if (!el) return;
    const i = Number(el.dataset.pi);
    const orig = store.current[i];
    if (onEditGraph && /^\[\[\s*jsxgraph/i.test(orig)) {
      // vorher den aktuellen Stand übernehmen, damit die Position im Text stimmt
      window.clearTimeout(timer.current);
      if (ref.current) {
        const html = unprotect(ref.current, store.current);
        if (html !== lastEmitted.current) { lastEmitted.current = html; onChange(html); }
      }
      onEditGraph(orig);
      return;
    }
    const m = /^\{([@#])([\s\S]*)\1\}$/.exec(orig);
    if (!m) return;
    const next = await dialogs.prompt({ title: "Ausdruck bearbeiten", label: "Ausdruck", initial: m[2], mono: true, confirmLabel: "Übernehmen" });
    if (next === null || !el.isConnected || !ref.current) return;
    store.current[i] = `{${m[1]}${next}${m[1]}}`;
    el.textContent = store.current[i];
    emit();
  };

  // Einfügen nur als reiner Text, damit kein fremdes HTML/Styling eingeschleppt wird
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  return (
    <>
      <Toolbar>
        {lead && <TGroup label="STACK-Elemente">{lead}</TGroup>}
        <TGroup label="Mathematik">
          <TBtn title="Maxima-Wert einfügen {@…@}" onClick={insertCas} wide><span className="glyph-code">{"{@ @}"}</span></TBtn>
          <TBtn title="Formel einfügen \( … \)" onClick={insertMath} wide><span className="glyph-math">∑ Formel</span></TBtn>
          <TBtn title="Formeln: gesetzt / LaTeX" onClick={() => setFormulaView(formulaView === "rendered" ? "latex" : "rendered")} wide>
            {formulaView === "rendered" ? <span className="glyph-math">x² gesetzt</span> : <span className="glyph-code">{"\\( \\) LaTeX"}</span>}
          </TBtn>
        </TGroup>
        <TGroup label="Zeichenformat">
          <TBtn title="Fett" onClick={() => exec("bold")} active={!!active.bold}><b>B</b></TBtn>
          <TBtn title="Kursiv" onClick={() => exec("italic")} active={!!active.italic}><i>I</i></TBtn>
          <TBtn title="Unterstrichen" onClick={() => exec("underline")} active={!!active.underline}><u>U</u></TBtn>
          <TBtn title="Tiefgestellt" onClick={() => exec("subscript")} active={!!active.subscript}><span>x<sub>2</sub></span></TBtn>
          <TBtn title="Hochgestellt" onClick={() => exec("superscript")} active={!!active.superscript}><span>x<sup>2</sup></span></TBtn>
        </TGroup>
        <TGroup label="Absatzformat">
          <TBtn title="Absatz" onClick={() => exec("formatBlock", "<p>")} active={!!active.p}><IconPara /></TBtn>
          <TBtn title="Überschrift" onClick={() => exec("formatBlock", "<h3>")} active={!!active.h3}><b>H</b></TBtn>
          <TBtn title="Aufzählung" onClick={() => exec("insertUnorderedList")} active={!!active.insertUnorderedList}><IconList /></TBtn>
          <TBtn title="Nummerierte Liste" onClick={() => exec("insertOrderedList")} active={!!active.insertOrderedList}><IconListNum /></TBtn>
          <TBtn title="Formatierung entfernen" onClick={() => exec("removeFormat")}><IconClearFormat /></TBtn>
        </TGroup>
        {end && <TGroup label="Ansicht" end>{end}</TGroup>}
      </Toolbar>
      <div
        ref={ref}
        className="visual-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        lang="de"
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        onPaste={onPaste}
        onDoubleClick={onDoubleClick}
      />
    </>
  );
}
