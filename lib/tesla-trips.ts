import { normalizeGear } from "@/lib/tesla-live";

export type TeslaTripSamplePayload = {
  vin?: string;
  sampled_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  heading?: number | null;
  speed_kmh?: number | null;
  gear?: string | null;
  battery_percent?: number | null;
  range_km?: number | null;
  odometer_km?: number | null;
  outside_temp_c?: number | null;
  destination_name?: string | null;
  route_line?: string | null;
  route_traffic_delay_min?: number | null;
  charge_state?: string | null;
  charge_power_kw?: number | null;
  charge_rate_kmh?: number | null;
  charger_voltage?: number | null;
  charger_amps?: number | null;
};

export function cleanNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function cleanInt(value: unknown, fallback = -1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function sampleTime(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function hasPosition(sample: TeslaTripSamplePayload) {
  return cleanNumber(sample.latitude) !== null && cleanNumber(sample.longitude) !== null;
}

export function isDrivingSample(sample: TeslaTripSamplePayload) {
  const speed = cleanInt(sample.speed_kmh, 0);
  const gear = normalizeGear(cleanText(sample.gear));
  return speed > 2 || ["D", "R", "N"].includes(gear);
}

export function isChargingSample(sample: TeslaTripSamplePayload) {
  const state = cleanText(sample.charge_state).toLowerCase();
  const power = cleanNumber(sample.charge_power_kw) ?? 0;
  return power > 0.2 || state.includes("charging") || state.includes("supercharging");
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earthKm = 6371.0088;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

