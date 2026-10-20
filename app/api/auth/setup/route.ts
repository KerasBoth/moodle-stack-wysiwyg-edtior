// Legt das erste Administratorkonto an – nur solange noch kein Benutzer existiert.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, jsonBody, setSessionCookie } from "@/lib/server/session";
import { StoreError, countUsers, createUser, login } from "@/lib/server/store";

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await jsonBody<{ username: string; password: string }>(req);
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    try {
      await db.tx(async (t) => {
        // In PostgreSQL verhindert die Sperre, dass zwei Browser gleichzeitig ein erstes Konto anlegen
        if (t.dialect === "postgres") await t.exec("LOCK TABLE users IN EXCLUSIVE MODE");
        if ((await countUsers(t)) > 0) throw new StoreError("Es existiert bereits ein Benutzer. Bitte anmelden.", 409);
        await createUser(t, username, password, true);
      });
    } catch (e) {
      if (e instanceof StoreError && e.status === 409) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }
    const res = (await login(db, username, password))!;
    const out = NextResponse.json({ user: res.user });
    setSessionCookie(out, req, res.token, res.expires);
    return out;
  } catch (e) {
    return apiError(e);
  }
}
