// Benutzerverwaltung (nur Administratoren).

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, jsonBody } from "@/lib/server/session";
import { createUser, listUsers } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await apiUser({ admin: true });
  if (user instanceof Response) return user;
  return NextResponse.json({ users: await listUsers(await getDb()) });
}

export async function POST(req: Request) {
  const user = await apiUser({ admin: true });
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ username: string; password: string; isAdmin: boolean }>(req);
    const created = await createUser(await getDb(), String(body.username ?? ""), String(body.password ?? ""), !!body.isAdmin);
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
