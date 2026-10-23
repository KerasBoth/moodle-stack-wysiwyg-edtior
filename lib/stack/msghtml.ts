// Meldungen im Vorschau-HTML: Die Bibliothek setzt eine Marke statt des Textes, die Oberfläche ersetzt sie
// beim Anzeigen durch den übersetzten Text. So muss die Vorschau beim Umschalten der Sprache nicht neu
// berechnet werden. Die Marke übersteht escapeHtml und ist in Text und Attributwerten erlaubt.

import { type Msg, type Translator, germanT, isMsg } from "../i18n/index.ts";

const OPEN = "⟦msg:";
const CLOSE = "⟧";
const MARK_RE = /⟦msg:([^⟧\s<>"&]*)⟧/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Marke für eine Meldung im HTML (Text oder Attributwert). */
export function msgHtml(m: Msg): string {
  return `${OPEN}${encodeURIComponent(JSON.stringify(m))}${CLOSE}`;
}

/** Ersetzt alle Marken durch den übersetzten, HTML-maskierten Text. */
export function localizeHtml(html: string, t: Translator = germanT): string {
  if (!html.includes(OPEN)) return html;
  return html.replace(MARK_RE, (all, code: string) => {
    try {
      const m: unknown = JSON.parse(decodeURIComponent(code));
      return isMsg(m) ? escapeHtml(t(m)) : all;
    } catch {
      return all;
    }
  });
}
