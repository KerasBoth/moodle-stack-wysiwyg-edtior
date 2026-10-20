// Einzelne XML-Datei: Lesen, Speichern (Inhalt/Name/Kategorie), Löschen.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, idParam, jsonBody } from "@/lib/server/session";
import { deleteFile, getFile, updateFile } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    return NextResponse.json({ file: await getFile(await getDb(), user.id, idParam((await ctx.params).id)) });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ content: string; name: string; categoryId: number | null; baseUpdatedAt: string; force: boolean }>(req);
    const file = await updateFile(await getDb(), user.id, idParam((await ctx.params).id), {
      content: typeof body.content === "string" ? body.content : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      categoryId: "categoryId" in body ? body.categoryId : undefined,
      baseUpdatedAt: typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : undefined,
      force: !!body.force,
    });
    return NextResponse.json({ file });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    await deleteFile(await getDb(), user.id, idParam((await ctx.params).id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
