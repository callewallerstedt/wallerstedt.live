import { Icons } from "./TeslaIcons";
import { cardinalHeading, clamp, formatCoordinate } from "./format";
import type { PhoneLocation } from "./useDriveEnvironment";
import type { DataSource, LiveState } from "./types";

type DriveViewProps = {
  live: LiveState;
  speedKmh: number;
  source: DataSource;
  phoneLocation: PhoneLocation | null;
  locationError: string;
  needsSetup: boolean;
  previewData: boolean;
  onOpenSettings: () => void;
};

const sourceLabels: Record<DataSource, string> = {
  car: "CAR TELEMETRY",
  iphone: "IPHONE GPS",
  cached: "LAST KNOWN",
  demo: "DEMO DRIVE",
};

export function DriveView({ live, speedKmh, source, phoneLocation, locationError, needsSetup, previewData, onOpenSettings }: DriveViewProps) {
  const battery = live.battery_percent < 0 ? 0 : live.battery_percent;
  const range = live.range_km < 0 ? null : live.range_km;
  const latitude = live.latitude ?? phoneLocation?.latitude ?? null;
  const longitude = live.longitude ?? phoneLocation?.longitude ?? null;
  const heading = live.heading ?? phoneLocation?.heading ?? null;
  const charging = Boolean(live.charge_power_kw && live.charge_power_kw > 0);

  return (
    <section className="drive-view-v2" aria-label="Live drive dashboard">
      {needsSetup && (
        <button className="setup-banner" onClick={onOpenSettings}>
          <span className="setup-banner-icon"><Icons.Shield size={20} /></span>
          <span><strong>Connect your live Tesla data</strong><small>Enter the existing connection token once on this iPhone</small></span>
          <Icons.Chevron size={18} />
        </button>
      )}

      <div className="instrument-panel">
        <div className="instrument-source"><span className={source === "car" ? "is-live" : ""} />{sourceLabels[source]}</div>
        <div className="speed-cluster">
          <span className="drive-gear" aria-label={`Gear ${live.gear}`}>{live.gear || "P"}</span>
          <strong className="drive-speed">{Math.max(0, Math.round(speedKmh))}</strong>
        </div>
        <span className="speed-label">km/h</span>
        <div className="speed-gauge" aria-hidden="true">
          <i style={{ width: `${clamp(speedKmh / 1.6, 0, 100)}%` }} />
        </div>
        {previewData && <span className="preview-chip"><Icons.Eye size={12} /> Preview data</span>}
      </div>

      <div className="drive-info-grid">
        <article className="drive-card battery-panel">
          <header><span><Icons.Battery size={19} /> Battery</span><strong>{live.battery_percent < 0 ? "--" : `${live.battery_percent}%`}</strong></header>
          <div className="charge-track"><span className={battery < 20 ? "is-low" : ""} style={{ width: `${clamp(battery, 0, 100)}%` }} /></div>
          <footer><strong>{range == null ? "--" : `${range} km`}</strong><span>estimated range</span></footer>
        </article>

        <article className="drive-card destination-panel">
          <header><span><Icons.Pin size={19} /> {live.destination_name || "Current drive"}</span></header>
          <div className="metric-pair">
            <div><strong>{live.outside_temp_c == null ? "--" : `${Math.round(live.outside_temp_c)}°`}</strong><span>outside</span></div>
            <div><strong>{live.route_traffic_delay_min == null ? "--" : `+${Math.round(live.route_traffic_delay_min)}m`}</strong><span>traffic</span></div>
          </div>
        </article>

        <article className="drive-card vehicle-panel">
          <div className="model-three" aria-hidden="true"><span className="car-roof" /><span className="car-body" /><i /><b /></div>
          <div className="vehicle-copy">
            <span className={live.connected ? "connected" : "sleeping"}>{live.connected ? "Vehicle connected" : "Vehicle sleeping"}</span>
            <strong>{live.odometer_km == null ? "Model 3" : `${Math.round(live.odometer_km).toLocaleString()} km`}</strong>
          </div>
        </article>

        <article className="drive-card location-panel">
          <header><span><Icons.Compass size={19} /> Position</span><strong>{cardinalHeading(heading)}</strong></header>
          <div className="location-values"><span>{formatCoordinate(latitude)}</span><span>{formatCoordinate(longitude)}</span></div>
          <footer><span>{phoneLocation ? `iPhone accuracy ±${Math.round(phoneLocation.accuracyM)} m` : locationError || "Waiting for location"}</span></footer>
        </article>

        {charging && (
          <article className="drive-card charging-panel">
            <span className="charge-icon"><Icons.Bolt size={24} /></span>
            <span><small>Charging now</small><strong>{Math.round(live.charge_power_kw || 0)} kW</strong></span>
            <span><small>Charge speed</small><strong>{live.charge_rate_kmh ? `${Math.round(live.charge_rate_kmh)} km/h` : live.charge_state || "Active"}</strong></span>
            <span><small>Input</small><strong>{live.charger_voltage ? `${Math.round(live.charger_voltage)} V` : "--"}{live.charger_amps ? ` · ${Math.round(live.charger_amps)} A` : ""}</strong></span>
          </article>
        )}
      </div>
    </section>
  );
}
