// Sprache der Anfrage für Server Components, generateMetadata und Route Handler (nur serverseitig).

import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, type Locale, negotiateLocale } from "./locales.ts";
import { MESSAGES } from "./messages/index.ts";
import { translate } from "./translate.ts";
import type { MessageKey, Messages, Params } from "./types.ts";

// Cookie zuerst, sonst Accept-Language, sonst Deutsch
export async function getLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
}

export async function getT(): Promise<(key: MessageKey, params?: Params) => string> {
  const locale = await getLocale();
  return (key, params) => translate(locale, key, params);
}

// Texte einer Sprache, z. B. für den I18nProvider (nur die aktive Sprache geht an den Client)
export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
