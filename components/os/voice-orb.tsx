"use client";

import { useEffect, useRef, useState } from "react";

const BARS = 7;

function audioContext() {
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

type OrbPhase = "loading" | "engaging" | "live";

export function VoiceOrb({
  microphone,
  muted,
  mode,
  ready = true,
  onToggle,
  onVoice,
}: {
  microphone: Promise<MediaStream>;
  muted: boolean;
  mode: "idle" | "docked" | "spotlight";
  /** False while session is connecting — hollow spinner, then spin-up into the product orb. */
  ready?: boolean;
  onToggle?: () => void;
  onVoice?: (level: number) => void;
}) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const orb = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  const onVoiceRef = useRef(onVoice);
  const [phase, setPhase] = useState<OrbPhase>(ready ? "engaging" : "loading");
  mutedRef.current = muted;
  onVoiceRef.current = onVoice;

  useEffect(() => {
    if (!ready) {
      setPhase("loading");
      return;
    }
    let settle: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    setPhase((current) => {
      if (current === "live") return "live";
      return "engaging";
    });
    settle = setTimeout(() => {
      if (!cancelled) setPhase("live");
    }, 980);
    return () => {
      cancelled = true;
      clearTimeout(settle);
    };
  }, [ready]);

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    const smoothed = Array(BARS).fill(0.16);
    microphone.then(async (stream) => {
      if (cancelled) return;
      ctx = audioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume();
      if (cancelled) {
        void ctx.close();
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const time = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (cancelled) return;
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);
        let sum = 0;
        for (const sample of time) {
          const delta = (sample - 128) / 128;
          sum += delta * delta;
        }
        const rms = mutedRef.current ? 0 : Math.min(1, Math.sqrt(sum / time.length) * 3.8);
        onVoiceRef.current?.(rms);
        if (orb.current) orb.current.style.setProperty("--os-live-level", rms.toFixed(3));
        const now = performance.now() / 1000;
        const step = Math.max(1, Math.floor(freq.length / (BARS + 2)));
        for (let i = 0; i < BARS; i++) {
          const band = (freq[step * (i + 1)] ?? 0) / 255;
          const ambient = 0.2 + Math.sin(now * 2.6 + i * 0.9) * 0.08 + Math.sin(now * 1.1 + i) * 0.04;
          const spoken = Math.min(1, band * 0.7 + rms * 1.05);
          const target = mutedRef.current ? 0.12 : Math.max(ambient * 0.85, spoken);
          smoothed[i] += (target - smoothed[i]) * 0.42;
          const bar = bars.current[i];
          if (bar) bar.style.height = `${Math.round(16 + smoothed[i] * 84)}%`;
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }, () => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [microphone]);

  const stage = mode === "docked" ? "os-live-stage os-live-stage--docked" : mode === "spotlight" ? "os-live-stage os-live-stage--spotlight" : "os-live-stage";
  const body = (
    <div ref={orb} className={`os-live-orb os-live-orb--${phase}`} aria-busy={phase !== "live"}>
      <div className="os-live-orb-ring" />
      <div className="os-live-orb-face">
        <div className="os-live-wave" aria-hidden={phase !== "live"}>
          {Array.from({ length: BARS }, (_, index) => (
            <span key={index} ref={(node) => { bars.current[index] = node; }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        className={`${stage} os-live-stage--interactive`}
        aria-label={mode === "spotlight" ? "Show full transcript" : "Focus latest reply"}
        aria-pressed={mode === "spotlight"}
        onClick={onToggle}
      >
        {body}
      </button>
    );
  }

  return <div className={stage} aria-hidden>{body}</div>;
}
