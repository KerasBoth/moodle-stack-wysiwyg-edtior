// Übersetzungslogik ohne die Texte der Fremdsprachen: Platzhalter, Pluralformen, deutscher Rückfall,
// Datumsformat, LocalizedError. Importiert nur Deutsch, damit Client-Bündel nicht alle Sprachen enthalten.

import { DEFAULT_LOCALE, type Locale } from "./locales.ts";
import de from "./messages/de/index.ts";
import type { MessageKey, Messages, Msg, Params, Plural } from "./types.ts";

export type { MessageKey, Messages, Msg, Params, Plural } from "./types.ts";

// Deutsch ist Pflicht (Rückfall), alle anderen Sprachen dürfen fehlen.
export type MessagesByLocale = { de: Messages } & Partial<Record<Locale, Messages>>;

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralForm(locale: string, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

function lookup(messages: unknown, key: string): unknown {
  let node = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";

// Text eines Blatts; leer oder kein Blatt → undefined
function pick(value: unknown, locale: string, params: Params | undefined): string | undefined {
  if (typeof value === "string") return nonEmpty(value) ? value : undefined;
  if (typeof value !== "object" || value === null) return undefined;
  const plural = value as Plural;
  if (!nonEmpty(plural.other)) return undefined;
  const count = Number(params?.count);
  if (params?.count === undefined || Number.isNaN(count)) return plural.other;
  const text = plural[pluralForm(locale, count) as keyof Plural];
  return nonEmpty(text) ? text : plural.other;
}

// {name} ersetzen; unbekannte Platzhalter bleiben stehen
function interpolate(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : m);
}

// Übersetzen gegen die übergebenen Nachrichten; fehlt die Sprache, der Schlüssel oder ist der Text leer,
// gilt Deutsch, sonst der Schlüssel selbst. Plural über params.count.
export function translateWith(
  messagesByLocale: MessagesByLocale,
  locale: Locale,
  key: MessageKey,
  params?: Params,
): string {
  const text =
    pick(lookup(messagesByLocale[locale], key), locale, params) ??
    pick(lookup(messagesByLocale[DEFAULT_LOCALE], key), DEFAULT_LOCALE, params) ??
    key;
  return interpolate(text, params);
}

// Fehler mit Schlüssel, damit Server/Client die Meldung in der Sprache des Nutzers zeigen können.
// .message bleibt deutsch (Logs, bestehende Tests).
// Achtung: Next ersetzt in Produktion Fehler aus Server Components/Server Actions durch einen Digest;
// .msg/.status kommen nur an, wenn der Fehler abgefangen und z. B. als `{ error }`/`{ msg }` zurückgegeben wird.
export class LocalizedError extends Error {
  msg: Msg;
  status?: number;
  constructor(key: MessageKey, params?: Params, status?: number) {
    super(translateWith({ de }, DEFAULT_LOCALE, key, params));
    this.name = "LocalizedError";
    this.msg = params ? { key, params } : { key };
    if (status !== undefined) this.status = status;
  }
}

// Feste Zeitzone als Vorgabe, damit Server (Rendern) und Browser (Hydration) denselben Text erzeugen.
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

export function formatDate(locale: Locale, d: Date | string | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Date(d).toLocaleDateString(locale, { timeZone });
}

export function formatDateTime(locale: Locale, d: Date | string | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Date(d).toLocaleString(locale, { timeZone });
}
