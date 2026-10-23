// Öffentliche i18n-Schnittstelle ohne Server-Code, client-tauglich: enthält nur die deutschen Texte.
// `translate` (alle Sprachen gebündelt) liegt bewusst in `lib/i18n/translate.ts`, alle Übersetzungen
// in `lib/i18n/messages/index.ts` – beides nicht von hier importieren, wo das Client-Bündel klein bleiben soll.

export {
  DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale, negotiateLocale, parseLocale,
} from "./locales.ts";
export {
  DEFAULT_TIME_ZONE, LocalizedError, type MessageKey, type Messages, type MessagesByLocale, type Msg, type Params,
  type ParamValue, type Plural, type Translator, asMsg, errorMsg, formatDate, formatDateTime, germanT, isMsg, textMsg,
  translateWith,
} from "./core.ts";
