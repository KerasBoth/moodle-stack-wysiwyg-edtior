// Öffentliche i18n-Schnittstelle ohne Server-Code (für Client und Server).

export {
  DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale, negotiateLocale, parseLocale,
} from "./locales.ts";
export {
  LocalizedError, type MessageKey, type Messages, type Msg, type Params, type Plural,
  formatDate, formatDateTime, translate,
} from "./translate.ts";
