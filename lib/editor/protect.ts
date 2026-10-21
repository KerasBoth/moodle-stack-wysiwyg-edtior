// Geschützte Konstrukte des Texteditors: Formeln, {@…@}, [[…]], <script> usw. werden zu nicht editierbaren
// Kästchen und beim Zurückschreiben unverändert aus dem Speicher eingesetzt. Reine String-Funktionen ohne DOM.

import { PROTECT_PATTERN, decodeEntities, parseFormula } from "./formula.ts";

// Formeln zuerst (eine Formel mit {@…@} ist ein Kästchen). Kommentare werden mit erkannt, aber unverändert
// durchgereicht. Gleiche Quelle wie splitFormulas.
export const PROTECT_RE = new RegExp(PROTECT_PATTERN, "gi");

/** Marke (Zeichen aus dem privaten Bereich), die beim Zurückschreiben für ein Kästchen steht. */
export const PI_MARK = "";
export const piMark = (index: number) => `${PI_MARK}${index}${PI_MARK}`;
const PI_MARK_RE = new RegExp(`${PI_MARK}(\\d+)${PI_MARK}`, "g");

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function chipFor(original: string, index: number, graphEditable = false): string {
  let kind = "block";
  let label = original;
  let attrs = "";
  let m: RegExpExecArray | null;
  const formula = original.startsWith("\\") ? parseFormula(original) : null;
  if (formula) { kind = "math"; attrs = ` data-kind="${formula.kind}"`; }
  else if ((m = /^\[\[\s*input:(\w+)/.exec(original))) { kind = "input"; label = `⌨ ${m[1]}`; }
  else if ((m = /^\[\[\s*validation:(\w+)/.exec(original))) { kind = "validation"; label = `✎ Validierung ${m[1]}`; }
  else if ((m = /^\[\[\s*feedback:(\w+)/.exec(original))) { kind = "feedback"; label = `✓ Feedback ${m[1]}`; }
  else if (/^\[\[\s*jsxgraph/i.test(original)) { kind = "jsx"; label = graphEditable ? "📈 JSXGraph-Grafik – Doppelklick öffnet den Grafik-Editor" : "📈 JSXGraph-Grafik (im HTML-Modus bearbeiten)"; }
  else if (/^<script/i.test(original)) { kind = "jsx"; label = "‹script› (im HTML-Modus bearbeiten)"; }
  else if (/^<style/i.test(original)) { kind = "jsx"; label = "‹style›"; }
  else if (original.startsWith("{@") || original.startsWith("{#")) { kind = "cas"; label = original; }
  else if (/^\[\[\s*comment/i.test(original)) { kind = "block"; label = "💬 Kommentar"; }
  const title = kind === "cas" ? "Doppelklick zum Bearbeiten" : original.length > 300 ? `${original.slice(0, 300)}…` : original;
  return `<span class="vchip vchip-${kind}" contenteditable="false" data-pi="${index}"${attrs} title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

/** Ersetzt die geschützten Konstrukte durch Kästchen und legt ihren Originaltext in `store` ab. */
export function protect(src: string, store: string[], graphEditable = false): string {
  return src.replace(PROTECT_RE, (m) => {
    if (m.startsWith("<!--")) return m; // Kommentar: unverändert, kein Kästchen
    store.push(m);
    return chipFor(m, store.length - 1, graphEditable);
  });
}

/** Setzt für jede Marke (piMark) den Originaltext aus `store` ein. */
export function restoreProtected(html: string, store: readonly string[]): string {
  return html.replace(PI_MARK_RE, (_, i: string) => store[Number(i)] ?? "");
}

/**
 * Wie restoreProtected, aber für Klartext (Kopieren/Ausschneiden): Formeln werden mit `decode` dekodiert, so wie sie
 * als Text im Editor stünden (eingefügter Text wird beim Speichern wieder kodiert); die übrigen Kästchen geben ihren
 * Originaltext unverändert.
 */
export function restoreProtectedText(text: string, store: readonly string[], decode: (html: string) => string = decodeEntities): string {
  return text.replace(PI_MARK_RE, (_, i: string) => {
    const source = store[Number(i)] ?? "";
    return source.startsWith("\\") && parseFormula(source) ? decode(source) : source;
  });
}
