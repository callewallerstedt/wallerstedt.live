"use client";

import { useEffect, useState } from "react";

function remaining(targetIso: string) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) {
    return null;
  }
  const total = Math.floor(diff / 1000);
  return [
    { value: Math.floor(total / 86400), label: "days" },
    { value: Math.floor((total % 86400) / 3600), label: "hrs" },
    { value: Math.floor((total % 3600) / 60), label: "min" },
    { value: total % 60, label: "sec" },
  ];
}

export function Countdown({ targetIso }: { targetIso: string }) {
  const [units, setUnits] = useState(() => remaining(targetIso));

  useEffect(() => {
    const timer = setInterval(() => setUnits(remaining(targetIso)), 1000);
    return () => clearInterval(timer);
  }, [targetIso]);

  if (!units) {
    return null;
  }

  return (
    <div className="wl-countdown" aria-live="off">
      {units.map((unit) => (
        <div key={unit.label}>
          <strong>{String(unit.value).padStart(2, "0")}</strong>
          <span>{unit.label}</span>
        </div>
      ))}
    </div>
  );
}
