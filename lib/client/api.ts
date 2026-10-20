// Kleiner fetch-Wrapper für die JSON-API. Bei abgelaufener Sitzung geht es zurück zur Anmeldung.

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
  if (!r.ok) throw new ApiError(String(data.error ?? `Fehler ${r.status}`), r.status, data);
  return data as T;
}

export async function logoutAndLeave() {
  await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
  window.location.href = "/login";
}

/** „vor 5 Min.“, „gestern“ … für Listen. */
export function relTime(iso: string): string {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 2 * 86400) return "gestern";
  if (s < 7 * 86400) return `vor ${Math.floor(s / 86400)} Tagen`;
  return d.toLocaleDateString("de-DE");
}
