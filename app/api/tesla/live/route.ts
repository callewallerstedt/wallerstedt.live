import { NextResponse } from "next/server";
import { assertAiosToken, publicLiveState } from "@/lib/tesla-live";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tripSampleSelect = {
  vin: true,
  sampledAt: true,
  latitude: true,
  longitude: true,
  heading: true,
  speedKmh: true,
  gear: true,
  batteryPercent: true,
  rangeKm: true,
  odometerKm: true,
  outsideTempC: true,
  destinationName: true,
  routeTrafficDelayMin: true,
  chargeState: true,
  chargePowerKw: true,
  chargeRateKmh: true,
  chargerVoltage: true,
  chargerAmps: true,
} as const;

export async function GET(request: Request) {
  if (!assertAiosToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const vin = url.searchParams.get("vin")?.trim();

  const [row, latestSample] = await Promise.all([
    vin
      ? prisma.teslaLiveState.findUnique({ where: { vin } })
      : prisma.teslaLiveState.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.teslaTripSample.findFirst({
      where: vin ? { vin } : undefined,
      orderBy: { sampledAt: "desc" },
      select: tripSampleSelect,
    }),
  ]);
  const sample = row && latestSample && row.vin !== latestSample.vin
    ? await prisma.teslaTripSample.findFirst({
        where: { vin: row.vin },
        orderBy: { sampledAt: "desc" },
        select: tripSampleSelect,
      })
    : latestSample;

  if (!row && !sample) {
    return NextResponse.json({ ok: false, error: "no telemetry yet" });
  }

  const base = row
    ? publicLiveState(row)
    : publicLiveState({
        vin: sample!.vin,
        speedKmh: sample!.speedKmh,
        gear: sample!.gear,
        batteryPercent: sample!.batteryPercent,
        rangeKm: sample!.rangeKm,
        connected: Date.now() - sample!.sampledAt.getTime() < 10_000,
        updatedAt: sample!.sampledAt,
      });

  return NextResponse.json({
    ...base,
    latitude: sample?.latitude ?? null,
    longitude: sample?.longitude ?? null,
    heading: sample?.heading ?? null,
    odometer_km: sample?.odometerKm ?? null,
    outside_temp_c: sample?.outsideTempC ?? null,
    destination_name: sample?.destinationName ?? "",
    route_traffic_delay_min: sample?.routeTrafficDelayMin ?? null,
    charge_state: sample?.chargeState ?? "",
    charge_power_kw: sample?.chargePowerKw ?? null,
    charge_rate_kmh: sample?.chargeRateKmh ?? null,
    charger_voltage: sample?.chargerVoltage ?? null,
    charger_amps: sample?.chargerAmps ?? null,
  }, {
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
