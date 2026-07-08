import { NextResponse } from "next/server";
import { assertAiosToken, publicLiveState } from "@/lib/tesla-live";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!assertAiosToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const vin = url.searchParams.get("vin")?.trim();

  const row = vin
    ? await prisma.teslaLiveState.findUnique({ where: { vin } })
    : await prisma.teslaLiveState.findFirst({ orderBy: { updatedAt: "desc" } });

  if (!row) {
    return NextResponse.json({ ok: false, error: "no telemetry yet" });
  }

  return NextResponse.json(publicLiveState(row), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Aios-Token, Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
