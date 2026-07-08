import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAiosToken } from "@/lib/tesla-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

type TripSampleRow = {
  sampledAt: Date;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  speedKmh: number;
  gear: string;
  batteryPercent: number;
  rangeKm: number;
  odometerKm: number | null;
  outsideTempC: number | null;
  destinationName: string;
  routeLine: string;
  routeTrafficDelayMin: number | null;
  chargeState: string;
  chargePowerKw: number | null;
  chargeRateKmh: number | null;
  chargerVoltage: number | null;
  chargerAmps: number | null;
};

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

export async function GET(request: Request, context: RouteContext) {
  if (!assertAiosToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }

  const { tripId } = await context.params;
  const trip = await prisma.teslaTrip.findUnique({
    where: { id: tripId },
    include: {
      samples: { orderBy: { sampledAt: "asc" }, take: 12000 },
      chargeEvents: { orderBy: { startedAt: "asc" } },
    },
  });

  if (!trip) {
    return NextResponse.json({ ok: false, error: "trip not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    trip: {
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
      destination: trip.destination,
      samples: (trip.samples as TripSampleRow[]).map((sample) => ({
        sampled_at: sample.sampledAt.toISOString(),
        lat: sample.latitude,
        lon: sample.longitude,
        heading: sample.heading,
        speed_kmh: sample.speedKmh,
        gear: sample.gear,
        battery_percent: sample.batteryPercent,
        range_km: sample.rangeKm,
        odometer_km: sample.odometerKm,
        outside_temp_c: sample.outsideTempC,
        destination_name: sample.destinationName,
        route_line: sample.routeLine,
        route_traffic_delay_min: sample.routeTrafficDelayMin,
        charge_state: sample.chargeState,
        charge_power_kw: sample.chargePowerKw,
        charge_rate_kmh: sample.chargeRateKmh,
        charger_voltage: sample.chargerVoltage,
        charger_amps: sample.chargerAmps,
      })),
      charge_events: (trip.chargeEvents as ChargeEventRow[]).map((event) => ({
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
    },
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
