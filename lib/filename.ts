// Dateinamen aus Aufgabentiteln – ohne Server-Importe, damit auch der Client sie nutzen kann.

/** Dateiname für eine Aufgabe: Sonderzeichen entfernen, Leerraum zu `-`, Endung `.xml`. Leerer Titel → `stack-aufgabe.xml`. */
export function fileNameFromTitle(title: string): string {
  const base = title.replace(/[^\wäöüÄÖÜß() -]+/g, "").trim().replace(/\s+/g, "-").replace(/-{2,}/g, "-")
    .slice(0, 120).replace(/^-+|-+$/g, "");
  return `${base || "stack-aufgabe"}.xml`;
}

/**
 * Gespeicherter Platzhalter für eine Aufgabe ohne Namen in der Liste der Aufgabennamen einer Datei (Datenbank).
 * Der Wert bleibt in jeder Sprache gleich; erst die Anzeige übersetzt ihn (`editor.sidebar.unnamed`).
 */
export const UNNAMED_QUESTION = "(ohne Namen)";

/** Nummerierter Name: `numberedName("kurve.xml", 2)` → `kurve-2.xml`. */
export function numberedName(name: string, n: number): string {
  const m = /^(.*?)(\.xml)?$/i.exec(name)!;
  return `${m[1]}-${n}${m[2] ?? ""}`;
}
