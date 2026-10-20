import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { apiError, apiUser, idParam, jsonBody } from "@/lib/server/session";
import { StoreError, deleteUser, setPassword } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };

/** Passwort eines Benutzers zurücksetzen. */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser({ admin: true });
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<{ password: string }>(req);
    await setPassword(await getDb(), idParam((await ctx.params).id), String(body.password ?? ""));
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
