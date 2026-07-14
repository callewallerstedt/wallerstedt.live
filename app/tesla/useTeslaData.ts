"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_LIVE, DEMO_TRIP, DEMO_TRIPS } from "./config";
import type { ConnectionState, LiveState, TeslaSettings, Trip, TripDetail } from "./types";

type ApiResult<T> = T & { ok: boolean; error?: string };

export function useTeslaData(settings: TeslaSettings, hydrated: boolean, online: boolean) {
  const [live, setLive] = useState<LiveState>(DEMO_LIVE);
  const [trips, setTrips] = useState<Trip[]>(DEMO_TRIPS);
  const [selectedTripId, setSelectedTripId] = useState(DEMO_TRIP.id);
  const [tripDetail, setTripDetail] = useState<TripDetail | null>(DEMO_TRIP);
  const [connection, setConnection] = useState<ConnectionState>("demo");
  const [message, setMessage] = useState("Preview data");
  const [refreshing, setRefreshing] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);

  const headers = useCallback(() => ({ "X-Aios-Token": settings.token }), [settings.token]);
  const usingPreview = settings.demo || !settings.token;

  const refreshLive = useCallback(async () => {
    if (!hydrated) return;
    if (usingPreview) {
      setLive(DEMO_LIVE);
      setConnection("demo");
      setMessage(settings.demo ? "Demo mode" : "Add your connection token");
      return;
    }
    if (!online) {
      setConnection("offline");
      setMessage("iPhone is offline");
      return;
    }

    liveAbortRef.current?.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;
    setRefreshing(true);
    setConnection((current) => current === "live" || current === "stale" ? current : "connecting");
    try {
      const response = await fetch("/api/tesla/live", {
        headers: headers(),
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json() as ApiResult<LiveState>;
      if (response.status === 401) {
        setConnection("unauthorized");
        setMessage("Connection token was rejected");
        return;
      }
      if (!data.ok) {
        setLive(DEMO_LIVE);
        setConnection("empty");
        setMessage("Waiting for first telemetry");
        return;
      }
      setLive(data);
      setLastSuccessAt(Date.now());
      setConnection(data.stale ? "stale" : "live");
      setMessage(data.stale ? "Car stream paused" : "Fleet Telemetry live");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setConnection("error");
        setMessage("Could not reach your telemetry API");
      }
    } finally {
      if (liveAbortRef.current === controller) setRefreshing(false);
    }
  }, [headers, hydrated, online, settings.demo, usingPreview]);

  const refreshTrips = useCallback(async () => {
    if (!hydrated || usingPreview || !online) {
      if (usingPreview) {
        setTrips(DEMO_TRIPS);
        setSelectedTripId((current) => current || DEMO_TRIP.id);
      }
      return;
    }
    try {
      const response = await fetch("/api/tesla/trips", { headers: headers(), cache: "no-store" });
      const data = await response.json() as { ok: boolean; trips?: Trip[] };
      if (!response.ok || !data.ok) return;
      const nextTrips = data.trips || [];
      setTrips(nextTrips);
      setSelectedTripId((current) => nextTrips.some((trip) => trip.id === current) ? current : nextTrips[0]?.id || "");
    } catch {
      // Live driving information remains useful if trip history is temporarily unavailable.
    }
  }, [headers, hydrated, online, usingPreview]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshLive(), refreshTrips()]);
  }, [refreshLive, refreshTrips]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshAll();
    let liveTimer = 0;
    let tripTimer = 0;
    const schedule = () => {
      window.clearInterval(liveTimer);
      window.clearInterval(tripTimer);
      if (document.visibilityState !== "visible") return;
      liveTimer = window.setInterval(() => void refreshLive(), settings.refreshMs);
      tripTimer = window.setInterval(() => void refreshTrips(), 30000);
    };
    const onVisibility = () => {
      schedule();
      if (document.visibilityState === "visible") void refreshAll();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(liveTimer);
      window.clearInterval(tripTimer);
      liveAbortRef.current?.abort();
    };
  }, [hydrated, refreshAll, refreshLive, refreshTrips, settings.refreshMs]);

  useEffect(() => {
    if (usingPreview) {
      setTripDetail(selectedTripId === DEMO_TRIP.id ? DEMO_TRIP : null);
      return;
    }
    if (!selectedTripId || !online) {
      setTripDetail(null);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/tesla/trips/${encodeURIComponent(selectedTripId)}`, {
          headers: headers(),
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json() as { ok: boolean; trip?: TripDetail };
        if (data.ok && data.trip) setTripDetail(data.trip);
      } catch {
        // The trip summary stays visible if detail loading is interrupted.
      }
    })();
    return () => controller.abort();
  }, [headers, online, selectedTripId, usingPreview]);

  return {
    live,
    trips,
    selectedTripId,
    setSelectedTripId,
    tripDetail,
    connection,
    message,
    refreshing,
    lastSuccessAt,
    usingPreview,
    refreshAll,
  };
}
