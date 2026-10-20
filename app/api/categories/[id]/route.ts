import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, idParam, jsonBody } from "@/lib/server/session";
import { deleteCategory, renameCategory } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ name: string }>(req);
    await renameCategory(await getDb(), idParam((await ctx.params).id), String(body.name ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** Löscht die Kategorie; ihre Dateien bleiben „ohne Kategorie“ erhalten. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    await deleteCategory(await getDb(), idParam((await ctx.params).id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
