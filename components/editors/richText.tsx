// Übersetzte Texte mit eingebetteten Elementen (z. B. <code>): Platzhalter {name} durch Knoten ersetzen.

import { Fragment, type ReactNode } from "react";

/** Zerlegt `text` an den Platzhaltern {name} und setzt dort `parts[name]` ein; unbekannte bleiben stehen. */
export function withParts(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/\{(\w+)\}/).map((s, i) =>
    i % 2 === 0 ? s : <Fragment key={i}>{Object.hasOwn(parts, s) ? parts[s] : `{${s}}`}</Fragment>);
}
