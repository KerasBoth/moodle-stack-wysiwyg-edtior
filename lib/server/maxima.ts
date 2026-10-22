// Verbindung zu einem Maxima-Server (goemaxima/MaximaPool) – konfiguriert über .env:
//   MAXIMA_URL=https://…/goemaxima      (ohne: nur lokale Vorschau)
//   MAXIMA_TIMEOUT=10000                (Millisekunden, optional)
//   MAXIMA_VERSION=2024012900           (STACK-Version für den Server, optional)

import { LocalizedError, type MessageKey, type Params } from "../i18n/index.ts";
import { type CasRequest, type CasResult, buildProgram, parseOutput } from "../stack/maximaprogram.ts";

export interface MaximaConfig { url: string; timeout: number; version: string }

export function maximaConfig(): MaximaConfig | null {
  const url = process.env.MAXIMA_URL?.trim();
  if (!url) return null;
  const timeout = Number(process.env.MAXIMA_TIMEOUT) || 10000;
  return { url, timeout: Math.min(Math.max(timeout, 1000), 60000), version: process.env.MAXIMA_VERSION?.trim() || "2024012900" };
}

// Status 503; die Meldung (server.maxima*) übersetzt die API in die Sprache des Anfragenden.
export class MaximaUnavailable extends LocalizedError {
  constructor(key: MessageKey, params?: Params) {
    super(key, params, 503);
    this.name = "MaximaUnavailable";
  }
}

async function post(cfg: MaximaConfig, input: string): Promise<string> {
  const body = new URLSearchParams({ input, timeout: String(cfg.timeout), ploturlbase: "!ploturl!", version: cfg.version });
  let res: Response;
  try {
    res = await fetch(cfg.url, { method: "POST", body, signal: AbortSignal.timeout(cfg.timeout + 5000), cache: "no-store" });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new MaximaUnavailable("server.maximaTimeout");
    throw new MaximaUnavailable("server.maximaUnreachable", { reason: e instanceof Error ? e.message : String(e) });
  }
  const text = await res.text();
  // goemaxima meldet Zeitüberschreitungen und Abstürze mit Status ≠ 200
  if (!res.ok) {
    throw text
      ? new MaximaUnavailable("server.maximaStatusText", { status: res.status, text: text.slice(0, 200) })
      : new MaximaUnavailable("server.maximaStatus", { status: res.status });
  }
  return text;
}

export async function evaluateOnServer(req: CasRequest): Promise<CasResult> {
  const cfg = maximaConfig();
  if (!cfg) throw new MaximaUnavailable("server.maximaNotConfigured");
  return parseOutput(await post(cfg, buildProgram(req)), req);
}

/** Erreichbarkeit und Version (goemaxima liefert bei GET „Hostname: …, version: …“). */
export async function maximaStatus(): Promise<{ configured: boolean; reachable?: boolean; server?: string; error?: string }> {
  const cfg = maximaConfig();
  if (!cfg) return { configured: false };
  try {
    const res = await fetch(cfg.url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const text = (await res.text()).trim();
    const version = /version:\s*([\w.-]+)/i.exec(text)?.[1];
    return { configured: true, reachable: res.ok, server: `${new URL(cfg.url).host}${version ? ` (goemaxima ${version})` : ""}` };
  } catch (e) {
    return { configured: true, reachable: false, server: new URL(cfg.url).host, error: e instanceof Error ? e.message : String(e) };
  }
}
