import type { LiveState, TeslaSettings, Trip, TripDetail } from "./types";

export const SETTINGS_KEY = "wallerstedt.drive.settings.v2";
export const LEGACY_SETTINGS_KEYS = ["wallerstedt.tesla.settings.v1", "teslaTripToken"] as const;

export const DEFAULT_SETTINGS: TeslaSettings = {
  token: "",
  wakeWord: "Hey Tesla",
  language: "en-US",
  openAiKey: "",
  speak: true,
  gpsFallback: true,
  keepAwake: true,
  haptics: true,
  demo: false,
  refreshMs: 3000,
};

export const DEMO_LIVE: LiveState = {
  ok: true,
  vin: "DEMO5YJ3E1EA7",
  speed_kmh: 86,
  gear: "D",
  battery_percent: 72,
  range_km: 318,
  connected: true,
  age_sec: 0.4,
  stale: false,
  latitude: 44.4949,
  longitude: 11.3426,
  heading: 142,
  odometer_km: 104382,
  outside_temp_c: 24,
  destination_name: "Bologna",
  route_traffic_delay_min: 4,
  charge_state: "Disconnected",
  charge_power_kw: null,
  charge_rate_kmh: null,
  charger_voltage: null,
  charger_amps: null,
};

const now = Date.now();
const demoSamples = Array.from({ length: 42 }, (_, index) => {
  const progress = index / 41;
  return {
    sampled_at: new Date(now - (41 - index) * 75000).toISOString(),
    lat: 44.443 + progress * 0.052 + Math.sin(progress * 9) * 0.003,
    lon: 11.286 + progress * 0.057 + Math.cos(progress * 7) * 0.004,
    heading: 142,
    speed_kmh: Math.round(52 + Math.sin(progress * 13) * 23 + progress * 22),
    gear: "D",
    battery_percent: Math.round(88 - progress * 16),
    range_km: Math.round(392 - progress * 74),
    odometer_km: 104318 + progress * 64.2,
    outside_temp_c: 24,
    destination_name: "Bologna",
    route_traffic_delay_min: 4,
    charge_state: "Disconnected",
    charge_power_kw: null,
  };
});

export const DEMO_TRIP: TripDetail = {
  id: "demo-bologna",
  vin: DEMO_LIVE.vin || "DEMO",
  started_at: new Date(now - 52 * 60000).toISOString(),
  ended_at: new Date(now).toISOString(),
  sample_count: demoSamples.length,
  distance_km: 64.2,
  drive_seconds: 3120,
  max_speed_kmh: 118,
  avg_speed_kmh: 74,
  start_battery: 88,
  end_battery: 72,
  start_range_km: 392,
  end_range_km: 318,
  start_lat: demoSamples[0].lat,
  start_lon: demoSamples[0].lon,
  end_lat: demoSamples.at(-1)?.lat ?? null,
  end_lon: demoSamples.at(-1)?.lon ?? null,
  destination: "Bologna",
  charge_events: [],
  samples: demoSamples,
};

export const DEMO_TRIPS: Trip[] = [
  DEMO_TRIP,
  {
    ...DEMO_TRIP,
    id: "demo-imola",
    destination: "Autodromo di Imola",
    started_at: new Date(now - 26 * 3600000).toISOString(),
    ended_at: new Date(now - 25.2 * 3600000).toISOString(),
    distance_km: 48.7,
    drive_seconds: 2810,
    avg_speed_kmh: 62,
    max_speed_kmh: 106,
    start_battery: 91,
    end_battery: 79,
  },
  {
    ...DEMO_TRIP,
    id: "demo-venice",
    destination: "Venezia Tronchetto",
    started_at: new Date(now - 52 * 3600000).toISOString(),
    ended_at: new Date(now - 49.8 * 3600000).toISOString(),
    distance_km: 153.4,
    drive_seconds: 7920,
    avg_speed_kmh: 70,
    max_speed_kmh: 128,
    start_battery: 96,
    end_battery: 51,
  },
];

export const LOCAL_COMMAND_HELP = [
  "What is my speed?",
  "Battery and range",
  "Show my trips",
  "Open Apple Maps",
  "Drive summary",
] as const;
