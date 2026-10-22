"use client";

// Maxima-Ausdrucksfeld mit Auswahlliste: definierte Werte (Eingaben, Variablen …) per Klick übernehmen,
// freier Text bleibt jederzeit möglich.

import { useEffect, useRef, useState } from "react";
import { useT } from "../I18nProvider";
import { IconCheck, IconDown } from "../icons";
import { MaximaEditor } from "./CodeEditors";

export interface ValueOption {
  value: string;
  /** Zusatzinfo rechts, z. B. Eingabetyp oder aktueller Wert. */
  detail?: string;
}
export interface ValueGroup {
  label: string;
  options: ValueOption[];
}

export default function ValueField({ value, onChange, groups, placeholder, label, align = "left" }: {
  value: string; onChange: (v: string) => void; groups: ValueGroup[]; placeholder?: string; label: string;
  /** Richtung, in die die Liste aufklappt (rechts stehende Felder: "right"). */
  align?: "left" | "right";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const f = filter.trim().toLowerCase();
  const visible = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !f || o.value.toLowerCase().includes(f) || o.detail?.toLowerCase().includes(f)) }))
    .filter((g) => g.options.length);
  const total = groups.reduce((n, g) => n + g.options.length, 0);
  const pick = (v: string) => { onChange(v); setOpen(false); setFilter(""); };

  return (
    <div className="value-field" ref={ref}>
      <div className="value-field-row">
        <div className="value-field-editor"><MaximaEditor mode="expr" value={value} onChange={onChange} placeholder={placeholder} /></div>
        <button type="button" className={`value-field-btn${open ? " on" : ""}`} aria-haspopup="listbox" aria-expanded={open}
          disabled={!total} title={total ? t("editor.valueField.pick", { label }) : t("editor.valueField.noValues")}
          onClick={() => setOpen(!open)}>
          <IconDown />
        </button>
      </div>
      {open && (
        <div className={`tmenu-pop value-pop ${align}`} role="listbox" aria-label={label}>
          {total > 6 && (
            <input ref={search} className="inp value-search" placeholder={t("editor.valueField.filter")} value={filter} onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && visible[0]) { e.preventDefault(); pick(visible[0].options[0].value); } }} />
          )}
          {visible.map((g) => (
            <div key={g.label}>
              <div className="tmenu-head">{g.label}</div>
              {g.options.map((o) => (
                <button key={`${g.label}-${o.value}`} type="button" role="option" aria-selected={o.value === value.trim()}
                  className="tmenu-item value-item" onClick={() => pick(o.value)}>
                  <span className="value-name">{o.value}</span>
                  <span className="tmenu-sub" title={o.detail}>{o.detail}</span>
                  {o.value === value.trim() ? <span className="state ok"><IconCheck /></span> : <span />}
                </button>
              ))}
            </div>
          ))}
          {!visible.length && <div className="tmenu-head">{t("editor.valueField.noMatches")}</div>}
        </div>
      )}
    </div>
  );
}

/** Namen der Zuweisungen `name: …` in Maxima-Code (ohne Funktionsdefinitionen `f(x) := …`). */
export function assignedNames(code: string): string[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const out: string[] = [];
  for (const m of clean.matchAll(/(?:^|[;$])\s*([A-Za-z_%][A-Za-z0-9_]*)\s*:(?!=)/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
