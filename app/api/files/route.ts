// XML-Dateien in der Datenbank: Liste und Anlegen.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, jsonBody } from "@/lib/server/session";
import { createFile, listFiles } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const sp = new URL(req.url).searchParams;
    const cat = sp.get("category");
    const scope = sp.get("scope");
    const files = await listFiles(await getDb(), user.id, {
      category: !cat ? undefined : cat === "none" ? null : Number(cat),
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      search: sp.get("q") ?? undefined,
      scope: scope === "shared" || scope === "own" ? scope : undefined,
    });
    return NextResponse.json({ files });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ name: string; content: string; categoryId: number | null; overwrite: boolean; autoRename: boolean }>(req);
    const file = await createFile(await getDb(), {
      name: String(body.name ?? ""),
      content: String(body.content ?? ""),
      categoryId: body.categoryId ?? null,
      overwrite: !!body.overwrite,
      autoRename: !!body.autoRename,
    }, user.id);
    return NextResponse.json({ file }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
