import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedTeslaCommands,
  decryptToken,
  encryptToken,
  parseExtraCommands,
  summarizeVehicleData,
  teslaCommandAllowed,
} from "./tesla-fleet";

test("tokens round-trip and fail with the wrong secret", () => {
  const sealed = encryptToken("refresh-token-value", "secret-a");
  assert.ok(sealed.startsWith("v1."));
  assert.ok(!sealed.includes("refresh-token-value"));
  assert.equal(decryptToken(sealed, "secret-a"), "refresh-token-value");
  assert.throws(() => decryptToken(sealed, "secret-b"));
  assert.notEqual(encryptToken("same", "k"), encryptToken("same", "k"));
});

test("safe commands are allowed, risky ones need opt-in", () => {
  assert.equal(teslaCommandAllowed("set_temps", []), true);
  assert.equal(teslaCommandAllowed("door_lock", []), true);
  assert.equal(teslaCommandAllowed("door_unlock", []), false);
  assert.equal(teslaCommandAllowed("remote_start_drive", []), false);
  assert.equal(teslaCommandAllowed("door_unlock", parseExtraCommands(" Door_Unlock , actuate_trunk")), true);
  assert.equal(teslaCommandAllowed("remote_start_drive", parseExtraCommands("*")), true);
  assert.equal(teslaCommandAllowed("../wake_up", ["*"]), false);
  assert.deepEqual(allowedTeslaCommands(["*"]), ["*"]);
  assert.ok(allowedTeslaCommands(["door_unlock"]).includes("door_unlock"));
});

test("vehicle summary converts miles to km and reads closures", () => {
  const summary = summarizeVehicleData({
    vin: "5YJ3E1EA0PF000001",
    display_name: "Blixten",
    state: "online",
    charge_state: { battery_level: 80, battery_range: 200, charging_state: "Charging", charger_power: 11 },
    climate_state: { is_climate_on: true, inside_temp: 21.5, outside_temp: 4 },
    drive_state: { shift_state: null, speed: 10, latitude: 59.3, longitude: 18.07 },
    vehicle_state: { locked: true, sentry_mode: false, df: 0, dr: 0, pf: 0, pr: 1, ft: 0, odometer: 1000 },
  });
  assert.equal(summary.name, "Blixten");
  assert.equal(summary.battery.percent, 80);
  assert.equal(summary.battery.rangeKm, 321.9);
  assert.equal(summary.charging.state, "Charging");
  assert.equal(summary.climate.on, true);
  assert.equal(summary.security.locked, true);
  assert.equal(summary.security.doorsOpen, true);
  assert.equal(summary.security.frunkOpen, false);
  assert.equal(summary.security.trunkOpen, null);
  assert.equal(summary.drive.gear, "P");
  assert.equal(summary.drive.speedKmh, 16);
  assert.equal(summary.odometerKm, 1609.3);
});

test("vehicle summary tolerates an empty payload", () => {
  const summary = summarizeVehicleData(null);
  assert.equal(summary.vin, null);
  assert.equal(summary.battery.percent, null);
  assert.equal(summary.security.doorsOpen, false);
});
