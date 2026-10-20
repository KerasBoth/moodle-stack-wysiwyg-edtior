// Verbindung zu einem Maxima-Server (goemaxima/MaximaPool) – konfiguriert über .env:
//   MAXIMA_URL=https://…/goemaxima      (ohne: nur lokale Vorschau)
//   MAXIMA_TIMEOUT=10000                (Millisekunden, optional)
//   MAXIMA_VERSION=2024012900           (STACK-Version für den Server, optional)

import { type CasRequest, type CasResult, buildProgram, parseOutput } from "../stack/maximaprogram.ts";

export interface MaximaConfig { url: string; timeout: number; version: string }

export function maximaConfig(): MaximaConfig | null {
  const url = process.env.MAXIMA_URL?.trim();
  if (!url) return null;
  const timeout = Number(process.env.MAXIMA_TIMEOUT) || 10000;
  return { url, timeout: Math.min(Math.max(timeout, 1000), 60000), version: process.env.MAXIMA_VERSION?.trim() || "2024012900" };
}

export class MaximaUnavailable extends Error {}

async function post(cfg: MaximaConfig, input: string): Promise<string> {
  const body = new URLSearchParams({ input, timeout: String(cfg.timeout), ploturlbase: "!ploturl!", version: cfg.version });
  let res: Response;
  try {
    res = await fetch(cfg.url, { method: "POST", body, signal: AbortSignal.timeout(cfg.timeout + 5000), cache: "no-store" });
  } catch (e) {
    const reason = e instanceof Error && e.name === "TimeoutError" ? "Zeitüberschreitung" : e instanceof Error ? e.message : String(e);
    throw new MaximaUnavailable(`Maxima-Server nicht erreichbar (${reason})`);
  }
  const text = await res.text();
  // goemaxima meldet Zeitüberschreitungen und Abstürze mit Status ≠ 200
  if (!res.ok) throw new MaximaUnavailable(`Maxima-Server antwortet mit ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  return text;
}

export async function evaluateOnServer(req: CasRequest): Promise<CasResult> {
  const cfg = maximaConfig();
  if (!cfg) throw new MaximaUnavailable("Kein Maxima-Server eingerichtet (MAXIMA_URL)");
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
