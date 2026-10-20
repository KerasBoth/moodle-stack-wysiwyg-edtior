import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiUser } from "@/lib/server/session";
import { dashboard } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return NextResponse.json(await dashboard(await getDb(), user.id));
}
