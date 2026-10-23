"use client";

// Formel-Editor-Dialog: Bearbeiten in der gesetzten Formel (MathLive), Werkzeugleiste mit aufklappenden Paletten
// (Entwurf C), synchrones LaTeX-Codefeld, Umschalter inline/abgesetzt.
// {@…@}/{#…#} erscheinen als graue Kästchen; Darstellung und Abfangung laut
// docs/superpowers/notes/2026-10-20-mathlive-spike.md

import { useCallback, useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { type Formula, type FormulaKind, casToMathLive, encodeExpr, mathLiveToCas, resolveApply } from "@/lib/editor/formula";
import { useDialogs } from "../Dialogs";
import { Modal } from "../Modal";
import { IconCode, IconDown } from "../icons";
import { DIFFERENTIAL_SHORTCUTS, PALETTES, type PaletteGroup, type PaletteKey, matrixLatex } from "./formulaPalettes";
import { useLocale, useT } from "../I18nProvider";
import type { MessageKey, Msg } from "@/lib/i18n";
import { withParts } from "./richText";

/** Ergebnis von „Übernehmen“ (resolveApply ohne „undecodable“, das bleibt im Dialog). */
export type FormulaApplyResult = { kind: "source"; source: string } | { kind: "empty" };

type LastEdited = "none" | "field" | "code";

const MSG_UNDECODABLE: MessageKey = "formula.errors.undecodable";
const MSG_IN_BOX: MessageKey = "formula.errors.inBox";
const MSG_NOT_IN_MATRIX: MessageKey = "formula.errors.notInMatrix";
const MSG_IN_TEXT: MessageKey = "formula.errors.inText";

/** Beschriftung/Tooltip einer Taste: Symbol bleibt, Msg wird übersetzt. */
function keyText(t: ReturnType<typeof useT>, v: string | Msg): string {
  return typeof v === "string" ? v : t(v);
}

// ---- MathLive einmalig laden -------------------------------------------------------------------------

type MathLiveModule = typeof import("mathlive");
let mathLivePromise: Promise<MathLiveModule> | null = null;
function loadMathLive(): Promise<MathLiveModule> {
  if (!mathLivePromise) {
    mathLivePromise = import("mathlive").then((m) => {
      // Statische Einstellungen vor dem ersten <math-field>: offline, ohne Sounds
      m.MathfieldElement.fontsDirectory = "/vendor/mathlive/fonts";
      m.MathfieldElement.soundsDirectory = null;
      // Sprache der Oberfläche: setzt FormulaEditor (beim Laden und bei jedem Sprachwechsel)
      return m;
    });
    mathLivePromise.catch(() => { mathLivePromise = null; }); // beim nächsten Öffnen erneut versuchen
  }
  return mathLivePromise;
}

// ---- Kästchen: Abfangung beim Tippen (Spike, Abschnitt 2) ---------------------------------------------

/** Cursor im Text eines Kästchens (\texttt im Text-Modus). */
function inBox(mf: MathfieldElement): boolean {
  return mf.mode === "text" && mf.queryStyle({ fontFamily: "monospace" }) === "all";
}

/** Einfügemarke am Anfang eines Kästchens oder Auswahl ab dem Anfang (dort ist MathLive im Mathe-Modus). */
function atBoxStart(mf: MathfieldElement): boolean {
  if (inBox(mf)) return false;
  const next = mf.selectionIsCollapsed ? mf.getValue(mf.position, mf.position + 1, "latex") : mf.getValue(mf.selection, "latex");
  return next.startsWith("\\texttt{");
}

/** Text kodiert ins Kästchen einfügen. */
function putInBox(mf: MathfieldElement, text: string): void {
  mf.insert(`\\texttt{${encodeExpr(text)}}`, { format: "latex", mode: "math" });
}

/**
 * Hängt die Abfangung für Tastatur, Einfügen und Komposition an. `changed` wird nach eigenen Änderungen aufgerufen.
 * Escape: MathLives Belegung (Wechsel in den LaTeX-Modus) ist entfernt, Escape erreicht also den Dialog. Nur im
 * LaTeX-Modus (nach „\“) schließt Escape die Befehlseingabe ab und wird hier vor dem Dialog angehalten.
 */
function attachBoxInterception(mf: MathfieldElement, changed: () => void): () => void {
  const timers = new Set<number>();
  let escapeInLatexMode = false;
  // Beobachtung zwischen compositionend und der Korrektur (siehe unten)
  const composeWatch = { interfered: false, inputs: 0 };

  const onKeydownCapture = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") escapeInLatexMode = mf.mode === "latex";
    composeWatch.interfered = true;
    const shortcut = (ev.ctrlKey || ev.metaKey || ev.altKey) && !ev.getModifierState("AltGraph");
    if (shortcut || ev.isComposing || [...ev.key].length !== 1 || !atBoxStart(mf)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    putInBox(mf, ev.key);
    changed();
  };
  const onKeydownBubble = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && escapeInLatexMode) ev.stopPropagation();
  };
  const onBeforeInput = (ev: InputEvent) => {
    if (ev.inputType !== "insertText" || !ev.data || [...ev.data].length !== 1) return;
    if (inBox(mf) ? /^[A-Za-z0-9 ]$/.test(ev.data) : !atBoxStart(mf)) return;
    ev.preventDefault();
    putInBox(mf, ev.data);
    changed();
  };
  const onPaste = (ev: ClipboardEvent) => {
    composeWatch.interfered = true;
    const text = ev.clipboardData?.getData("text/plain");
    if (!text || !(inBox(mf) || atBoxStart(mf))) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    putInBox(mf, text);
    changed();
  };

  // Tottasten/IME am Kästchenanfang: MathLive fügt das Zeichen über simulierte Tastendrücke ein (am Anfang wird so
  // z. B. aus "^" ein Exponent). Danach wird der Zustand vor der Komposition wiederhergestellt und kodiert eingefügt –
  // aber nur, wenn sich seit compositionend nichts anderes geändert hat: Zustand bei compositionend gleich dem beim
  // Start, danach keine Taste, kein Einfügen, keine neue Komposition und höchstens so viele Eingaben wie Zeichen.
  let composeAtStart: { latex: string; pos: number } | null = null;
  const onCompositionStart = () => {
    composeWatch.interfered = true;
    composeAtStart = atBoxStart(mf) && mf.selectionIsCollapsed ? { latex: mf.getValue("latex"), pos: mf.position } : null;
  };
  const onCompositionEnd = (ev: CompositionEvent) => {
    const saved = composeAtStart;
    composeAtStart = null;
    if (!saved || !ev.data) return;
    if (mf.getValue("latex") !== saved.latex) return; // während der Komposition geändert: nichts anfassen
    const data = ev.data;
    composeWatch.interfered = false;
    composeWatch.inputs = 0;
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (composeWatch.interfered || composeWatch.inputs > [...data].length) return;
      mf.value = saved.latex;
      mf.position = saved.pos;
      putInBox(mf, data);
      changed();
    }, 0);
    timers.add(timer);
  };
  const onInput = () => { composeWatch.inputs++; };

  mf.addEventListener("keydown", onKeydownCapture, true);
  mf.addEventListener("keydown", onKeydownBubble);
  mf.addEventListener("beforeinput", onBeforeInput);
  mf.addEventListener("paste", onPaste);
  mf.addEventListener("compositionstart", onCompositionStart, true);
  mf.addEventListener("compositionend", onCompositionEnd, true);
  mf.addEventListener("input", onInput);
  return () => {
    mf.removeEventListener("keydown", onKeydownCapture, true);
    mf.removeEventListener("keydown", onKeydownBubble);
    mf.removeEventListener("beforeinput", onBeforeInput);
    mf.removeEventListener("paste", onPaste);
    mf.removeEventListener("compositionstart", onCompositionStart, true);
    mf.removeEventListener("compositionend", onCompositionEnd, true);
    mf.removeEventListener("input", onInput);
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };
}

/**
 * Cursor in einer Matrix? MathLive hat dafür keine öffentliche API; außerhalb einer Matrix machen addRowBefore & Co.
 * aus der ganzen Formel ein \displaylines. Deshalb ein Blick ins interne Modell; fehlt es, gilt: nicht in einer Matrix.
 */
function inMatrix(mf: MathfieldElement): boolean {
  const internal = mf as unknown as { _mathfield?: { model?: { parentEnvironment?: { environmentName?: string } } } };
  return /matrix\*?$/.test(internal._mathfield?.model?.parentEnvironment?.environmentName ?? "");
}

/** Neues Kästchen einfügen und „expr“ markieren: Das erste getippte Zeichen ersetzt es (Spike, „Neues Kästchen“). */
function insertCasBox(mf: MathfieldElement, cas: string): void {
  const start = mf.selectionIsCollapsed ? mf.position : Math.min(...mf.selection.ranges[0]);
  mf.insert(casToMathLive(cas)!, { format: "latex", mode: "math", selectionMode: "after", focus: true });
  const end = mf.position;
  let first = -1;
  let last = -1;
  for (let p = start; p <= end; p++) {
    mf.position = p;
    if (mf.mode === "text") {
      if (first < 0) first = p;
      last = p;
    }
  }
  if (first > 0) mf.selection = { ranges: [[first - 1, last]] };
  else mf.position = end;
}

// ---- Dialog -------------------------------------------------------------------------------------------

export default function FormulaEditor({ initial, onApply, onClose }: { initial: Formula | null; onApply: (result: FormulaApplyResult) => void; onClose: () => void }) {
  const dialogs = useDialogs();
  const t = useT();
  const locale = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [code, setCode] = useState(initial?.tex ?? "");
  const [kind, setKind] = useState<FormulaKind>(initial?.kind ?? "inline");
  // Code, den MathLive nicht darstellen kann (Kollisionsschutz, Kästchen in Text): nur im Codefeld bearbeiten
  const fieldBlocked = casToMathLive(code) === null;
  // Einmal nötig gewordenes Codefeld bleibt offen (sonst verschwindet es mitten im Tippen, sobald der Code darstellbar wird)
  const [showCode, setShowCode] = useState(fieldBlocked);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [fieldUnreadable, setFieldUnreadable] = useState(false);
  const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");

  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const lastEdited = useRef<LastEdited>("none");
  // Zuletzt gesehene MathLive-Ausgabe: Nur eine echte Änderung zählt als Bearbeitung in der Formel.
  const lastFieldLatex = useRef("");
  const codeRef = useRef(code);
  codeRef.current = code;
  const groupBtns = useRef(new Map<string, HTMLButtonElement>());

  /** Feld → Code. */
  const syncFromField = useCallback(() => {
    const mf = mfRef.current;
    if (!mf) return;
    const latex = mf.getValue("latex");
    if (latex === lastFieldLatex.current) return;
    lastFieldLatex.current = latex;
    lastEdited.current = "field";
    setError(null);
    const cas = mathLiveToCas(latex);
    setFieldUnreadable(cas === null);
    if (cas !== null) setCode(cas); // sonst bleibt der letzte gültige Code stehen
  }, []);

  /** Code → Feld (ohne Benachrichtigung, also ohne Rückweg). */
  const setFieldFromCode = (tex: string) => {
    const mf = mfRef.current;
    const ml = casToMathLive(tex);
    if (!mf || ml === null) return;
    // mode "math": sonst liest MathLive den Code im Modus der Einfügemarke, im Kästchen also als Text
    mf.setValue(ml, { silenceNotifications: true, mode: "math" });
    lastFieldLatex.current = mf.getValue("latex");
  };

  // MathLive laden und das <math-field> anlegen. Je Effektlauf genau ein Element mit eigenen Listenern
  // (StrictMode: der erste Lauf wird vor dem Laden verworfen bzw. vollständig abgebaut).
  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | undefined;
    let mf: MathfieldElement | undefined;
    loadMathLive().then(({ MathfieldElement }) => {
      const host = hostRef.current;
      if (disposed || !host) return;
      MathfieldElement.locale = localeRef.current;
      mf = new MathfieldElement();
      mf.mathVirtualKeyboardPolicy = "manual";
      host.appendChild(mf);
      mf.menuItems = []; // kein Kontextmenü (es böte u. a. Schreibmaschinenschrift = Kästchen-Konstrukt)
      mf.keybindings = mf.keybindings.filter((kb) => !(kb.key === "[Escape]" && kb.ifMode !== "latex"));
      mf.inlineShortcuts = { ...mf.inlineShortcuts, ...DIFFERENTIAL_SHORTCUTS };
      const ml = casToMathLive(codeRef.current);
      if (ml !== null) mf.setValue(ml, { silenceNotifications: true, mode: "math" });
      lastFieldLatex.current = mf.getValue("latex");
      mf.addEventListener("input", syncFromField);
      const detachBox = attachBoxInterception(mf, syncFromField);
      const field = mf;
      detach = () => { field.removeEventListener("input", syncFromField); detachBox(); };
      mfRef.current = mf;
      setLoad("ready");
      if (ml !== null) mf.focus();
    }, () => {
      if (!disposed) { setLoad("failed"); setShowCode(true); }
    });
    return () => {
      disposed = true;
      detach?.();
      mf?.remove();
      if (mfRef.current === mf) mfRef.current = null;
    };
  }, [syncFromField]);

  // Sprachwechsel bei offenem Dialog: MathLive (Tooltips, Menüs, Sprachausgabe) mitziehen
  useEffect(() => {
    if (load !== "ready") return;
    loadMathLive().then(({ MathfieldElement }) => { MathfieldElement.locale = locale; }, () => {});
  }, [locale, load]);

  // Palette schließen, wenn außerhalb geklickt wird
  useEffect(() => {
    if (!openGroup) return;
    const h = (e: MouseEvent) => {
      const btn = groupBtns.current.get(openGroup);
      const group = btn?.parentElement;
      if (group && e.target instanceof Node && !group.contains(e.target)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openGroup]);

  const closePalette = (refocus: boolean) => {
    const id = openGroup;
    setOpenGroup(null);
    if (refocus && id) groupBtns.current.get(id)?.focus();
  };

  // Escape bzw. Klick neben den Dialog: erst eine offene Palette schließen, dann den Dialog
  const handleClose = () => {
    if (openGroup) { closePalette(true); return; }
    onClose();
  };

  const pick = async (key: PaletteKey) => {
    closePalette(false);
    const mf = mfRef.current;
    if (!mf) return;
    if (inBox(mf)) { setError(MSG_IN_BOX); mf.focus(); return; }
    if (key.special === "cas") {
      if (mf.mode !== "math") { setError(MSG_IN_TEXT); mf.focus(); return; }
      insertCasBox(mf, key.latex);
    } else if (key.special === "matrix") {
      const size = await dialogs.form({
        title: t("formula.matrixDialog.title"),
        fields: [{ name: "rows", label: t("formula.matrixDialog.rows"), initial: "2" }, { name: "cols", label: t("formula.matrixDialog.cols"), initial: "2" }],
        confirmLabel: t("formula.matrixDialog.insert"),
        validate: (v) => [v.rows, v.cols].every((x) => /^\s*\d+\s*$/.test(x) && +x >= 1 && +x <= 10) ? null : t("formula.matrixDialog.invalid"),
      });
      if (mfRef.current !== mf) return; // Dialog inzwischen geschlossen
      if (size) mf.insert(matrixLatex(key.latex, +size.rows, +size.cols), { format: "latex", mode: "math", selectionMode: "placeholder", focus: true });
    } else if (key.command) {
      if (!inMatrix(mf)) { setError(MSG_NOT_IN_MATRIX); mf.focus(); return; }
      mf.executeCommand(key.command);
    } else {
      mf.executeCommand(["insert", key.latex, { format: "latex", mode: "math", focus: true, selectionMode: "placeholder" }]);
    }
    mf.focus();
    syncFromField();
  };

  const onCodeChange = (value: string) => {
    setCode(value);
    lastEdited.current = "code";
    setError(null);
    setFieldUnreadable(false);
    if (casToMathLive(value) === null) setShowCode(true);
    setFieldFromCode(value); // nicht darstellbarer Code bleibt nur im Textfeld stehen
  };

  const apply = () => {
    // MathLive meldet Eingaben im Text-Modus teils verzögert: den aktuellen Stand des Feldes jetzt übernehmen
    syncFromField();
    const mf = mfRef.current;
    const result = resolveApply({ original: initial, kind, lastEdited: lastEdited.current, code, fieldLatex: mf ? mf.getValue("latex") : "" });
    if (result.kind === "undecodable") {
      // Codefeld mit dem letzten gültigen Code zeigen; die Formel wieder auf diesen Stand bringen
      setError(MSG_UNDECODABLE);
      setShowCode(true);
      setFieldFromCode(code);
      lastEdited.current = "code";
      setFieldUnreadable(false);
      return;
    }
    onApply(result);
  };

  const codeVisible = showCode || fieldBlocked || load === "failed";
  const toolsDisabled = load !== "ready" || fieldBlocked;

  return (
    <Modal className="formula-editor" wide title={initial ? t("formula.editTitle") : t("formula.insertTitle")} onClose={handleClose}>
      <div className="fe-toolbar" role="toolbar" aria-label={t("formula.toolbar")}>
        {PALETTES.map((g) => (
          <div className="fe-group" key={g.id}>
            <button
              type="button"
              ref={(el) => { if (el) groupBtns.current.set(g.id, el); else groupBtns.current.delete(g.id); }}
              className={`fe-gbtn${openGroup === g.id ? " on" : ""}`}
              title={t(g.label)}
              aria-haspopup="true"
              aria-expanded={openGroup === g.id}
              disabled={toolsDisabled}
              onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
              onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpenGroup(g.id); } }}
            >
              <span className="fe-gicon">{g.icon}</span>
              <span className="fe-glabel">{t(g.label)}</span>
              <IconDown />
            </button>
            {openGroup === g.id && <Palette group={g} onPick={pick} onLeave={() => closePalette(false)} />}
          </div>
        ))}
      </div>

      <div className="fe-field" hidden={fieldBlocked || load === "failed"}>
        <div className="fe-mf" ref={hostRef} />
        {load === "loading" && <span className="fe-loading">{t("formula.loading")}</span>}
      </div>
      {fieldBlocked && (
        <div className="issue info">{withParts(t("formula.codeOnly"), {
          texttt: <code>\texttt</code>,
          bbox: <code>\bbox</code>,
          text: <code>\text{"{…}"}</code>,
        })}</div>
      )}
      {load === "failed" && !fieldBlocked && (
        <div className="issue warning">{t("formula.loadFailed")}</div>
      )}
      {fieldUnreadable && !error && (
        <div className="issue warning">{t("formula.boxUnreadable")}</div>
      )}

      <div className="fe-coderow">
        <button type="button" className="btn small" aria-pressed={codeVisible} disabled={fieldBlocked || load === "failed"} onClick={() => setShowCode(!showCode)}>
          <IconCode /> ‹/› {t("formula.latexCode")}
        </button>
      </div>
      {codeVisible && (
        <textarea
          className="inp mono fe-code"
          aria-label={t("formula.latexCode")}
          rows={3}
          spellCheck={false}
          autoFocus={fieldBlocked || load === "failed"}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
        />
      )}
      {error && <div className="issue error fe-error">{t(error)}</div>}

      <div className="fe-foot">
        <div className="fe-kind" role="group" aria-label={t("formula.kind")}>
          <button type="button" className="btn small" aria-pressed={kind === "inline"} onClick={() => setKind("inline")}>{t("formula.inline")} {"\\( \\)"}</button>
          <button type="button" className="btn small" aria-pressed={kind === "display"} onClick={() => setKind("display")}>{t("formula.display")} {"\\[ \\]"}</button>
        </div>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button type="button" className="btn primary" onClick={apply}>{t("common.apply")}</button>
      </div>
    </Modal>
  );
}

// ---- Palette ------------------------------------------------------------------------------------------

/** Tasten einer Gruppe als Raster; Pfeiltasten bewegen den Fokus, Enter/Leertaste wählen. */
function Palette({ group, onPick, onLeave }: { group: PaletteGroup; onPick: (key: PaletteKey) => void; onLeave: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const cols = group.keys.length > 24 ? 9 : 6;

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    let next: number | undefined;
    if (e.key in step) next = i + step[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    if (next === undefined) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, next))].focus();
  };

  return (
    <div
      className="fe-palette"
      ref={ref}
      role="group"
      aria-label={t(group.label)}
      style={{ gridTemplateColumns: `repeat(${Math.min(cols, group.keys.length)}, auto)` }}
      onKeyDown={onKeyDown}
      // Fokus verlässt die Palette (Tab): schließen. Ohne neues Fokusziel (Safari/Firefox auf macOS fokussieren
      // Knöpfe beim Klick nicht) nicht schließen, sonst ginge der Klick verloren; Klicks daneben schließt der mousedown-Listener.
      onBlur={(e) => { if (e.relatedTarget instanceof Node && !e.currentTarget.parentElement?.contains(e.relatedTarget)) onLeave(); }}
    >
      {group.keys.map((k, i) => (
        <button key={i} type="button" className={`fe-key${k.command ? " cmd" : ""}`} title={keyText(t, k.title)} aria-label={keyText(t, k.title)} onClick={() => onPick(k)}>
          {keyText(t, k.label)}
        </button>
      ))}
    </div>
  );
}
