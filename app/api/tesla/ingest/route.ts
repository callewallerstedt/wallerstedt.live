import { NextResponse } from "next/server";
import {
  assertAiosToken,
  normalizeGear,
  type TeslaLivePayload,
} from "@/lib/tesla-live";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertAiosToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }

  let body: TeslaLivePayload;
  try {
    body = (await request.json()) as TeslaLivePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const vin = (body.vin ?? "default").trim();
  if (!vin) {
    return NextResponse.json({ ok: false, error: "missing vin" }, { status: 400 });
  }

  const row = await prisma.teslaLiveState.upsert({
    where: { vin },
    create: {
      vin,
      speedKmh: Math.max(0, Math.round(body.speed_kmh ?? 0)),
      gear: normalizeGear(body.gear),
      batteryPercent: Math.round(body.battery_percent ?? -1),
      rangeKm: Math.round(body.range_km ?? -1),
      connected: body.connected ?? true,
    },
    update: {
      speedKmh: Math.max(0, Math.round(body.speed_kmh ?? 0)),
      gear: normalizeGear(body.gear),
      batteryPercent: Math.round(body.battery_percent ?? -1),
      rangeKm: Math.round(body.range_km ?? -1),
      connected: body.connected ?? true,
    },
  });

  return NextResponse.json({ ok: true, vin: row.vin, updated_at: row.updatedAt.toISOString() });
}
