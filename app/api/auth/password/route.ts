// Eigenes Passwort ändern.

import { NextResponse } from "next/server";
import { getT } from "@/lib/i18n/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, jsonBody } from "@/lib/server/session";
import { checkPassword, setPassword } from "@/lib/server/store";

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ current: string; password: string }>(req);
    if (!await checkPassword(await getDb(), user.id, String(body.current ?? ""))) {
      return NextResponse.json({ error: (await getT())("server.wrongCurrentPassword") }, { status: 400 });
    }
    await setPassword(await getDb(), user.id, String(body.password ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
