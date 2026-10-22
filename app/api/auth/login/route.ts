import { NextResponse } from "next/server";
import { getT } from "@/lib/i18n/server";
import { getDb } from "@/lib/server/db";
import { apiError, jsonBody, setSessionCookie } from "@/lib/server/session";
import { login } from "@/lib/server/store";

// Einfacher Schutz gegen Durchprobieren: nach 5 Fehlversuchen pro IP 60 s Sperre.
const failures = new Map<string, { count: number; until: number }>();

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    const f = failures.get(ip);
    if (f && f.until > Date.now()) {
      return NextResponse.json({ error: (await getT())("server.tooManyAttempts") }, { status: 429 });
    }
    const body = await jsonBody<{ username: string; password: string }>(req);
    const res = await login(await getDb(), String(body.username ?? ""), String(body.password ?? ""));
    if (!res) {
      const count = (f?.count ?? 0) + 1;
      failures.set(ip, count >= 5 ? { count: 0, until: Date.now() + 60_000 } : { count, until: 0 });
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ error: (await getT())("server.wrongCredentials") }, { status: 401 });
    }
    failures.delete(ip);
    const out = NextResponse.json({ user: res.user });
    setSessionCookie(out, req, res.token, res.expires);
    return out;
  } catch (e) {
    return apiError(e);
  }
}
