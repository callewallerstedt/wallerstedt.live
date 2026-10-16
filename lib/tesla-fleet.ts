import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Pure helpers for the server-side Tesla Fleet API connection that agents
 * (Grokbot) use: token encryption, the command allowlist and a compact
 * vehicle summary. No network or database access here.
 */

const MILES_TO_KM = 1.609344;

/**
 * Commands an agent may send without extra opt-in: climate, charging, lock,
 * sentry, honk/flash, navigation and media. Anything that opens the car,
 * lets it drive, or changes security settings needs TESLA_AGENT_EXTRA_COMMANDS.
 */
export const TESLA_SAFE_COMMANDS = [
  "auto_conditioning_start",
  "auto_conditioning_stop",
  "set_temps",
  "set_preconditioning_max",
  "set_climate_keeper_mode",
  "set_cabin_overheat_protection",
  "set_bioweapon_mode",
  "remote_seat_heater_request",
  "remote_seat_cooler_request",
  "remote_auto_seat_climate_request",
  "remote_steering_wheel_heater_request",
  "remote_auto_steering_wheel_heat_climate_request",
  "charge_start",
  "charge_stop",
  "charge_max_range",
  "charge_standard",
  "set_charge_limit",
  "set_charging_amps",
  "charge_port_door_open",
  "charge_port_door_close",
  "set_scheduled_charging",
  "set_scheduled_departure",
  "add_charge_schedule",
  "remove_charge_schedule",
  "add_precondition_schedule",
  "remove_precondition_schedule",
  "door_lock",
  "set_sentry_mode",
  "honk_horn",
  "flash_lights",
  "remote_boombox",
  "navigation_request",
  "navigation_gps_request",
  "navigation_sc_request",
  "share",
  "media_toggle_playback",
  "media_next_track",
  "media_prev_track",
  "media_next_fav",
  "media_prev_fav",
  "media_volume_down",
  "adjust_volume",
] as const;

const COMMAND_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export function isTeslaCommandName(name: string) {
  return COMMAND_NAME.test(name);
}

/** Extra commands from TESLA_AGENT_EXTRA_COMMANDS ("door_unlock,actuate_trunk" or "*"). */
export function parseExtraCommands(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function teslaCommandAllowed(name: string, extra: string[]) {
  if (!isTeslaCommandName(name)) return false;
  if ((TESLA_SAFE_COMMANDS as readonly string[]).includes(name)) return true;
  return extra.includes("*") || extra.includes(name);
}

export function allowedTeslaCommands(extra: string[]) {
  if (extra.includes("*")) return ["*"];
  return [...new Set([...TESLA_SAFE_COMMANDS, ...extra.filter(isTeslaCommandName)])];
}

/* ------------------------------------------------------------------------ */
/* Token encryption (AES-256-GCM)                                            */
/* ------------------------------------------------------------------------ */

function keyFrom(secret: string) {
  return createHash("sha256").update(`wallerstedt-tesla-token:${secret}`).digest();
}

export function encryptToken(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptToken(sealed: string, secret: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) {
    throw new Error("Unknown token format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/* ------------------------------------------------------------------------ */
/* Vehicle summary                                                            */
/* ------------------------------------------------------------------------ */

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {};
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function str(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

/** Tesla closure flags are 0 (closed) or non-zero (open). */
function isOpen(value: unknown) {
  const flag = num(value);
  return flag === null ? null : flag !== 0;
}

function km(miles: unknown) {
  const value = num(miles);
  return value === null ? null : Math.round(value * MILES_TO_KM * 10) / 10;
}

/** Tesla reports distances and speeds in miles; this returns metric values. */
export function summarizeVehicleData(raw: unknown) {
  const data = dict(raw);
  const charge = dict(data.charge_state);
  const climate = dict(data.climate_state);
  const drive = dict(data.drive_state);
  const vehicle = dict(data.vehicle_state);
  const config = dict(data.vehicle_config);
  const speedKmh = km(drive.speed);
  return {
    vin: str(data.vin),
    name: str(data.display_name) ?? str(vehicle.vehicle_name),
    state: str(data.state),
    model: str(config.car_type),
    battery: {
      percent: num(charge.battery_level),
      usablePercent: num(charge.usable_battery_level),
      rangeKm: km(charge.battery_range),
      estRangeKm: km(charge.est_battery_range),
      chargeLimitPercent: num(charge.charge_limit_soc),
    },
    charging: {
      state: str(charge.charging_state),
      powerKw: num(charge.charger_power),
      amps: num(charge.charger_actual_current),
      requestedAmps: num(charge.charge_current_request),
      minutesToFull: num(charge.minutes_to_full_charge),
      portOpen: bool(charge.charge_port_door_open),
      cableConnected: str(charge.conn_charge_cable),
    },
    climate: {
      on: bool(climate.is_climate_on),
      insideC: num(climate.inside_temp),
      outsideC: num(climate.outside_temp),
      driverSetC: num(climate.driver_temp_setting),
      preconditioning: bool(climate.is_preconditioning),
    },
    security: {
      locked: bool(vehicle.locked),
      sentryMode: bool(vehicle.sentry_mode),
      userPresent: bool(vehicle.is_user_present),
      doorsOpen: ["df", "dr", "pf", "pr"].some((door) => isOpen(vehicle[door])),
      frunkOpen: isOpen(vehicle.ft),
      trunkOpen: isOpen(vehicle.rt),
    },
    drive: {
      gear: str(drive.shift_state) ?? "P",
      speedKmh: speedKmh === null ? 0 : Math.round(speedKmh),
      latitude: num(drive.latitude),
      longitude: num(drive.longitude),
      heading: num(drive.heading),
      destination: str(drive.active_route_destination),
      minutesToArrival: num(drive.active_route_minutes_to_arrival),
    },
    odometerKm: km(vehicle.odometer),
    softwareVersion: str(vehicle.car_version),
  };
}
