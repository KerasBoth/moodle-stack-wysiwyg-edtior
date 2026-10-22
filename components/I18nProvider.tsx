"use client";

// Oberflächensprache im Browser: hält Sprache und Texte, übersetzt per useT() und schaltet ohne Neuladen um.
// Der Server (app/layout.tsx) gibt die Texte der aktiven Sprache mit – kein deutsches Aufblitzen, keine
// zusätzliche Anfrage. Deutsch ist ohnehin im Bündel (Rückfall); die übrigen Sprachen werden erst beim
// Umschalten als eigene Chunks geladen.

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, type MessageKey, type Messages, type MessagesByLocale, type Msg,
  type Params, parseLocale, translateWith,
} from "@/lib/i18n";
import { loadMessages } from "@/lib/i18n/loaders";
import de from "@/lib/i18n/messages/de";

type T = (key: MessageKey | Msg, params?: Params) => string;
type Ctx = { locale: Locale; t: T; setLocale: (l: Locale) => void };

function makeT(messages: MessagesByLocale, locale: Locale): T {
  return (key, params) =>
    typeof key === "string"
      ? translateWith(messages, locale, key, params)
      : translateWith(messages, locale, key.key, key.params ?? params);
}

// Außerhalb des Providers: Deutsch, Umschalten wirkungslos (nie ein Absturz)
const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  t: makeT({ de }, DEFAULT_LOCALE),
  setLocale: () => {},
});

function writeCookie(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readCookie(): Locale | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  return parseLocale(m?.[1]);
}

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ locale: Locale; messages: MessagesByLocale }>(() => ({
    locale,
    messages: { de, [locale]: messages },
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);

  // Liefert der Server eine andere Sprache (z. B. in einem anderen Tab umgestellt, dann hier neu angefragt),
  // gilt sie – aber nur, wenn sie zum Cookie passt; sonst ist es die Antwort auf eine überholte Umschaltung.
  useEffect(() => {
    if (locale !== stateRef.current.locale && readCookie() === locale) {
      setState((s) => ({ locale, messages: { ...s.messages, [locale]: messages } }));
    }
  }, [locale, messages]);

  const setLocale = useCallback((l: Locale) => {
    const prev = stateRef.current.locale;
    const n = ++seq.current;
    writeCookie(l);
    const known = stateRef.current.messages[l];
    (known ? Promise.resolve(known) : loadMessages(l)).then(
      (msgs) => {
        if (n !== seq.current) return; // inzwischen erneut umgeschaltet
        document.documentElement.lang = l;
        setState((s) => ({ locale: l, messages: { ...s.messages, [l]: msgs } }));
        // Server-Teile (Seitentitel, <html lang>) neu rendern; Client-Zustand bleibt erhalten
        startTransition(() => router.refresh());
      },
      (err) => {
        if (n !== seq.current) return;
        console.error(err);
        writeCookie(prev);
      },
    );
  }, [router]);

  const value = useMemo<Ctx>(
    () => ({ locale: state.locale, t: makeT(state.messages, state.locale), setLocale }),
    [state, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useT(): T {
  return useContext(I18nContext).t;
}

export function useSetLocale(): (l: Locale) => void {
  return useContext(I18nContext).setLocale;
}
