import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, jsonBody } from "@/lib/server/session";
import { createCategory, listCategories } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return NextResponse.json({ categories: await listCategories(await getDb(), user.id) });
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ name: string }>(req);
    return NextResponse.json({ category: await createCategory(await getDb(), String(body.name ?? ""), user.id) }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
