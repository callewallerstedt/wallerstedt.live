import type { Trip } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatAge(seconds: number) {
  if (!Number.isFinite(seconds)) return "Unknown";
  if (seconds < 2) return "Live now";
  if (seconds < 60) return `${Math.round(seconds)} sec ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} hr ago`;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
}

export function formatTripName(trip: Trip) {
  if (trip.destination.trim()) return trip.destination;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(trip.started_at));
}

export function formatCoordinate(value: number | null | undefined) {
  return value == null ? "--" : value.toFixed(5);
}

export function cardinalHeading(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "--";
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${directions[Math.round(value / 45) % 8]} ${Math.round(value)}°`;
}
