// Gemeinsamer, veränderlicher Kontext für alle Editoren (Variablen, Eingaben …).
// Wird von der App bei jeder Vorschau-Berechnung aktualisiert und von den
// CodeMirror-Erweiterungen bei Bedarf gelesen.

import type { EditorView } from "@codemirror/view";

export interface VariableInfo {
  name: string;
  value: string;
}

export interface EditorContextData {
  variables: VariableInfo[];
  /** Namen benutzerdefinierter Funktionen (f(x) := …) */
  functions: string[];
  inputs: string[];
  prts: string[];
}

export const editorContext: { current: EditorContextData; lastFocused: EditorView | null } = {
  current: { variables: [], functions: [], inputs: [], prts: [] },
  lastFocused: null,
};

/** Fügt Text in den zuletzt fokussierten Editor ein (z. B. aus dem Referenzpanel). */
export function insertIntoLastEditor(text: string): boolean {
  const view = editorContext.lastFocused;
  if (!view || !view.dom.isConnected) return false;
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
