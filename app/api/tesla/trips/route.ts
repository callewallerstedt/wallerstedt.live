import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAiosToken } from "@/lib/tesla-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChargeEventRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  startBattery: number;
  endBattery: number;
  maxPowerKw: number;
  energyAddedPct: number;
  locationLat: number | null;
  locationLon: number | null;
};

type TripRow = {
  id: string;
  vin: string;
  startedAt: Date;
  endedAt: Date | null;
  sampleCount: number;
  distanceKm: number;
  driveSeconds: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  startBattery: number;
  endBattery: number;
  startRangeKm: number;
  endRangeKm: number;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  destination: string;
  chargeEvents: ChargeEventRow[];
};

export async function GET(request: Request) {
  if (!assertAiosToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }

  const trips = await prisma.teslaTrip.findMany({
    orderBy: { startedAt: "desc" },
    take: 40,
    include: {
      chargeEvents: { orderBy: { startedAt: "asc" } },
      samples: {
        orderBy: { sampledAt: "asc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    trips: (trips as TripRow[]).map((trip) => ({
      id: trip.id,
      vin: trip.vin,
      started_at: trip.startedAt.toISOString(),
      ended_at: trip.endedAt?.toISOString() ?? null,
      sample_count: trip.sampleCount,
      distance_km: Math.round(trip.distanceKm * 10) / 10,
      drive_seconds: trip.driveSeconds,
      max_speed_kmh: trip.maxSpeedKmh,
      avg_speed_kmh: Math.round(trip.avgSpeedKmh),
      start_battery: trip.startBattery,
      end_battery: trip.endBattery,
      start_range_km: trip.startRangeKm,
      end_range_km: trip.endRangeKm,
      start_lat: trip.startLat,
      start_lon: trip.startLon,
      end_lat: trip.endLat,
      end_lon: trip.endLon,
      destination: trip.destination,
      charge_events: trip.chargeEvents.map((event) => ({
        id: event.id,
        started_at: event.startedAt.toISOString(),
        ended_at: event.endedAt?.toISOString() ?? null,
        start_battery: event.startBattery,
        end_battery: event.endBattery,
        max_power_kw: event.maxPowerKw,
        energy_added_pct: event.energyAddedPct,
        location_lat: event.locationLat,
        location_lon: event.locationLon,
      })),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
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
