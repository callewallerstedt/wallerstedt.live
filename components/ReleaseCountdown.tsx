"use client";

import { useEffect, useState } from "react";

function getTimeLeft(targetIso: string) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

export function ReleaseCountdown({
  targetIso,
  label = "Releases in",
}: {
  targetIso: string;
  label?: string;
}) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetIso));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(targetIso));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetIso]);

  if (!timeLeft) {
    return null;
  }

  const units = [
    { value: timeLeft.days, label: "days" },
    { value: timeLeft.hours, label: "hours" },
    { value: timeLeft.minutes, label: "minutes" },
    { value: timeLeft.seconds, label: "seconds" },
  ];

  return (
    <div className="countdown-card" aria-live="polite">
      <p className="eyebrow">{label}</p>
      <div className="countdown-grid">
        {units.map((unit) => (
          <div key={unit.label} className="countdown-unit">
            <strong>{String(unit.value).padStart(2, "0")}</strong>
            <span>{unit.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
