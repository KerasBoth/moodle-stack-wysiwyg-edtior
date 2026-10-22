// Sitzungs-Cookie und Hilfsfunktionen für Seiten und API-Routen (nur serverseitig).

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getLocale, getT } from "../i18n/server.ts";
import { LocalizedError, translate, translateMsg } from "../i18n/translate.ts";
import { getDb } from "./db.ts";
import { StoreError, type User, userForToken } from "./store.ts";

export const SESSION_COOKIE = "stack_session";

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  return await userForToken(await getDb(), await sessionToken());
}

/** Für API-Routen: angemeldeter Benutzer oder eine 401/403-Antwort. */
export async function apiUser(opts: { admin?: boolean } = {}): Promise<User | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: (await getT())("server.notSignedIn") }, { status: 401 });
  if (opts.admin && !user.isAdmin) return NextResponse.json({ error: (await getT())("server.adminOnly") }, { status: 403 });
  return user;
}

export function setSessionCookie(res: NextResponse, req: Request, token: string, expires: Date) {
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: https, path: "/", expires });
}

/**
 * Einheitliche Fehlerantwort in der Sprache des Anfragenden (Cookie, sonst Accept-Language).
 * LocalizedError (z. B. StoreError, MaximaUnavailable) trägt Schlüssel und Status, StoreError zusätzlich Zusatzfelder.
 */
export async function apiError(e: unknown): Promise<NextResponse> {
  const locale = await getLocale();
  if (e instanceof LocalizedError) {
    const extra = e instanceof StoreError ? e.extra : undefined;
    return NextResponse.json({ error: translateMsg(locale, e.msg), ...extra }, { status: e.status ?? 400 });
  }
  console.error(e);
  return NextResponse.json(
    { error: translate(locale, "server.serverError", { detail: e instanceof Error ? e.message : String(e) }) },
    { status: 500 },
  );
}

/** Liest einen JSON-Body; Formulare anderer Seiten (CSRF) werden so abgewiesen. */
export async function jsonBody<T>(req: Request): Promise<Partial<T>> {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new StoreError("server.jsonExpected", undefined, 415);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new StoreError("server.invalidRequest");
  return body as Partial<T>;
}

export function idParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new StoreError("server.invalidId");
  return id;
}
