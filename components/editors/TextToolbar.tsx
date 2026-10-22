"use client";

// Gemeinsame Bausteine für die Werkzeugleiste der CASText-Editoren (HTML- und Text-Modus):
// gruppierte Buttons, Einfüge-Menüs für Eingaben/Feedback mit Nutzungsstatus und eine Fußzeile.

import { useEffect, useRef, useState } from "react";
import { useT } from "../I18nProvider";
import { IconCheck, IconDown, IconInput, IconTree } from "../icons";

/** Fügt STACK-Platzhalter (z. B. ["[[input:ans1]]", "[[validation:ans1]]"]) in den aktiven Editor ein. */
export type InsertTokens = (tokens: string[]) => void;

export interface PlaceholderInfo {
  inputs: { name: string; type: string }[];
  prts: string[];
  /** Weiterer Text, dessen Platzhalter ebenfalls zählen (Fragetext und spezifisches Feedback ergänzen sich). */
  otherText?: string;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="tbar" role="toolbar">{children}</div>;
}

export function TGroup({ label, children, end }: { label: string; children: React.ReactNode; end?: boolean }) {
  return <div className={`tgroup${end ? " end" : ""}`} role="group" aria-label={label}>{children}</div>;
}

export function TBtn({ title, onClick, active, children, wide }: {
  title: string; onClick: () => void; active?: boolean; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <button type="button" className={`tb${active ? " on" : ""}${wide ? " wide" : ""}`} title={title} aria-label={title} aria-pressed={active}
      // Fokus und Markierung im Editor behalten
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

/** Aufklappmenü in der Werkzeugleiste. */
export function TMenu({ label, icon, badge, children, align = "left" }: {
  label: string; icon?: React.ReactNode; badge?: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="tmenu" ref={ref}>
      <button type="button" className={`tb menu-btn${open ? " on" : ""}`} aria-expanded={open} aria-haspopup="menu"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {icon}{label}{badge}<IconDown className="caret" />
      </button>
      {open && <div className={`tmenu-pop ${align}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

function usedSet(text: string, kind: "input" | "feedback"): Set<string> {
  const re = kind === "input" ? /\[\[\s*input:(\w+)\s*\]\]/g : /\[\[\s*feedback:(\w+)\s*\]\]/g;
  return new Set([...text.matchAll(re)].map((m) => m[1]));
}

/** Menüs „Eingabe“ und „Feedback“: zeigen, welche Platzhalter im Text schon vorkommen. */
export function PlaceholderMenus({ info, text, insert }: { info: PlaceholderInfo; text: string; insert: InsertTokens }) {
  const t = useT();
  const usedIn = usedSet(text + (info.otherText ?? ""), "input");
  const usedFb = usedSet(text + (info.otherText ?? ""), "feedback");
  const inputs = [...info.inputs].sort((a, b) => natural(a.name, b.name));
  const prts = [...info.prts].sort(natural);
  const missIn = inputs.filter((i) => !usedIn.has(i.name)).length;
  const missFb = prts.filter((p) => !usedFb.has(p)).length;
  return (
    <>
      {inputs.length > 0 && (
        <TMenu label={t("editor.toolbar.input")} icon={<IconInput />} badge={missIn > 0 && <span className="tcount" title={t("editor.toolbar.notInText", { count: missIn })}>{missIn}</span>}>
          {(close) => (
            <>
              <div className="tmenu-head">{t("editor.toolbar.insertInputHead")}</div>
              {inputs.map((i) => (
                <button key={i.name} type="button" role="menuitem" className="tmenu-item" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { insert([`[[input:${i.name}]]`, `[[validation:${i.name}]]`]); close(); }}>
                  <span className="tok tok-input">{i.name}</span>
                  <span className="tmenu-sub">{i.type}</span>
                  {usedIn.has(i.name) ? <span className="state ok"><IconCheck /> {t("editor.toolbar.used")}</span> : <span className="state miss">{t("editor.toolbar.missing")}</span>}
                </button>
              ))}
            </>
          )}
        </TMenu>
      )}
      {prts.length > 0 && (
        <TMenu label={t("editor.toolbar.feedback")} icon={<IconTree />} badge={missFb > 0 && <span className="tcount" title={t("editor.toolbar.notInText", { count: missFb })}>{missFb}</span>}>
          {(close) => (
            <>
              <div className="tmenu-head">{t("editor.toolbar.insertFeedbackHead")}</div>
              {prts.map((p) => (
                <button key={p} type="button" role="menuitem" className="tmenu-item" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { insert([`[[feedback:${p}]]`]); close(); }}>
                  <span className="tok tok-feedback">{p}</span>
                  <span className="tmenu-sub" />
                  {usedFb.has(p) ? <span className="state ok"><IconCheck /> {t("editor.toolbar.used")}</span> : <span className="state miss">{t("editor.toolbar.missing")}</span>}
                </button>
              ))}
            </>
          )}
        </TMenu>
      )}
    </>
  );
}

/** Fußzeile: Farblegende und Platzhalter, die im Text noch fehlen (per Klick einfügen). */
export function EditorFooter({ info, text, insert, legend = true }: { info: PlaceholderInfo; text: string; insert: InsertTokens; legend?: boolean }) {
  const t = useT();
  const usedIn = usedSet(text + (info.otherText ?? ""), "input");
  const usedFb = usedSet(text + (info.otherText ?? ""), "feedback");
  const missIn = info.inputs.map((i) => i.name).filter((n) => !usedIn.has(n)).sort(natural);
  const missFb = info.prts.filter((p) => !usedFb.has(p)).sort(natural);
  if (!legend && !missIn.length && !missFb.length) return null;
  return (
    <div className="tfoot">
      {legend && (
        <div className="legend" aria-label={t("editor.toolbar.legend")}>
          <span><i className="sw sw-input" />{t("editor.toolbar.legendInput")}</span>
          <span><i className="sw sw-feedback" />{t("editor.toolbar.legendFeedback")}</span>
          <span><i className="sw sw-expr" />{t("editor.toolbar.legendExpr")}</span>
          <span><i className="sw sw-math" />{t("editor.toolbar.legendMath")}</span>
          <span><i className="sw sw-block" />{t("editor.toolbar.legendBlock")}</span>
        </div>
      )}
      {missIn.length + missFb.length > 0 ? (
        <div className="missing">
          <span className="missing-label">{t("editor.toolbar.notPlaced")}</span>
          {missIn.map((n) => (
            <button key={`i-${n}`} type="button" className="tok tok-input add" title={t("editor.toolbar.insertAtCursor", { tokens: `[[input:${n}]] [[validation:${n}]]` })}
              onMouseDown={(e) => e.preventDefault()} onClick={() => insert([`[[input:${n}]]`, `[[validation:${n}]]`])}>+ {n}</button>
          ))}
          {missFb.map((n) => (
            <button key={`f-${n}`} type="button" className="tok tok-feedback add" title={t("editor.toolbar.insertAtCursor", { tokens: `[[feedback:${n}]]` })}
              onMouseDown={(e) => e.preventDefault()} onClick={() => insert([`[[feedback:${n}]]`])}>+ {n}</button>
          ))}
        </div>
      ) : (info.inputs.length + info.prts.length > 0 && <div className="missing complete"><IconCheck /> {t("editor.toolbar.allPlaced")}</div>)}
    </div>
  );
}
