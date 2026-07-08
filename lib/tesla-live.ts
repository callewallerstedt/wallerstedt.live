import { connectSecret } from "@/lib/tesla";

export type TeslaLivePayload = {
  vin?: string;
  speed_kmh?: number;
  gear?: string;
  battery_percent?: number;
  range_km?: number;
  connected?: boolean;
};

export function assertAiosToken(request: Request) {
  const expected = connectSecret();
  if (!expected) return false;
  const header = request.headers.get("x-aios-token")?.trim() ?? "";
  if (header === expected) return true;
  const url = new URL(request.url);
  return url.searchParams.get("token") === expected;
}

export function normalizeGear(raw: string | undefined) {
  if (!raw) return "P";
  let value = raw.trim().toUpperCase();
  if (value.startsWith("SHIFTSTATE")) value = value.slice("SHIFTSTATE".length);
  if (value.length > 1) value = value.slice(0, 1);
  return ["P", "R", "N", "D"].includes(value) ? value : "P";
}

export function publicLiveState(row: {
  vin: string;
  speedKmh: number;
  gear: string;
  batteryPercent: number;
  rangeKm: number;
  connected: boolean;
  updatedAt: Date;
}) {
  const ageSec = Math.max(0, (Date.now() - row.updatedAt.getTime()) / 1000);
  const stale = ageSec > 8;
  return {
    ok: true,
    vin: row.vin,
    speed_kmh: row.speedKmh,
    gear: row.gear,
    battery_percent: row.batteryPercent,
    range_km: row.rangeKm,
    connected: row.connected,
    age_sec: Math.round(ageSec * 100) / 100,
    stale,
  };
}
