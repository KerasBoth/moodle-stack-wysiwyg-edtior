// Andere Benutzer zum Teilen von Aufgaben (jeder angemeldete Benutzer).

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser } from "@/lib/server/session";
import { listPeople } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    return NextResponse.json({ people: await listPeople(await getDb(), user.id) });
  } catch (e) {
    return apiError(e);
  }
}
