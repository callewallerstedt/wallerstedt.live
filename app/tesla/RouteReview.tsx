import { useMemo } from "react";
import { Icons } from "./TeslaIcons";
import type { TripDetail, TripSample } from "./types";

type PlotPoint = { x: number; y: number; sample: TripSample };

function mapPoints(samples: TripSample[]): PlotPoint[] {
  const located = samples.filter((sample) => sample.lat != null && sample.lon != null);
  if (located.length < 2) return [];
  const latitudes = located.map((sample) => sample.lat as number);
  const longitudes = located.map((sample) => sample.lon as number);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latSpan = maxLat - minLat || 0.001;
  const lonSpan = maxLon - minLon || 0.001;
  return located.map((sample) => ({
    sample,
    x: 18 + (((sample.lon as number) - minLon) / lonSpan) * 284,
    y: 172 - (((sample.lat as number) - minLat) / latSpan) * 144,
  }));
}

function speedPath(samples: TripSample[]) {
  if (samples.length < 2) return "";
  const maxSpeed = Math.max(30, ...samples.map((sample) => sample.speed_kmh));
  return samples.map((sample, index) => {
    const x = 4 + (index / (samples.length - 1)) * 312;
    const y = 72 - (sample.speed_kmh / maxSpeed) * 64;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export function RouteReview({ trip }: { trip: TripDetail | null }) {
  const points = useMemo(() => mapPoints(trip?.samples || []), [trip?.samples]);
  const routePath = useMemo(() => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "), [points]);
  const chartPath = useMemo(() => speedPath(trip?.samples || []), [trip?.samples]);
  const first = points[0]?.sample;
  const last = points.at(-1)?.sample;

  if (!trip || !routePath) {
    return (
      <div className="route-empty-v2">
        <span><Icons.Pin size={27} /></span>
        <strong>Route waiting for GPS samples</strong>
        <p>Location appears automatically after the laptop bridge streams the Tesla Location field.</p>
      </div>
    );
  }

  return (
    <div className="route-review">
      <div className="route-canvas">
        <svg viewBox="0 0 320 190" role="img" aria-label="Recorded trip route">
          <defs>
            <linearGradient id="trip-route-gradient" x1="0" x2="1"><stop stopColor="#ffffff" /><stop offset="1" stopColor="#9098a3" /></linearGradient>
            <filter id="trip-route-glow"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          <path className="route-grid-v2" d="M0 47.5h320M0 95h320M0 142.5h320M80 0v190M160 0v190M240 0v190" />
          <path className="route-glow-v2" d={routePath} filter="url(#trip-route-glow)" />
          <path className="route-path-v2" d={routePath} />
          <circle className="route-origin" cx={points[0].x} cy={points[0].y} r="5" />
          <circle className="route-destination" cx={points.at(-1)?.x} cy={points.at(-1)?.y} r="6" />
        </svg>
        {first && last && (
          <a className="open-route-button" href={`https://maps.apple.com/?saddr=${first.lat},${first.lon}&daddr=${last.lat},${last.lon}`} target="_blank" rel="noreferrer">
            Open in Maps <Icons.Chevron size={15} />
          </a>
        )}
      </div>
      {chartPath && (
        <div className="speed-profile">
          <div><span>Speed profile</span><strong>{trip.max_speed_kmh} km/h max</strong></div>
          <svg viewBox="0 0 320 78" preserveAspectRatio="none" role="img" aria-label="Speed over trip">
            <path className="speed-profile-fill" d={`${chartPath} L316 76 L4 76 Z`} />
            <path className="speed-profile-line" d={chartPath} />
          </svg>
        </div>
      )}
    </div>
  );
}
