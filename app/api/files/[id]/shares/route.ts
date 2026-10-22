// Freigaben einer Datei (nur Besitzer): Liste und Setzen/Ändern.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, idParam, jsonBody } from "@/lib/server/session";
import { StoreError, listShares, setShare } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    return NextResponse.json({ shares: await listShares(await getDb(), user.id, idParam((await ctx.params).id)) });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ userId: number; role: "read" | "edit" }>(req);
    const db = await getDb();
    const fileId = idParam((await ctx.params).id);
    const targetId = Number(body.userId);
    if (!Number.isInteger(targetId) || targetId <= 0) throw new StoreError("server.invalidUserId");
    await setShare(db, user.id, fileId, targetId, body.role as "read" | "edit");
    return NextResponse.json({ shares: await listShares(db, user.id, fileId) });
  } catch (e) {
    return apiError(e);
  }
}
