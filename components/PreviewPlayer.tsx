"use client";

import { useEffect, useRef, useState } from "react";

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60) || 0;
  const secs = Math.floor(seconds % 60) || 0;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function PreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLabel, setTimeLabel] = useState("0:00 / 0:30");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const sync = () => {
      const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
      setProgress(ratio);
      setTimeLabel(`${formatTime(audio.currentTime)} / ${formatTime(audio.duration || 30)}`);
      setIsPlaying(!audio.paused);
    };

    ["play", "pause", "timeupdate", "loadedmetadata", "ended"].forEach((eventName) => {
      audio.addEventListener(eventName, sync);
    });

    sync();

    return () => {
      ["play", "pause", "timeupdate", "loadedmetadata", "ended"].forEach((eventName) => {
        audio.removeEventListener(eventName, sync);
      });
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  return (
    <div className="audio-card" data-reveal>
      <div className="audio-card__top">
        <div>
          <strong>30-second preview</strong>
          <p>A short clip from <em>midnight</em> for a quick listen.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={toggle}>
          {isPlaying ? "Pause preview" : "Play preview"}
        </button>
      </div>
      <div className="audio-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }}></span>
      </div>
      <div className="audio-meta">
        <span>Muted room, soft attack, late-night feel.</span>
        <span>{timeLabel}</span>
      </div>
      <audio preload="metadata" ref={audioRef} src="/media/midnight-preview.m4a"></audio>
    </div>
  );
}
