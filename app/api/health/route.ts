// Healthcheck für Docker (ohne Anmeldung): App läuft und erreicht die Datenbank.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.get("SELECT 1 AS ok");
    return NextResponse.json({ ok: true, db: db.dialect });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
