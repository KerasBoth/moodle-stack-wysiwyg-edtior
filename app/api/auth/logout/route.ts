import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { SESSION_COOKIE, sessionToken } from "@/lib/server/session";
import { logout } from "@/lib/server/store";

export async function POST() {
  await logout(await getDb(), await sessionToken());
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
