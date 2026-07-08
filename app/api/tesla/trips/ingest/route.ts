import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAiosToken, normalizeGear } from "@/lib/tesla-live";
import {
  cleanInt,
  cleanNumber,
  cleanText,
  haversineKm,
  hasPosition,
  isChargingSample,
  isDrivingSample,
  sampleTime,
  type TeslaTripSamplePayload,
} from "@/lib/tesla-trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertAiosToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }

  let sample: TeslaTripSamplePayload;
  try {
    sample = (await request.json()) as TeslaTripSamplePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const vin = cleanText(sample.vin || "default");
  if (!vin) {
    return NextResponse.json({ ok: false, error: "missing vin" }, { status: 400 });
  }

  const sampledAt = sampleTime(sample.sampled_at);
  const speedKmh = Math.max(0, cleanInt(sample.speed_kmh, 0));
  const gear = normalizeGear(cleanText(sample.gear));
  const batteryPercent = cleanInt(sample.battery_percent, -1);
  const rangeKm = cleanInt(sample.range_km, -1);
  const latitude = cleanNumber(sample.latitude);
  const longitude = cleanNumber(sample.longitude);
  const driving = isDrivingSample(sample);
  const positioned = hasPosition(sample);
  let tripId = "";

  const openTrip = await prisma.teslaTrip.findFirst({
    where: { vin, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: { samples: { orderBy: { sampledAt: "desc" }, take: 1 } },
  });

  let trip = openTrip;
  if (!trip && (driving || positioned)) {
    trip = await prisma.teslaTrip.create({
      data: {
        vin,
        startedAt: sampledAt,
        startBattery: batteryPercent,
        endBattery: batteryPercent,
        startRangeKm: rangeKm,
        endRangeKm: rangeKm,
        startLat: latitude,
        startLon: longitude,
        endLat: latitude,
        endLon: longitude,
        destination: cleanText(sample.destination_name),
      },
      include: { samples: { orderBy: { sampledAt: "desc" }, take: 1 } },
    });
  }

  if (trip) {
    tripId = trip.id;
    const previous = trip.samples[0];
    let distanceDelta = 0;
    if (
      previous?.latitude != null &&
      previous.longitude != null &&
      latitude != null &&
      longitude != null
    ) {
      const km = haversineKm(previous.latitude, previous.longitude, latitude, longitude);
      if (km >= 0.003 && km <= 3) distanceDelta = km;
    }
    let secondsDelta = 0;
    if (previous && driving) {
      const seconds = Math.round((sampledAt.getTime() - previous.sampledAt.getTime()) / 1000);
      if (seconds > 0 && seconds <= 600) secondsDelta = seconds;
    }

    await prisma.teslaTripSample.upsert({
      where: { tripId_sampledAt: { tripId, sampledAt } },
      create: {
        tripId,
        vin,
        sampledAt,
        latitude,
        longitude,
        heading: cleanNumber(sample.heading),
        speedKmh,
        gear,
        batteryPercent,
        rangeKm,
        odometerKm: cleanNumber(sample.odometer_km),
        outsideTempC: cleanNumber(sample.outside_temp_c),
        destinationName: cleanText(sample.destination_name),
        routeLine: cleanText(sample.route_line),
        routeTrafficDelayMin: cleanNumber(sample.route_traffic_delay_min),
        chargeState: cleanText(sample.charge_state),
        chargePowerKw: cleanNumber(sample.charge_power_kw),
        chargeRateKmh: cleanNumber(sample.charge_rate_kmh),
        chargerVoltage: cleanNumber(sample.charger_voltage),
        chargerAmps: cleanNumber(sample.charger_amps),
      },
      update: {
        latitude,
        longitude,
        heading: cleanNumber(sample.heading),
        speedKmh,
        gear,
        batteryPercent,
        rangeKm,
        odometerKm: cleanNumber(sample.odometer_km),
        outsideTempC: cleanNumber(sample.outside_temp_c),
        destinationName: cleanText(sample.destination_name),
        routeLine: cleanText(sample.route_line),
        routeTrafficDelayMin: cleanNumber(sample.route_traffic_delay_min),
        chargeState: cleanText(sample.charge_state),
        chargePowerKw: cleanNumber(sample.charge_power_kw),
        chargeRateKmh: cleanNumber(sample.charge_rate_kmh),
        chargerVoltage: cleanNumber(sample.charger_voltage),
        chargerAmps: cleanNumber(sample.charger_amps),
      },
    });

    const sampleCount = await prisma.teslaTripSample.count({ where: { tripId } });
    const priorCount = Math.max(0, sampleCount - 1);
    const avgSpeedKmh = ((trip.avgSpeedKmh * priorCount) + speedKmh) / Math.max(sampleCount, 1);
    await prisma.teslaTrip.update({
      where: { id: tripId },
      data: {
        sampleCount,
        distanceKm: { increment: distanceDelta },
        driveSeconds: { increment: secondsDelta },
        maxSpeedKmh: Math.max(trip.maxSpeedKmh, speedKmh),
        avgSpeedKmh,
        endBattery: batteryPercent,
        endRangeKm: rangeKm,
        endLat: latitude ?? trip.endLat,
        endLon: longitude ?? trip.endLon,
        destination: cleanText(sample.destination_name) || trip.destination,
        endedAt: gear === "P" && speedKmh <= 2 && trip.sampleCount > 2 ? sampledAt : null,
      },
    });
  }

  const charging = isChargingSample(sample);
  const openCharge = await prisma.teslaChargeEvent.findFirst({
    where: { vin, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (charging) {
    if (!openCharge) {
      await prisma.teslaChargeEvent.create({
        data: {
          tripId: tripId || null,
          vin,
          startedAt: sampledAt,
          startBattery: batteryPercent,
          endBattery: batteryPercent,
          startRangeKm: rangeKm,
          endRangeKm: rangeKm,
          maxPowerKw: Math.max(0, cleanNumber(sample.charge_power_kw) ?? 0),
          locationLat: latitude,
          locationLon: longitude,
        },
      });
    } else {
      await prisma.teslaChargeEvent.update({
        where: { id: openCharge.id },
        data: {
          tripId: openCharge.tripId || tripId || null,
          endBattery: batteryPercent,
          endRangeKm: rangeKm,
          energyAddedPct: Math.max(0, batteryPercent - openCharge.startBattery),
          maxPowerKw: Math.max(openCharge.maxPowerKw, cleanNumber(sample.charge_power_kw) ?? 0),
          locationLat: openCharge.locationLat ?? latitude,
          locationLon: openCharge.locationLon ?? longitude,
        },
      });
    }
  } else if (openCharge) {
    await prisma.teslaChargeEvent.update({
      where: { id: openCharge.id },
      data: {
        endedAt: sampledAt,
        endBattery: batteryPercent,
        endRangeKm: rangeKm,
        energyAddedPct: Math.max(0, batteryPercent - openCharge.startBattery),
      },
    });
  }

  return NextResponse.json({ ok: true, trip_id: tripId || null, sampled_at: sampledAt.toISOString() });
}
