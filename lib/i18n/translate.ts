// `translate` über alle Sprachen. Bündelt sämtliche Übersetzungen – für Server und Tests gedacht;
// Client-Code nutzt `lib/i18n/index.ts` bzw. `core.ts` mit `translateWith` und nur den nötigen Sprachen.

import { type Locale } from "./locales.ts";
import { MESSAGES } from "./messages/index.ts";
import { translateWith } from "./core.ts";
import type { MessageKey, Params } from "./types.ts";

export * from "./core.ts";

// Plural über params.count
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return translateWith(MESSAGES, locale, key, params);
}
