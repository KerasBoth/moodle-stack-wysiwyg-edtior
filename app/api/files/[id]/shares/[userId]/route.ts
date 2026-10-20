// Freigabe einer Datei für einen Benutzer entziehen (nur Besitzer).

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, idParam } from "@/lib/server/session";
import { listShares, removeShare } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const { id, userId } = await ctx.params;
    const fileId = idParam(id);
    await removeShare(db, user.id, fileId, idParam(userId));
    return NextResponse.json({ shares: await listShares(db, user.id, fileId) });
  } catch (e) {
    return apiError(e);
  }
}
