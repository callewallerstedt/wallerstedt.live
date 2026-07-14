"use client";

import { useEffect, useState } from "react";

export type PhoneLocation = {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  heading: number | null;
  accuracyM: number;
  updatedAt: number;
};

export function useDriveEnvironment({ gpsEnabled, keepAwake }: { gpsEnabled: boolean; keepAwake: boolean }) {
  const [phoneLocation, setPhoneLocation] = useState<PhoneLocation | null>(null);
  const [locationError, setLocationError] = useState("");
  const [online, setOnline] = useState(true);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!gpsEnabled || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocationError("");
        setPhoneLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speedKmh: position.coords.speed == null || position.coords.speed < 0 ? null : Math.round(position.coords.speed * 3.6),
          heading: position.coords.heading,
          accuracyM: position.coords.accuracy,
          updatedAt: position.timestamp,
        });
      },
      (error) => setLocationError(error.code === 1 ? "Location permission is off" : "iPhone GPS is unavailable"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsEnabled]);

  useEffect(() => {
    if (!keepAwake || !("wakeLock" in navigator)) return;
    let cancelled = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        const nextLock = await navigator.wakeLock.request("screen");
        if (cancelled) void nextLock.release();
        else {
          lock = nextLock;
          nextLock.addEventListener("release", () => {
            if (lock === nextLock) lock = null;
          }, { once: true });
        }
      } catch {
        // Safari can reject this until the PWA is foregrounded or installed.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !lock) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [keepAwake]);

  return { phoneLocation, locationError, online, clock };
}
