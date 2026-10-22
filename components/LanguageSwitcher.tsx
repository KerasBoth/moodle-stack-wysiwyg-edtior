"use client";

// Auswahl der Oberflächensprache (Kopfleisten, Anmeldeseite). Namen jeweils in der eigenen Sprache.

import { LOCALE_NAMES, LOCALES, parseLocale } from "@/lib/i18n";
import { useLocale, useSetLocale, useT } from "./I18nProvider";

export default function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();
  return (
    <select
      className={className ? `lang-switch ${className}` : "lang-switch"}
      value={locale}
      aria-label={t("common.language")}
      title={t("common.language")}
      onChange={(e) => { const l = parseLocale(e.target.value); if (l) setLocale(l); }}
    >
      {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
    </select>
  );
}
