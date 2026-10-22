// Unterstützte Oberflächensprachen und die Wahl der Sprache aus Cookie bzw. Accept-Language.
// Bewusst ohne React/Next, damit Server, Client und Tests das Modul gleichermaßen nutzen.

export const LOCALES = ["de", "en", "fr", "es", "it", "sk"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "stack-editor-lang";

// Anzeige im Umschalter, jeweils in der eigenen Sprache
export const LOCALE_NAMES: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  sk: "Slovenčina",
};

// Nur exakt passende Kürzel (Kleinschreibung) gelten; alles andere ist „kein Wert“.
export function parseLocale(v: string | null | undefined): Locale | null {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
}

// Cookie zuerst; sonst die erste unterstützte Sprache aus Accept-Language (nach q, nur Primärsubtag); sonst Deutsch.
export function negotiateLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  const fromCookie = parseLocale(cookie);
  if (fromCookie) return fromCookie;
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranges = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...attrs] = part.trim().split(";");
      const q = attrs.map((a) => a.trim()).find((a) => a.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { primary: tag.trim().split("-")[0].toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((r) => r.primary && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const r of ranges) {
    const l = parseLocale(r.primary);
    if (l) return l;
  }
  return DEFAULT_LOCALE;
}
