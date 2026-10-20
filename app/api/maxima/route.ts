// Berechnungen über den Maxima-Server (nur für angemeldete Benutzer).

import { NextResponse } from "next/server";
import { MaximaUnavailable, evaluateOnServer, maximaStatus } from "@/lib/server/maxima";
import { apiError, apiUser, jsonBody } from "@/lib/server/session";
import { StoreError } from "@/lib/server/store";
import type { CasRequest } from "@/lib/stack/maximaprogram";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return NextResponse.json(await maximaStatus());
}

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  try {
    const body = await jsonBody<CasRequest>(req);
    const request: CasRequest = {
      questionvariables: String(body.questionvariables ?? ""),
      seed: Number(body.seed) || 1,
      simp: body.simp !== false,
      names: Array.isArray(body.names) ? body.names.map(String).slice(0, 500) : [],
      expressions: Array.isArray(body.expressions) ? body.expressions.map(String).slice(0, 300) : [],
    };
    const size = request.questionvariables.length + request.expressions!.join("").length;
    if (size > 200_000) throw new StoreError("Zu viel Code für eine Berechnung");
    return NextResponse.json(await evaluateOnServer(request));
  } catch (e) {
    if (e instanceof MaximaUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return apiError(e);
  }
}
