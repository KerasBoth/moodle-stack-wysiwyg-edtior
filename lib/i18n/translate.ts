// `translate` über alle Sprachen. Bündelt sämtliche Übersetzungen – für Server und Tests gedacht;
// Client-Code nutzt `lib/i18n/index.ts` bzw. `core.ts` mit `translateWith` und nur den nötigen Sprachen.

import { type Locale } from "./locales.ts";
import { MESSAGES } from "./messages/index.ts";
import { formatDateTime, translateWith } from "./core.ts";
import type { MessageKey, Msg, Params } from "./types.ts";

export * from "./core.ts";

// Plural über params.count
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return translateWith(MESSAGES, locale, key, params);
}

// Meldung mit Schlüssel (z. B. LocalizedError.msg) übersetzen. Der Parameter `date` kommt als ISO-Zeitpunkt
// und wird erst hier in der Sprache des Empfängers formatiert.
export function translateMsg(locale: Locale, msg: Msg): string {
  const params = msg.params && typeof msg.params.date === "string"
    ? { ...msg.params, date: formatDateTime(locale, msg.params.date) }
    : msg.params;
  return translate(locale, msg.key, params);
}
