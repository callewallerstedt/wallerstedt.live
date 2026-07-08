"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TripSummary = {
  id: string;
  started_at: string;
  ended_at: string | null;
  distance_km: number;
  drive_seconds: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  start_battery: number;
  end_battery: number;
  start_range_km: number;
  end_range_km: number;
  destination: string;
};

type TripSample = {
  sampled_at: string;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed_kmh: number;
  gear: string;
  battery_percent: number;
  range_km: number;
  route_line?: string;
};

type ChargeEvent = {
  started_at: string;
  ended_at: string | null;
  energy_added_pct: number;
  max_power_kw: number;
  location_lat: number | null;
  location_lon: number | null;
};

type TripDetail = TripSummary & {
  samples: TripSample[];
  charge_events: ChargeEvent[];
};

declare global {
  interface Window {
    L?: any;
  }
}

function formatDate(value: string | null) {
  if (!value) return "Live";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function TeslaTripsPage() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const plannedRouteRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const [leafletReady, setLeafletReady] = useState(false);
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selected, setSelected] = useState<TripDetail | null>(null);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    const stored = window.localStorage.getItem("teslaTripToken") || "";
    setToken(stored);
    setSavedToken(stored);
  }, []);

  useEffect(() => {
    if (window.L) {
      setLeafletReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-leaflet="true"]');
    if (existing) {
      existing.addEventListener("load", () => setLeafletReady(true), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.crossOrigin = "";
    script.dataset.leaflet = "true";
    script.onload = () => setLeafletReady(true);
    script.onerror = () => setStatus("Map library failed to load.");
    document.body.appendChild(script);
  }, []);

  const api = useCallback(
    async <T,>(path: string): Promise<T> => {
      const response = await fetch(path, {
        headers: { "X-Aios-Token": savedToken },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `Request failed ${response.status}`);
      return data as T;
    },
    [savedToken],
  );

  const decodeRouteLine = useCallback((encodedBase64: string) => {
    try {
      const encoded = window.atob(encodedBase64);
      const points: [number, number][] = [];
      let index = 0;
      let lat = 0;
      let lon = 0;
      while (index < encoded.length) {
        let result = 0;
        let shift = 0;
        let byte = 0;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20 && index < encoded.length);
        lat += result & 1 ? ~(result >> 1) : result >> 1;

        result = 0;
        shift = 0;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20 && index < encoded.length);
        lon += result & 1 ? ~(result >> 1) : result >> 1;
        points.push([lat / 1e6, lon / 1e6]);
      }
      return points;
    } catch {
      return [];
    }
  }, []);

  const loadTrip = useCallback(
    async (tripId: string) => {
      setStatus("Loading route...");
      const data = await api<{ ok: true; trip: TripDetail }>(`/api/tesla/trips/${tripId}`);
      setSelected(data.trip);
      setStatus(data.trip.ended_at ? "Trip loaded" : "Live trip loaded");
    },
    [api],
  );

  const refreshTrips = useCallback(
    async (preferredTripId?: string | null) => {
      if (!savedToken) {
        setStatus("Enter your aiOS token to load private trip logs.");
        return;
      }
      setStatus("Loading trips...");
      const data = await api<{ ok: true; trips: TripSummary[] }>("/api/tesla/trips");
      const nextTrips = data.trips || [];
      setTrips(nextTrips);
      const nextTripId =
        preferredTripId && nextTrips.some((trip) => trip.id === preferredTripId)
          ? preferredTripId
          : nextTrips[0]?.id;
      if (nextTripId) await loadTrip(nextTripId);
      else {
        setSelected(null);
        setStatus("No trips recorded yet. Drive with telemetry streaming and this will fill in.");
      }
    },
    [api, loadTrip, savedToken],
  );

  useEffect(() => {
    if (!savedToken) {
      setStatus("Enter your aiOS token to load private trip logs.");
      return;
    }
    void refreshTrips(selected?.id);
    const timer = window.setInterval(() => {
      void refreshTrips(selected?.ended_at ? selected.id : selected?.id);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [refreshTrips, savedToken, selected?.ended_at, selected?.id]);

  useEffect(() => {
    if (!leafletReady || !mapNodeRef.current || !window.L) return;
    const L = window.L;
    if (!mapRef.current) {
      mapRef.current = L.map(mapNodeRef.current, { zoomControl: false, worldCopyJump: true });
      L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(mapRef.current);
      mapRef.current.setView([57.7089, 11.9746], 8);
    }
  }, [leafletReady]);

  useEffect(() => {
    if (!leafletReady || !window.L || !mapRef.current) return;
    const L = window.L;
    if (routeRef.current) routeRef.current.remove();
    if (plannedRouteRef.current) plannedRouteRef.current.remove();
    markerRefs.current.forEach((marker) => marker.remove());
    routeRef.current = null;
    plannedRouteRef.current = null;
    markerRefs.current = [];

    const points = (selected?.samples || [])
      .filter((sample) => sample.lat != null && sample.lon != null)
      .map((sample) => [sample.lat, sample.lon]);
    const plannedRouteLine = [...(selected?.samples || [])]
      .reverse()
      .find((sample) => sample.route_line?.trim())?.route_line;
    const plannedPoints = plannedRouteLine ? decodeRouteLine(plannedRouteLine) : [];
    if (!points.length) {
      mapRef.current.setView([57.7089, 11.9746], 8);
      return;
    }

    if (plannedPoints.length > 1) {
      plannedRouteRef.current = L.polyline(plannedPoints, {
        color: "#ffd166",
        weight: 4,
        opacity: 0.78,
        dashArray: "8 10",
        lineJoin: "round",
      }).addTo(mapRef.current);
    }
    routeRef.current = L.polyline(points, {
      color: "#4fd1c5",
      weight: 5,
      opacity: 0.92,
      lineJoin: "round",
    }).addTo(mapRef.current);
    const start = L.circleMarker(points[0], {
      radius: 7,
      color: "#ffffff",
      fillColor: "#20c997",
      fillOpacity: 1,
      weight: 2,
    }).addTo(mapRef.current).bindPopup("Start");
    const end = L.circleMarker(points[points.length - 1], {
      radius: 7,
      color: "#ffffff",
      fillColor: selected?.ended_at ? "#ff6b6b" : "#ffd166",
      fillOpacity: 1,
      weight: 2,
    }).addTo(mapRef.current).bindPopup(selected?.ended_at ? "End" : "Latest");
    markerRefs.current.push(start, end);

    (selected?.charge_events || []).forEach((event) => {
      if (event.location_lat == null || event.location_lon == null) return;
      markerRefs.current.push(
        L.marker([event.location_lat, event.location_lon])
          .addTo(mapRef.current)
          .bindPopup(`Charging - +${event.energy_added_pct || 0}% - max ${Math.round(event.max_power_kw || 0)} kW`),
      );
    });
    mapRef.current.fitBounds(routeRef.current.getBounds(), { padding: [42, 42], maxZoom: 15 });
  }, [decodeRouteLine, leafletReady, selected]);

  const saveToken = () => {
    const next = token.trim();
    window.localStorage.setItem("teslaTripToken", next);
    setSavedToken(next);
    void refreshTrips(selected?.id);
  };

  const samples = selected?.samples || [];
  const gpsCount = samples.filter((sample) => sample.lat != null && sample.lon != null).length;
  const topSpeed = Math.max(1, ...samples.map((sample) => sample.speed_kmh || 0));

  return (
    <main className="tesla-trip-shell">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <section ref={mapNodeRef} className="tesla-trip-map" aria-label="Tesla trip map" />
      <aside className="tesla-trip-panel">
        <div className="trip-panel-top">
          <p className="trip-kicker">Tesla trip log</p>
          <h1>{selected?.destination || "Route archive"}</h1>
          <p>
            {selected
              ? `${formatDate(selected.started_at)} - ${selected.ended_at ? "complete" : "live"}`
              : "Live position, charging, speed and battery history."}
          </p>
        </div>
        <div className="trip-token-row">
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder="aiOS token"
            aria-label="aiOS token"
          />
          <button type="button" onClick={saveToken}>Load</button>
          <button type="button" onClick={() => void refreshTrips(selected?.id)}>Refresh</button>
        </div>
        <div className="trip-stat-grid">
          {[
            ["Distance", `${Number(selected?.distance_km || 0).toFixed(1)} km`],
            ["Time", formatDuration(selected?.drive_seconds || 0)],
            ["Max", `${selected?.max_speed_kmh || 0} km/h`],
            ["Avg", `${Math.round(selected?.avg_speed_kmh || 0)} km/h`],
            ["Battery", `${selected?.start_battery ?? "--"}% to ${selected?.end_battery ?? "--"}%`],
            ["Range", `${selected?.start_range_km ?? "--"} to ${selected?.end_range_km ?? "--"} km`],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="trip-timeline-wrap">
          <div className="trip-timeline-head">
            <span>Speed trace</span>
            <small>{samples.length} samples - {gpsCount} GPS points</small>
          </div>
          <div className="trip-timeline">
            {samples.slice(-140).map((sample) => {
              const speed = Math.max(0, sample.speed_kmh || 0);
              return (
                <span
                  key={sample.sampled_at}
                  style={{ height: `${Math.max(4, (speed / topSpeed) * 70)}%` }}
                  title={`${new Date(sample.sampled_at).toLocaleTimeString()} - ${speed} km/h - ${sample.battery_percent}%`}
                />
              );
            })}
          </div>
        </div>
        <p className="trip-status">{status}</p>
        <div className="trip-list">
          {trips.map((trip) => (
            <button
              className={`trip-item ${selected?.id === trip.id ? "is-active" : ""}`}
              key={trip.id}
              type="button"
              onClick={() => void loadTrip(trip.id)}
            >
              <span>{formatDate(trip.started_at)}</span>
              <strong>{Number(trip.distance_km || 0).toFixed(1)} km</strong>
              <small>
                {formatDuration(trip.drive_seconds)} - max {trip.max_speed_kmh || 0} km/h -{" "}
                {trip.start_battery ?? "--"}% to {trip.end_battery ?? "--"}%
              </small>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
