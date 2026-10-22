// Kleiner fetch-Wrapper für die JSON-API. Bei abgelaufener Sitzung geht es zurück zur Anmeldung.

import {
  DEFAULT_LOCALE, type Locale, type MessageKey, type Params, formatDate, parseLocale, translateWith,
} from "../i18n/index.ts";
import { loadMessages } from "../i18n/loaders.ts";
import de from "../i18n/messages/de/index.ts";

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api<T = Record<string, unknown>>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (r.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!r.ok) throw new ApiError(typeof data.error === "string" ? data.error : await httpErrorText(r.status), r.status, data);
  return data as T;
}

// Antwort ohne Meldung (z. B. Proxy-Fehlerseite): „Fehler 502“ in der Sprache der Seite (<html lang>,
// vom Server gesetzt und beim Umschalten nachgeführt). Die Texte der Sprache hat der I18nProvider bereits geladen.
async function httpErrorText(status: number): Promise<string> {
  const locale = parseLocale(document.documentElement.lang) ?? DEFAULT_LOCALE;
  const messages = await loadMessages(locale).catch(() => undefined);
  return translateWith({ de, ...(messages && { [locale]: messages }) }, locale, "common.httpError", { status });
}

export async function logoutAndLeave() {
  await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
  window.location.href = "/login";
}

/** „vor 5 Min.“, „gestern“ … für Listen, in der Oberflächensprache. */
export function relTime(iso: string, locale: Locale, t: (key: MessageKey, params?: Params) => string): string {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return t("dashboard.justNow");
  if (s < 3600) return t("dashboard.minutesAgo", { count: Math.floor(s / 60) });
  if (s < 86400) return t("dashboard.hoursAgo", { count: Math.floor(s / 3600) });
  if (s < 2 * 86400) return t("dashboard.yesterday");
  if (s < 7 * 86400) return t("dashboard.daysAgo", { count: Math.floor(s / 86400) });
  return formatDate(locale, d);
}
