"use client";

// Tab-Leiste mit Mehrfachauswahl (für Rückmeldebäume und Eingaben):
// Klick öffnet nur diesen Eintrag, Häkchen oder Strg-Klick schaltet ihn dazu, Umschalt-Klick wählt einen Bereich.

import { useRef, useState } from "react";

export interface TabItem {
  name: string;
  /** zweite Zeile im Tab, z. B. verwendete Eingaben oder der Eingabetyp */
  sub: string;
  warn?: boolean;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Geöffnete Einträge; ungültige werden verworfen, ohne Auswahl ist der erste (natürlich sortiert) geöffnet. */
export function useTabSelection(names: string[]): [string[], (names: string[]) => void] {
  const [raw, setRaw] = useState<string[]>([]);
  const open = raw.filter((n) => names.includes(n));
  if (!open.length && names.length) open.push([...names].sort(natural)[0]);
  return [open, setRaw];
}

export default function ItemTabs({ items, open, setOpen, label }: {
  items: TabItem[];
  open: string[];
  setOpen: (names: string[]) => void;
  /** z. B. „Rückmeldebäume“ – für Screenreader und Hinweise */
  label: string;
}) {
  const anchor = useRef<string | null>(null);
  const sorted = [...items].sort((a, b) => natural(a.name, b.name));
  const names = sorted.map((i) => i.name);
  const toggle = (name: string) => {
    const next = open.includes(name) ? open.filter((n) => n !== name) : [...open, name];
    if (next.length) setOpen(next);
    anchor.current = name;
  };
  const click = (e: React.MouseEvent, name: string) => {
    if (e.shiftKey && anchor.current && names.includes(anchor.current)) {
      const [a, b] = [names.indexOf(anchor.current), names.indexOf(name)].sort((x, y) => x - y);
      setOpen(names.slice(a, b + 1));
    } else if (e.ctrlKey || e.metaKey) {
      toggle(name);
    } else {
      setOpen([name]);
      anchor.current = name;
    }
  };
  const all = open.length === names.length;
  return (
    <div className="prt-tabs-wrap">
      <div className="prt-tabs" role="tablist" aria-multiselectable="true" aria-label={label}>
        {sorted.map((it) => {
          const on = open.includes(it.name);
          return (
            <div key={it.name} className={`prt-tab${on ? " on" : ""}`}>
              <input type="checkbox" className="prt-tab-check" checked={on} onChange={() => toggle(it.name)}
                aria-label={`${it.name} zusätzlich öffnen`} title="Zusätzlich öffnen (Mehrfachauswahl)" />
              <button type="button" role="tab" aria-selected={on} className="prt-tab-btn" onClick={(e) => click(e, it.name)}
                title={`${it.name} öffnen – Strg+Klick: dazunehmen, Umschalt+Klick: Bereich`}>
                <span className="prt-tab-name">{it.name}</span>
                <span className={`prt-tab-sub${it.warn ? " warn" : ""}`}>{it.sub}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="prt-tabs-actions">
        <span className="prt-tabs-count">{open.length} von {names.length} geöffnet</span>
        <button type="button" className="btn small" onClick={() => setOpen(all ? [names[0]] : names)}>{all ? "Auswahl zurücksetzen" : "Alle öffnen"}</button>
      </div>
    </div>
  );
}
