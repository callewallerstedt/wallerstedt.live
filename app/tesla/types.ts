export type LiveState = {
  ok: boolean;
  vin?: string;
  speed_kmh: number;
  gear: string;
  battery_percent: number;
  range_km: number;
  connected: boolean;
  age_sec: number;
  stale: boolean;
  latitude?: number | null;
  longitude?: number | null;
  heading?: number | null;
  odometer_km?: number | null;
  outside_temp_c?: number | null;
  destination_name?: string;
  route_traffic_delay_min?: number | null;
  charge_state?: string;
  charge_power_kw?: number | null;
  charge_rate_kmh?: number | null;
  charger_voltage?: number | null;
  charger_amps?: number | null;
  error?: string;
};

export type ChargeEvent = {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_battery: number;
  end_battery: number;
  max_power_kw: number;
  energy_added_pct: number;
  location_lat: number | null;
  location_lon: number | null;
};

export type Trip = {
  id: string;
  vin: string;
  started_at: string;
  ended_at: string | null;
  sample_count: number;
  distance_km: number;
  drive_seconds: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  start_battery: number;
  end_battery: number;
  start_range_km: number;
  end_range_km: number;
  start_lat?: number | null;
  start_lon?: number | null;
  end_lat?: number | null;
  end_lon?: number | null;
  destination: string;
  charge_events: ChargeEvent[];
};

export type TripSample = {
  sampled_at: string;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed_kmh: number;
  gear: string;
  battery_percent: number;
  range_km: number;
  odometer_km: number | null;
  outside_temp_c: number | null;
  destination_name: string;
  route_traffic_delay_min: number | null;
  charge_state: string;
  charge_power_kw: number | null;
};

export type TripDetail = Trip & { samples: TripSample[] };

export type TeslaSettings = {
  token: string;
  wakeWord: string;
  language: "en-US" | "sv-SE";
  openAiKey: string;
  speak: boolean;
  gpsFallback: boolean;
  keepAwake: boolean;
  haptics: boolean;
  demo: boolean;
  refreshMs: 3000 | 5000 | 10000;
};

export type DataSource = "car" | "iphone" | "cached" | "demo";

export type ConnectionState = "demo" | "connecting" | "live" | "stale" | "unauthorized" | "empty" | "offline" | "error";

export type VoicePhase = "unsupported" | "idle" | "arming" | "listening" | "awake" | "thinking" | "speaking" | "error";
