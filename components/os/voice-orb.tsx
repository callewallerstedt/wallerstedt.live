"use client";

import { useEffect, useRef } from "react";

const BARS = 5;

function audioContext() {
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function VoiceOrb({
  microphone,
  muted,
  mode,
  onToggle,
  onVoice,
}: {
  microphone: Promise<MediaStream>;
  muted: boolean;
  mode: "idle" | "docked" | "spotlight";
  onToggle?: () => void;
  onVoice?: (level: number) => void;
}) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const mutedRef = useRef(muted);
  const onVoiceRef = useRef(onVoice);
  mutedRef.current = muted;
  onVoiceRef.current = onVoice;

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    const smoothed = Array(BARS).fill(0.12);
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
      analyser.smoothingTimeConstant = 0.72;
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
        const rms = mutedRef.current ? 0 : Math.min(1, Math.sqrt(sum / time.length) * 3.4);
        onVoiceRef.current?.(rms);
        const step = Math.max(1, Math.floor(freq.length / (BARS + 3)));
        for (let i = 0; i < BARS; i++) {
          const band = (freq[step * (i + 1)] ?? 0) / 255;
          const target = mutedRef.current ? 0.1 : Math.max(0.1, Math.min(1, band * 0.55 + rms * 0.95));
          smoothed[i] += (target - smoothed[i]) * 0.38;
          const bar = bars.current[i];
          if (bar) bar.style.height = `${Math.round(14 + smoothed[i] * 86)}%`;
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
  const orb = (
    <div className="os-live-orb">
      <div className="os-live-orb-face">
        <div className="os-live-wave">
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
        {orb}
      </button>
    );
  }

  return <div className={stage} aria-hidden>{orb}</div>;
}
