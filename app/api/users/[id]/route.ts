import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, idParam, jsonBody } from "@/lib/server/session";
import { StoreError, deleteUser, setPassword, setUserNames } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };

/** Passwort und/oder Namen eines Benutzers ändern. */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ password: string; firstName: string; lastName: string }>(req);
    const db = await getDb();
    const id = idParam((await ctx.params).id);
    const hasPassword = typeof body.password === "string";
    const hasNames = typeof body.firstName === "string" || typeof body.lastName === "string";
    if (!hasPassword && !hasNames) throw new StoreError("Nichts zu ändern");
    if (hasPassword) await setPassword(db, id, body.password as string);
    if (hasNames) {
      await setUserNames(db, id, typeof body.firstName === "string" ? body.firstName : undefined, typeof body.lastName === "string" ? body.lastName : undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof Response) return user;
  try {
    const id = idParam((await ctx.params).id);
    if (id === user.id) throw new StoreError("Das eigene Konto kann nicht gelöscht werden");
    await deleteUser(await getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
