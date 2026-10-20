// Ansicht der Formel-Kästchen im Texteditor: gesetzt (MathJax) oder LaTeX-Code. Eine Einstellung für alle Editoren der
// Seite, gespeichert im localStorage.

import { useSyncExternalStore } from "react";

export type FormulaView = "rendered" | "latex";

const KEY = "stack-editor-formula-view";
const listeners = new Set<() => void>();
let current: FormulaView | null = null;

function read(): FormulaView {
  if (current === null) {
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEY); } catch { /* ignorieren */ }
    current = stored === "latex" ? "latex" : "rendered";
  }
  return current;
}

function setFormulaView(v: FormulaView) {
  if (v === read()) return;
  current = v;
  try { localStorage.setItem(KEY, v); } catch { /* ignorieren */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useFormulaView(): [FormulaView, (v: FormulaView) => void] {
  return [useSyncExternalStore(subscribe, read, () => "rendered"), setFormulaView];
}
